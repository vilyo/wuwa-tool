/** 本地档案中的单条唤取记录(落库口径,JSON 字段名与官方返回对齐见 D2) */
export interface GachaRecord {
  /** 数字池 code:取「本池请求时已知的 code」;API 返回的 cardPoolType 是中文池名,禁止用于匹配(D2) */
  cardPoolType: number
  /** 链接 gacha_id 解析出的数字,无法解析时为 null */
  cardPoolId: number | null
  /** 服务器时间字符串,如 `2025-05-01 10:00:00` */
  time: string
  name: string
  qualityLevel: number
  resourceId: string
  resourceType: string
}

/** 官方返回体中的单条记录;中文池名等字段仅透传展示,不参与任何匹配(research §2.3) */
export interface RawApiItem {
  cardPoolType?: string
  resourceId?: number | string
  qualityLevel?: number
  resourceType?: string
  name?: string
  time?: string
  count?: number
}

/** 去重/档案键:time + name + qualityLevel + cardPoolType(D2 唯一索引同键) */
export function recordKey(record: GachaRecord): string {
  return JSON.stringify([record.time, record.name, record.qualityLevel, record.cardPoolType])
}

export interface MergeResult {
  /** 合并后的全量记录(既有在前、新增追加其后),不改写入参 */
  records: GachaRecord[]
  /** 本次真正新增的部分 */
  added: GachaRecord[]
}

/** 合并去重:按组合键只增不减(D2);与 DB 层 INSERT OR IGNORE 语义一致 */
export function mergeRecords(
  existing: readonly GachaRecord[],
  incoming: readonly GachaRecord[],
): MergeResult {
  const seen = new Set(existing.map(recordKey))
  const records = [...existing]
  const added: GachaRecord[] = []
  for (const item of incoming) {
    const key = recordKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    records.push(item)
    added.push(item)
  }
  return { records, added }
}

/** 官方单池返回 → 领域记录;池 code 与 cardPoolId 取自本池请求上下文,与返回内容无关 */
export function toDomainRecords(
  items: readonly RawApiItem[],
  poolCode: number,
  cardPoolId: number | null,
): GachaRecord[] {
  return items.map((item) => ({
    cardPoolType: poolCode,
    cardPoolId,
    time: item.time ?? '',
    name: item.name ?? '',
    qualityLevel: item.qualityLevel ?? 0,
    resourceId: item.resourceId === undefined || item.resourceId === null ? '' : String(item.resourceId),
    resourceType: item.resourceType ?? '',
  }))
}
