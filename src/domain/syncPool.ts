import { LinkInvalidError, LinkParseError, NetworkError } from './errors'
import type { ParsedGachaLink } from './link'
import type { ClockPort, GachaApiPort, PoolQueryRequest, StoragePort } from './ports'
import { mergeRecords, toDomainRecords, type GachaRecord, type RawApiItem } from './records'

/** 网络类失败重试次数(D3:失败重试 3 次,即首次之外最多再试 3 次) */
export const SYNC_RETRY_LIMIT = 3
/** 相邻尝试间隔(下限 600ms 的社区共识内取 1s,D3) */
export const RETRY_INTERVAL_MS = 1000

export interface SyncDeps {
  api: GachaApiPort
  storage: StoragePort
  clock: ClockPort
}

export interface SyncPoolResult {
  poolCode: number
  /** 本池本次拉取到的记录数 */
  fetched: number
  /** 合并去重后真正新增入库的记录数 */
  added: number
  /** 同步完成后该档案的本地记录总数 */
  total: number
}

interface ApiEnvelope {
  code?: number
  message?: string
  data?: RawApiItem[]
}

function parseEnvelope(raw: string): ApiEnvelope {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object') return parsed as ApiEnvelope
  } catch {
    // 返回体不是 JSON(如网关异常页),按网络/协议类失败处理
  }
  throw new NetworkError('官方接口返回数据异常,请稍后重试')
}

/** 单次尝试:请求与返回体校验在同一层,返回体异常与请求失败同受重试保护 */
async function tryQuery(request: PoolQueryRequest, deps: SyncDeps): Promise<ApiEnvelope> {
  return parseEnvelope(await deps.api.queryPool(request))
}

/** 网络类失败按限次重试;链接失效/确定性失败等其余错误重试前先分类,立即抛出不重试 */
async function queryWithRetry(request: PoolQueryRequest, deps: SyncDeps): Promise<ApiEnvelope> {
  let lastError = new NetworkError()
  for (let attempt = 0; attempt <= SYNC_RETRY_LIMIT; attempt++) {
    if (attempt > 0) await deps.clock.sleep(RETRY_INTERVAL_MS)
    try {
      return await tryQuery(request, deps)
    } catch (error) {
      if (!(error instanceof NetworkError)) throw error
      lastError = error
    }
  }
  throw lastError
}

function cardPoolIdFromLink(link: ParsedGachaLink): number | null {
  const parsed = Number(link.gachaId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * 单池曳光弹:链接参数 → 单池一次请求(全量、时间倒序、无分页)→ 合并去重 → 事务入库。
 * 限速与重试在前端完成,Rust 侧只发一次(D1)。
 */
export async function syncPool(link: ParsedGachaLink, deps: SyncDeps): Promise<SyncPoolResult> {
  const poolCode = Number(link.gachaType)
  if (!Number.isInteger(poolCode) || poolCode <= 0) {
    throw new LinkParseError(`链接的 gacha_type 参数不合法:${link.gachaType}`)
  }

  const request: PoolQueryRequest = {
    region: link.region,
    playerId: link.playerId,
    recordId: link.recordId,
    cardPoolId: link.resourcesId,
    cardPoolType: poolCode,
    serverId: link.svrId,
    languageCode: link.lang,
  }

  const envelope = await queryWithRetry(request, deps)
  if ((envelope.code ?? 0) !== 0) {
    // code != 0 是 HTTP 200 下的合法响应:链接失效,重试无意义(research §3.2)
    throw new LinkInvalidError()
  }

  const incoming: GachaRecord[] = toDomainRecords(envelope.data ?? [], poolCode, cardPoolIdFromLink(link))
  const existing = await deps.storage.loadRecords(link.playerId)
  const { records, added } = mergeRecords(existing, incoming)
  if (added.length > 0) {
    await deps.storage.insertRecords(link.playerId, added)
  }
  return { poolCode, fetched: incoming.length, added: added.length, total: records.length }
}
