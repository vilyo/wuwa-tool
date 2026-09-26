/**
 * 高光时刻纪念牌视图模型(#10,定稿原型右栏 moments + PRD F2.1)。
 *
 * - 旅途总览:全部档案记录口径(总抽数 = 记录数、五星数 = qualityLevel 5 计数,
 *   「自」取最早记录的年月);原型「四池合计」在多池档案下即全档案合计。
 * - 最欧「出手如电」/最非「漫长等待」:欧非总评数据集(角色系限定池 1/8/10/12,
 *   同 overallStats)内的极端出货;新手·感恩池与常驻池不计入欧非总评,故同样不参与。
 *   并列出货取更晚的一个(最近的高光时刻,同 verdict 的 luckiestFive 口径)。
 * - 大保底就绪:guaranteeStatus 为大保底时出牌;池与垫抽数取最近有记录的角色系限定池。
 */
import { LIMITED_CHAR_POOLS, poolLabel } from './pools'
import type { GachaRecord } from './records'
import { guaranteeStatus, overallStats, poolStats } from './stats'
import type { StandardRosterVerdict } from './standardRoster'
import type { FiveStarPull } from './stats'

/** 旅途总览(全部档案记录口径) */
export interface JourneySummaryVM {
  totalPulls: number
  fiveStars: number
  /** 最早记录的年月(YYYY-MM);无记录为 null */
  since: string | null
}

/** 单块纪念牌(最欧/最非) */
export interface HighlightMomentVM {
  title: '出手如电' | '漫长等待'
  name: string
  /** 出货抽数(含出货那一抽) */
  pulls: number
  /** 记录日期(YYYY-MM-DD,time 字符串原样) */
  date: string
  /** 池名(官方用语) */
  pool: string
  /** 'UP' / '歪';判定未知时为 null(副行省略结局) */
  outcome: 'UP' | '歪' | null
}

/** 大保底就绪牌 */
export interface GuaranteedReadyVM {
  /** 最近有记录的角色系限定池池名 */
  pool: string
  /** 该池当前垫抽数 */
  current: number
}

/** 高光时刻纪念牌整体视图模型 */
export interface HighlightsVM {
  journey: JourneySummaryVM
  luckiest: HighlightMomentVM | null
  longest: HighlightMomentVM | null
  guaranteed: GuaranteedReadyVM | null
}

function outcomeOf(off: StandardRosterVerdict): 'UP' | '歪' | null {
  if (off === true) return '歪'
  if (off === false) return 'UP'
  return null
}

function momentOf(title: '出手如电' | '漫长等待', five: FiveStarPull): HighlightMomentVM {
  return {
    title,
    name: five.record.name,
    pulls: five.pulls,
    date: five.record.time.slice(0, 10),
    pool: poolLabel(five.record.cardPoolType),
    outcome: outcomeOf(five.off),
  }
}

/** 最近有记录的角色系限定池 code;无则为 null(记录通常时间倒序,时间并列保持先见者) */
function latestLimitedCharPool(records: readonly GachaRecord[]): number | null {
  let latest: { code: number; time: string } | null = null
  for (const record of records) {
    if (!LIMITED_CHAR_POOLS.includes(record.cardPoolType)) continue
    if (latest === null || record.time > latest.time) {
      latest = { code: record.cardPoolType, time: record.time }
    }
  }
  return latest?.code ?? null
}

/** 高光时刻纪念牌视图模型 */
export function highlights(records: readonly GachaRecord[]): HighlightsVM {
  // 旅途总览:全档案口径
  const fiveStars = records.reduce((count, r) => (r.qualityLevel === 5 ? count + 1 : count), 0)
  let earliest: string | null = null
  for (const record of records) {
    if (earliest === null || record.time < earliest) earliest = record.time
  }
  const journey: JourneySummaryVM = {
    totalPulls: records.length,
    fiveStars,
    since: earliest === null ? null : earliest.slice(0, 7),
  }

  // 最欧/最非:欧非总评数据集(角色系限定池,fives 时间正序);并列取更晚
  let luckiest: HighlightMomentVM | null = null
  let longest: HighlightMomentVM | null = null
  for (const five of overallStats(records).fives) {
    if (luckiest === null || five.pulls <= luckiest.pulls) luckiest = momentOf('出手如电', five)
    if (longest === null || five.pulls >= longest.pulls) longest = momentOf('漫长等待', five)
  }

  // 大保底就绪
  let guaranteed: GuaranteedReadyVM | null = null
  if (guaranteeStatus(records) === 'guaranteed') {
    const code = latestLimitedCharPool(records)
    if (code !== null) {
      guaranteed = { pool: poolLabel(code), current: poolStats(records, code).pity.current }
    }
  }

  return { journey, luckiest, longest, guaranteed }
}
