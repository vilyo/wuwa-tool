/**
 * 池页签视图模型(#09):四固定类别页签 + 类别内二级池切换 + 未知池动态兜底页签。
 *
 * - 归属口径:spec「信息架构与视觉」与 PRD §9 A8 —— 页签 = 四固定类别,类别内多 code 时
 *   二级切换只列档案中实际有数据的 code,类别完全无数据时页签保留、回退类别主池(内容区空态)。
 * - 官方新增的未知 code 落入动态兜底页签做浅统计(poolStats/verdict 的 unknown 兜底),
 *   无记录时不占位;禁止按池名匹配(D3),归属只看 card_pool_type 数字 code。
 */
import {
  LIMITED_CHAR_POOLS,
  LIMITED_WEAPON_POOLS,
  NOVICE_GRATITUDE_POOLS,
  STANDARD_POOLS,
  poolCategory,
  type PoolCategory,
} from './pools'
import type { GachaRecord } from './records'

/** 四固定类别(页签归属用;unknown 无主池概念,不在此列) */
export type FixedCategory = Exclude<PoolCategory, 'unknown'>

/** 类别页签展示顺序(定稿原型):角色 → 武器 → 常驻 → 新手·感恩,未知池兜底页签殿后 */
export const CATEGORY_TAB_ORDER: readonly FixedCategory[] = [
  'limitedChar',
  'limitedWeapon',
  'standard',
  'noviceGratitude',
]

/** 类别页签文案(官方用语「调谐」;新手池与感恩定向调谐合并为一页签) */
const CATEGORY_TAB_LABELS: Record<PoolCategory, string> = {
  limitedChar: '角色精准调谐',
  limitedWeapon: '武器精准调谐',
  standard: '常驻调谐',
  noviceGratitude: '新手·感恩',
  unknown: '未知调谐池',
}

export function categoryTabLabel(category: PoolCategory): string {
  return CATEGORY_TAB_LABELS[category]
}

/** 类别主池:各固定类别的第一个 code,类别内无任何数据时的兜底选中 code */
export const MAIN_POOL_BY_CATEGORY: Record<FixedCategory, number> = {
  limitedChar: LIMITED_CHAR_POOLS[0]!,
  limitedWeapon: LIMITED_WEAPON_POOLS[0]!,
  standard: STANDARD_POOLS[0]!,
  noviceGratitude: NOVICE_GRATITUDE_POOLS[0]!,
}

/** 单个类别页签的视图模型 */
export interface PoolTabVM {
  category: PoolCategory
  /** 页签文案(官方用语) */
  label: string
  /** 档案中该类别实际有数据的池 code(固定类别按官方枚举顺序,未知池按 code 升序) */
  codesWithData: number[]
  /** 无数据时的兜底选中 code(类别主池);未知池页签仅在确有数据时出现,取第一个未知 code */
  fallbackCode: number
}

/** 档案中落在某类别下、实际有数据的池 code(去重;固定类别按枚举顺序,未知池按 code 升序) */
export function poolCodesWithData(
  records: readonly GachaRecord[],
  category: PoolCategory,
): number[] {
  const present = new Set<number>()
  for (const record of records) {
    if (poolCategory(record.cardPoolType) === category) present.add(record.cardPoolType)
  }
  const order =
    category === 'limitedChar'
      ? LIMITED_CHAR_POOLS
      : category === 'limitedWeapon'
        ? LIMITED_WEAPON_POOLS
        : category === 'standard'
          ? STANDARD_POOLS
          : category === 'noviceGratitude'
            ? NOVICE_GRATITUDE_POOLS
            : null
  if (order === null) return [...present].sort((a, b) => a - b)
  return order.filter((code) => present.has(code))
}

/** 页签列表:四固定类别常驻 + 未知池兜底页签(仅当档案中确有未知 code 记录) */
export function poolTabs(records: readonly GachaRecord[]): PoolTabVM[] {
  const tabs: PoolTabVM[] = CATEGORY_TAB_ORDER.map((category) => ({
    category,
    label: categoryTabLabel(category),
    codesWithData: poolCodesWithData(records, category),
    fallbackCode: MAIN_POOL_BY_CATEGORY[category],
  }))
  const unknownCodes = poolCodesWithData(records, 'unknown')
  if (unknownCodes.length > 0) {
    tabs.push({
      category: 'unknown',
      label: categoryTabLabel('unknown'),
      codesWithData: unknownCodes,
      fallbackCode: unknownCodes[0]!,
    })
  }
  return tabs
}
