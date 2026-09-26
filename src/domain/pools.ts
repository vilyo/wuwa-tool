/** 卡池 code → 官方池名(仅展示用)。code 为开放式枚举 1..=13,未知 code 容错兜底(D3) */
const POOL_LABELS: Record<number, string> = {
  1: '角色精准调谐',
  2: '武器精准调谐',
  3: '角色常驻调谐',
  4: '武器常驻调谐',
  5: '新手调谐',
  6: '新手自选调谐',
  7: '感恩定向调谐',
  8: '角色新旅调谐',
  9: '武器新旅调谐',
  10: '角色联动调谐',
  11: '武器联动调谐',
  12: '角色忆旅调谐',
  13: '武器忆旅调谐',
}

export function poolLabel(code: number): string {
  return POOL_LABELS[code] ?? `未收录调谐池 ${code}`
}

/**
 * 池类别(#07 统计口径与 #09 页签共用):四固定类别 + 未知兜底。
 * 卡池 code 是开放式枚举,官方加新池时落入 unknown,禁止按池名匹配(D3)。
 */
export type PoolCategory =
  | 'limitedChar' // 角色系限定池:有 50/50 与大小保底,歪率统计对象
  | 'limitedWeapon' // 武器系限定池:五星必中 UP
  | 'standard' // 常驻池:无 UP 概念
  | 'noviceGratitude' // 新手·感恩池:规则特殊,不计入欧非总评
  | 'unknown'

export const LIMITED_CHAR_POOLS: readonly number[] = [1, 8, 10, 12]
export const LIMITED_WEAPON_POOLS: readonly number[] = [2, 9, 11, 13]
export const STANDARD_POOLS: readonly number[] = [3, 4]
export const NOVICE_GRATITUDE_POOLS: readonly number[] = [5, 6, 7]

const CATEGORY_BY_CODE: Record<number, PoolCategory> = {
  ...Object.fromEntries(LIMITED_CHAR_POOLS.map((code) => [code, 'limitedChar'])),
  ...Object.fromEntries(LIMITED_WEAPON_POOLS.map((code) => [code, 'limitedWeapon'])),
  ...Object.fromEntries(STANDARD_POOLS.map((code) => [code, 'standard'])),
  ...Object.fromEntries(NOVICE_GRATITUDE_POOLS.map((code) => [code, 'noviceGratitude'])),
}

export function poolCategory(code: number): PoolCategory {
  return CATEGORY_BY_CODE[code] ?? 'unknown'
}

/** 五星硬保底(抽):通用 80 */
export const STANDARD_HARD_PITY = 80
/** 五星硬保底(抽):新手调谐池(code 5)为 50,存在软保底 */
export const NOVICE_HARD_PITY = 50
/** 四星保底(抽):全部池通用,V1 仅计数展示 */
export const FOUR_STAR_HARD_PITY = 10

/** 五星硬保底按池取值;未知 code 按 80 兜底(code 6/7 规则未获官方确认,同样按 80 处理) */
export function hardPity(code: number): number {
  return code === 5 ? NOVICE_HARD_PITY : STANDARD_HARD_PITY
}
