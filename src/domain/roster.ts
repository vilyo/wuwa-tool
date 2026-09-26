/**
 * 五星编年史名册的卡片视图模型(#08):把 poolStats 的五星出货整理成展示层可直接消费的
 * 时间倒序卡片列表与头部汇总芯片计数。
 *
 * - 结局视觉态:限定池(角色/武器)按歪判定给 up/off;识别不了的未知判定与
 *   非限定池(常驻/新手·感恩/未知池)一律 neutral(原型常驻池卡片无 UP/歪两态)。
 * - 微条常规对照 0–80;常驻池出货超过 80 时按实际长度显示(分母取全池最大出货,原型定稿)。
 * - 62 抽期望参考线仅角色系限定池(社区口径,仅供参考),位置按 0–80 刻度折算。
 * - 「重复」章(常驻池特例):同一池同名物品第二次及以上出现(按时间正序计数);
 *   限定池复刻同一 UP 属正常出货,不标。
 */
import { STANDARD_HARD_PITY, type PoolCategory } from './pools'
import type { GachaRecord } from './records'
import type { StandardRosterVerdict } from './standardRoster'
import type { FiveStarPull, PoolStats } from './stats'
import { degreeOf, expectedReferencePulls, type Degree } from './verdict'

/** 卡片结局视觉态:up = 当期 UP(暖色洗底)/ off = 歪(冷灰压暗)/ neutral = 不上两态 */
export type CardOutcome = 'up' | 'off' | 'neutral'

/** 单张名册卡片(时间倒序列表的一项) */
export interface RosterCardVM {
  record: GachaRecord
  /** 出货抽数(含出货那一抽) */
  pulls: number
  /** 池内最早记录即五星:本地无更早历史,按 1 计,界面标「不完整」 */
  incomplete: boolean
  /** 歪判定原始值(true/false/'unknown'),详情条等场景透传 */
  off: StandardRosterVerdict
  /** 结局视觉态 */
  outcome: CardOutcome
  /** 程度档位:数字与微条着色口径(≤20 绿 / ≥70 红 / 其余中性) */
  degree: Degree
  /** 微条填充百分比(0–100) */
  barPercent: number
  /** 62 抽期望参考线位置百分比(0–80 刻度);非角色系限定池为 null */
  refPercent: number | null
  /** 同池同名物品第二次及以上出现(「重复」章) */
  duplicate: boolean
}

/** 名册头部汇总芯片计数(未知判定不计入 UP/歪) */
export interface RosterSummary {
  up: number
  off: number
  lucky: number
  unlucky: number
  duplicate: number
}

function outcomeOf(category: PoolCategory, off: StandardRosterVerdict): CardOutcome {
  if (category !== 'limitedChar' && category !== 'limitedWeapon') return 'neutral'
  if (off === true) return 'off'
  if (off === false) return 'up'
  return 'neutral'
}

/** 五星出货列表 → 时间倒序卡片视图模型 */
export function rosterCards(stats: PoolStats): RosterCardVM[] {
  const { category, fives } = stats
  // 常驻池:出货可超 80,微条按实际长度(分母 = max(硬保底, 全池最大出货))
  const stdMaxPulls =
    category === 'standard'
      ? Math.max(STANDARD_HARD_PITY, ...fives.map((five) => five.pulls))
      : STANDARD_HARD_PITY
  const refPulls = expectedReferencePulls(category)
  const refPercent = refPulls === null ? null : (refPulls / STANDARD_HARD_PITY) * 100

  // 「重复」章是常驻池特例(限定池复刻同一 UP 属正常出货):同池同名物品按时间正序计数,
  // 第二次及以上出现标「重复」
  const seen = new Map<string, number>()
  const dupByKey = (pull: FiveStarPull): boolean => {
    const key = `${pull.record.cardPoolType}:${pull.record.name}`
    const count = seen.get(key) ?? 0
    seen.set(key, count + 1)
    return count >= 1
  }
  const dupFlags = category === 'standard' ? fives.map(dupByKey) : fives.map(() => false)

  return fives
    .map((five, index) => {
      const denom = category === 'standard' ? stdMaxPulls : STANDARD_HARD_PITY
      return {
        record: five.record,
        pulls: five.pulls,
        incomplete: five.incomplete,
        off: five.off,
        outcome: outcomeOf(category, five.off),
        degree: degreeOf(five.pulls),
        barPercent: Math.min(100, Math.round((five.pulls / denom) * 100)),
        refPercent,
        duplicate: dupFlags[index]!,
      }
    })
    .reverse()
}

/** 汇总芯片计数:按结局视觉态与程度档位统计 */
export function rosterSummary(cards: readonly RosterCardVM[]): RosterSummary {
  let up = 0
  let off = 0
  let lucky = 0
  let unlucky = 0
  let duplicate = 0
  for (const card of cards) {
    if (card.outcome === 'up') up += 1
    if (card.outcome === 'off') off += 1
    if (card.degree === 'lucky') lucky += 1
    if (card.degree === 'unlucky') unlucky += 1
    if (card.duplicate) duplicate += 1
  }
  return { up, off, lucky, unlucky, duplicate }
}
