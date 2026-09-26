import type { ServerRegion } from './link'
import type { GachaRecord } from './records'

/** 单池查询请求:字段与官方 gacha/record/query 请求体一一对应(全部来自链接参数,D3) */
export interface PoolQueryRequest {
  region: ServerRegion
  playerId: string
  /** 鉴权 token,会过期 */
  recordId: string
  /** URL 的 resources_id(资源版本 hash,各卡池共用) */
  cardPoolId: string
  cardPoolType: number
  serverId: string
  languageCode: string
}

/** 官方 API 端口:单池一次 POST,返回原始 JSON 文本(解析与判定在 domain)。
 *  错误契约:网络类失败(连接/超时/HTTP 非 2xx/返回体异常)以 NetworkError 抛出,
 *  确定性失败以其他 DomainError 抛出——domain 的重试分类以此为据 */
export interface GachaApiPort {
  queryPool(request: PoolQueryRequest): Promise<string>
}

/** 存储端口:本地 SQLite 档案读写 */
export interface StoragePort {
  loadRecords(playerId: string): Promise<GachaRecord[]>
  /** 批量写入应事务化;返回实际新插入行数 */
  insertRecords(playerId: string, records: readonly GachaRecord[]): Promise<number>
}

/** 时钟端口:重试/限速间隔注入,测试用假时钟 */
export interface ClockPort {
  now(): number
  sleep(ms: number): Promise<void>
}
