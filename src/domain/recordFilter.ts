import type { GachaRecord } from '@/domain/records'

/** 抽屉流水单行高度(px):虚拟滚动窗口计算与行样式的单一事实来源(#11) */
export const RECORD_ROW_HEIGHT = 36

/** 抽屉筛选条件(#11):稀有度与卡池,null/省略 = 不限 */
export interface RecordFilter {
  /** 只保留该稀有度;null = 全部 */
  qualityLevel: number | null
  /** 只保留该数字池 code;null = 全部卡池 */
  poolCode: number | null
}

/** 档案中实际出现过的池 code,升序去重(卡池下拉的选项集,未知 code 一并呈现) */
export function poolCodesIn(records: readonly GachaRecord[]): number[] {
  return [...new Set(records.map((record) => record.cardPoolType))].sort((a, b) => a - b)
}

/** 按稀有度与卡池筛选;结果恒为时间倒序(库内口径即倒序,此处防御性重排) */
export function filterRecords(
  records: readonly GachaRecord[],
  filter: RecordFilter,
): GachaRecord[] {
  const rows = records.filter(
    (record) =>
      (filter.qualityLevel === null || record.qualityLevel === filter.qualityLevel) &&
      (filter.poolCode === null || record.cardPoolType === filter.poolCode),
  )
  return rows.sort((a, b) => b.time.localeCompare(a.time))
}
