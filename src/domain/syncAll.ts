import type { ParsedGachaLink } from './link'
import type { SyncDeps } from './syncPool'
import { syncPoolCode, type SyncPoolResult } from './syncPool'

/** 全池同步覆盖的卡池 code:开放式枚举 1..=13(官方已确认集合,未知 code 由展示层兜底,D3) */
export const FULL_SYNC_POOL_CODES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
/** 相邻池请求间隔默认 1s(D3) */
export const POOL_INTERVAL_MS = 1000
/** 限速下限 600ms(社区共识 0.6–1s,D3) */
export const POOL_INTERVAL_MIN_MS = 600

/** 全池同步进度:x/13 中的 x 为正在请求的第几个池 */
export interface SyncAllProgress {
  index: number
  total: number
  /** 正在请求的池 code */
  poolCode: number
}

export interface SyncAllResult {
  /** 各池明细(按请求顺序;中止时仅含已完成的池) */
  pools: SyncPoolResult[]
  /** 各池拉取记录数合计 */
  fetched: number
  /** 各池新增入库合计 */
  added: number
  /** 同步完成后档案记录总数(末池合并后的全量) */
  total: number
}

/**
 * 全池编排:对已知卡池 code 逐池串行调用单池拉取(手动粘贴与一键获取共用管线),
 * 相邻池请求间隔经时钟注入;任一池链接失效(code != 0)立即停止且不重试,
 * 已拉到的池数据照常入库保留,错误上抛由 UI 进入失效引导。其余错误同样中止本次同步。
 */
export async function syncAll(
  link: ParsedGachaLink,
  deps: SyncDeps,
  onProgress?: (progress: SyncAllProgress) => void,
): Promise<SyncAllResult> {
  const pools: SyncPoolResult[] = []
  for (const [offset, poolCode] of FULL_SYNC_POOL_CODES.entries()) {
    onProgress?.({ index: offset + 1, total: FULL_SYNC_POOL_CODES.length, poolCode })
    pools.push(await syncPoolCode(link, poolCode, deps))
    if (offset < FULL_SYNC_POOL_CODES.length - 1) {
      await deps.clock.sleep(POOL_INTERVAL_MS)
    }
  }
  return {
    pools,
    fetched: pools.reduce((sum, pool) => sum + pool.fetched, 0),
    added: pools.reduce((sum, pool) => sum + pool.added, 0),
    total: pools[pools.length - 1]?.total ?? 0,
  }
}
