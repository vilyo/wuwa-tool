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
  /** 官方恒为 1:每条记录就是独立的一抽(#15 实测),仅透传不参与任何逻辑 */
  count?: number
}

/** 去重/档案键:time + name + qualityLevel + cardPoolType(D2 唯一索引同键) */
export function recordKey(record: GachaRecord): string {
  return JSON.stringify([record.time, record.name, record.qualityLevel, record.cardPoolType])
}

export interface MergeResult {
  /** 合并后的全量记录(既有在前、新增追加其后),不改写入参 */
  records: GachaRecord[]
  /** 本次真正新增的部分(保持官方返回的文件序) */
  added: GachaRecord[]
}

/** 合并去重(#15 真实机制):官方逐抽返回,同一次十连抽到同名同星物品是同键多行——
 *  每行都是独立的一抽,禁止合并成 count 也禁止丢弃。同键按出现份数只增不减:
 *  既有键已有 M 行时,incoming 按文件序该键的第 M 行之前视为已存在,其余为新增;
 *  与 DB 层「同键出现份数」幂等语义一致(seq 列区分同键各行)。 */
export function mergeRecords(
  existing: readonly GachaRecord[],
  incoming: readonly GachaRecord[],
): MergeResult {
  const mult = new Map<string, number>()
  for (const record of existing) {
    const key = recordKey(record)
    mult.set(key, (mult.get(key) ?? 0) + 1)
  }
  const records = [...existing]
  const added: GachaRecord[] = []
  const seen = new Map<string, number>()
  for (const item of incoming) {
    const key = recordKey(item)
    const nth = (seen.get(key) ?? 0) + 1
    seen.set(key, nth)
    if (nth > (mult.get(key) ?? 0)) {
      records.push(item)
      added.push(item)
    }
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
