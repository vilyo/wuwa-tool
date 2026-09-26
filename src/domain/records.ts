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
  /** 同秒多抽合并条数(官方 count):一条 = count 抽,禁止展开成多行(#15);≥1,缺省 1,不入去重键 */
  count: number
}

/** count 归一化:官方/备份的 count 缺失或非法(非正整数)一律按 1;>1 保留原值 */
export function normalizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : 1
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
  /** 本次真正新增的部分(同键多抽已聚合为一条,count=该键抽数) */
  added: GachaRecord[]
  /** 同键相遇且新到抽数更多而升级的既有记录(升级后口径,#15;供存储层按键升级 count) */
  updated: GachaRecord[]
}

/** 合并去重:按组合键只增不减(D2),同键抽数取 max(既有, 新到)(#15 延续只增不减);
 *  与 DB 层 INSERT OR IGNORE / count 单调升级语义一致 */
export function mergeRecords(
  existing: readonly GachaRecord[],
  incoming: readonly GachaRecord[],
): MergeResult {
  const indexByKey = new Map(existing.map((record, index) => [recordKey(record), index]))
  const records = [...existing]
  const added: GachaRecord[] = []
  const updated: GachaRecord[] = []
  // 官方逐抽返回:同一次唤取里抽到的同名同星物品是同键多行(count 恒 1),
  // 先按键聚合 Σcount 再合并——同键 N 行 = N 抽,聚合为一条 count=N 的记录(#15)
  const grouped = new Map<string, { record: GachaRecord; pulls: number }>()
  for (const item of incoming) {
    const key = recordKey(item)
    const group = grouped.get(key)
    if (group) group.pulls += item.count
    else grouped.set(key, { record: item, pulls: item.count })
  }
  for (const [key, { record, pulls }] of grouped) {
    const index = indexByKey.get(key)
    if (index === undefined) {
      indexByKey.set(key, records.length)
      const aggregated = { ...record, count: pulls }
      records.push(aggregated)
      added.push(aggregated)
      continue
    }
    const current = records[index]!
    if (pulls > current.count) {
      const upgraded = { ...current, count: pulls }
      records[index] = upgraded
      updated.push(upgraded)
    }
  }
  return { records, added, updated }
}

/** 官方单池返回 → 领域记录;池 code 与 cardPoolId 取自本池请求上下文,与返回内容无关。
 *  count 保留官方值(同秒多抽合一条),缺失/非法按 1,禁止展开成多行(#15) */
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
    count: normalizeCount(item.count),
  }))
}
