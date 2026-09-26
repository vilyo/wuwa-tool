/**
 * 统计口径核心(spec「Implementation Decisions · 统计口径与评语」,全量定义见 PRD §5)。
 *
 * - 出货抽数含出货那一抽,按池内时间正序累计;池内最早记录即五星时按 1 计并标「不完整」。
 * - 歪判定经常驻名单反向判定(ADR-0002);歪率仅对角色系限定池(1/8/10/12)计算,
 *   未知物品不计入分母;武器系限定池(2/9/11/13)五星必中 UP。
 * - 保底进度 = 自该池上一个五星之后的抽数,对照五星硬保底(池 5 为 50,其余 80)。
 * - 大小保底状态 = 上一个角色系限定池五星是否歪(1/8/10/12 合并时间序)。
 * - time 字段时区语义未确认,V1 按字符串原样排序(spec Further Notes)。
 */
import { hardPity, LIMITED_CHAR_POOLS, poolCategory, type PoolCategory } from './pools'
import type { GachaRecord } from './records'
import { isStandardRosterItem, type StandardRosterVerdict } from './standardRoster'

/** 单个五星的出货信息(池内时间正序排列) */
export interface FiveStarPull {
  record: GachaRecord
  /** 出货抽数(含出货那一抽) */
  pulls: number
  /** 池内最早记录即五星:本地无更早历史,按 1 计,界面标「不完整」 */
  incomplete: boolean
  /** 歪判定(ADR-0002):true=歪 / false=当期 UP / 'unknown'=未知 */
  off: StandardRosterVerdict
}

/** 保底进度:当前垫抽数对照五星硬保底 */
export interface PityProgress {
  /** 自该池上一个五星之后的抽数;池内无五星时 = 本地可见的全部记录数 */
  current: number
  /** 五星硬保底(池 5 = 50,其余 80) */
  hard: number
}

/** 单池(或跨池合计)的统计结果 */
export interface PoolStats {
  /** 池 code;跨池合计(总评数据集)时为 null */
  cardPoolType: number | null
  category: PoolCategory
  /** 该数据集的全部记录数 = 总唤取 */
  totalPulls: number
  /** 五星出货列表,时间正序 */
  fives: FiveStarPull[]
  /** 五星平均出货(含出货那抽);无五星为 null */
  avgPulls: number | null
  /** 歪率(0–1);仅角色系限定池计算,无可计入分母的五星时为 null */
  offRate: number | null
  /** 保底进度 */
  pity: PityProgress
}

/** time 字符串原样升序;同字符串依赖 Array.prototype.sort 的稳定性保持原序 */
function byTimeAsc(records: readonly GachaRecord[]): GachaRecord[] {
  return [...records].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
}

function computeStats(
  poolRecords: readonly GachaRecord[],
  cardPoolType: number | null,
  category: PoolCategory,
): PoolStats {
  const asc = byTimeAsc(poolRecords)
  const fives: FiveStarPull[] = []
  let sinceLastFive = 0
  for (let i = 0; i < asc.length; i += 1) {
    const record = asc[i]!
    sinceLastFive += 1
    if (record.qualityLevel !== 5) continue
    fives.push({
      record,
      pulls: sinceLastFive,
      incomplete: i === 0,
      // 武器系限定池无 50/50,名单命中也按规则判 UP;其余池按常驻名单反向判定
      off: category === 'limitedWeapon' ? false : isStandardRosterItem(record),
    })
    sinceLastFive = 0
  }

  const eligible = fives.filter((five) => five.off !== 'unknown')
  const offCount = eligible.filter((five) => five.off === true).length
  return {
    cardPoolType,
    category,
    totalPulls: asc.length,
    fives,
    avgPulls: fives.length > 0 ? fives.reduce((sum, five) => sum + five.pulls, 0) / fives.length : null,
    offRate:
      category === 'limitedChar' && eligible.length > 0 ? offCount / eligible.length : null,
    pity: { current: sinceLastFive, hard: hardPity(cardPoolType ?? 1) },
  }
}

/** 「当前池」统计:数据集 = 该池 code 的全部记录 */
export function poolStats(records: readonly GachaRecord[], poolCode: number): PoolStats {
  const poolRecords = records.filter((record) => record.cardPoolType === poolCode)
  return computeStats(poolRecords, poolCode, poolCategory(poolCode))
}

/** 总评统计:数据集 = 全部角色系限定池(1/8/10/12)的记录 */
export function overallStats(records: readonly GachaRecord[]): PoolStats {
  const limitedRecords = records.filter((record) => LIMITED_CHAR_POOLS.includes(record.cardPoolType))
  return computeStats(limitedRecords, null, 'limitedChar')
}

/** 大小保底状态:'guaranteed'=大保底(下个必 UP) / 'fiftyFifty'=小保底 */
export type GuaranteeStatus = 'guaranteed' | 'fiftyFifty'

/**
 * 上一个角色系限定池五星(1/8/10/12 合并时间序)是否歪:歪 → 大保底;
 * 没抽过五星或最近五星无法识别时保守按小保底。
 */
export function guaranteeStatus(records: readonly GachaRecord[]): GuaranteeStatus {
  const limitedFives = byTimeAsc(
    records.filter(
      (record) => LIMITED_CHAR_POOLS.includes(record.cardPoolType) && record.qualityLevel === 5,
    ),
  )
  const last = limitedFives[limitedFives.length - 1]
  if (!last) return 'fiftyFifty'
  return isStandardRosterItem(last) === true ? 'guaranteed' : 'fiftyFifty'
}
