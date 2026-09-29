/**
 * 欧非评语(spec「Implementation Decisions · 统计口径与评语」;档位表与修正项文案逐字定稿)。
 *
 * - 评语档位与评级字母按五星平均出货(含出货那抽)定档,五档 SABCD(2026-09-29 用户改版,删原 B+ 档):
 *   S ≤35 天选之人 / A ≤50 欧洲常驻民 / B ≤70 普普通通 / C ≤78 保底战神 / D >78 非洲大酋长。
 * - 档位表单一来源 TIER_LADDER(#17):tierOf 与评语行 hover 档位弹层共用。
 * - 修正项:歪率 ≥80% 追加「命运的反面宠儿」;出过 ≤10 抽五星追加「十里坡剑圣」式彩蛋(原型文案)。
 * - 评语行子行数字(#18 二次要求):角色系限定池显示「平均出UP」(歪+必中UP 合并口径),
 *   无出 UP 口径的池(武器/常驻等)回落显示「平均出货」;评级与档位仍按五星平均出货定档(定稿不动)。
 * - 程度阈值:超欧 ≤20 抽(绿)、欧 21–40 抽(浅绿)、正常 41–69 抽(中性)、超非 ≥70 抽(红),
 *   供名册数字/微条着色(#08)。
 * - 期望参考线:角色系 62 抽(社区口径,仅供参考);武器系 V1 不显示(#08/#09/#10 消费)。
 */
import type { PoolCategory } from './pools'
import type { FiveStarPull, PoolStats } from './stats'

/** 程度阈值:出货 ≤20 抽为超欧(lucky,绿) */
export const LUCKY_PULLS = 20
/** 程度阈值:出货 ≤40 抽为欧(mildLucky,浅绿) */
export const MILD_LUCKY_PULLS = 40
/** 程度阈值:出货 ≥70 抽为超非(unlucky,红) */
export const UNLUCKY_PULLS = 70

export type Degree = 'lucky' | 'mildLucky' | 'normal' | 'unlucky'

/** 单个五星出货抽数的程度(名册数字与 0–80 微条着色口径,PRD §5) */
export function degreeOf(pulls: number): Degree {
  if (pulls <= LUCKY_PULLS) return 'lucky'
  if (pulls <= MILD_LUCKY_PULLS) return 'mildLucky'
  if (pulls >= UNLUCKY_PULLS) return 'unlucky'
  return 'normal'
}

/** 期望参考线(抽):角色系 62,社区口径,界面标注「社区口径，仅供参考」 */
export const EXPECTED_PULLS_LIMITED_CHAR = 62

/** 期望参考线按池类别取值;武器系 V1 不显示(原型定稿),其余类别同样不给 */
export function expectedReferencePulls(category: PoolCategory): number | null {
  return category === 'limitedChar' ? EXPECTED_PULLS_LIMITED_CHAR : null
}

/** 评语档位:评级字母 + 评语文案(逐字按 spec 档位表) */
export interface VerdictTier {
  rank: string
  text: string
}

/** 档位表行(单一来源):tierOf 与评语行 hover 档位弹层共用(#17) */
export interface TierRung {
  rank: string
  /** 本档上限(含);末档无上限为 null */
  max: number | null
  text: string
}

/** 档位表(五档 SABCD,2026-09-29 用户改版,S→D):阈值文案「≤N」/末档「>N」按上一档上限显示 */
export const TIER_LADDER: readonly TierRung[] = [
  { rank: 'S', max: 35, text: '天选之人' },
  { rank: 'A', max: 50, text: '欧洲常驻民' },
  { rank: 'B', max: 70, text: '普普通通' },
  { rank: 'C', max: 78, text: '保底战神' },
  { rank: 'D', max: null, text: '非洲大酋长' },
]

/** 评语档位:按五星平均出货定档 */
export function tierOf(avgPulls: number): VerdictTier {
  const rung = TIER_LADDER.find((r) => r.max === null || avgPulls <= r.max)
  return { rank: rung!.rank, text: rung!.text }
}

/** 修正项阈值:歪率 ≥80% 追加「命运的反面宠儿」 */
export const UNLUCKY_OFF_RATE = 0.8
/** 彩蛋阈值:出过 ≤10 抽的五星追加「十里坡剑圣」式彩蛋 */
export const LUCKIEST_PULLS = 10

/** 修正项/彩蛋:tone 决定徽章配色(up = 出手如电系,off = 命运的反面系) */
export interface VerdictModifier {
  text: string
  tone: 'up' | 'off'
}

/** 评语行上屏数据(评语行组件的单一输入) */
export interface PoolVerdict {
  /** 评级字母;'—' 表示无评级(菱章按原型隐藏) */
  rank: string
  /** 评语主文案 */
  text: string
  /** 五星平均出货(含出货那抽);不展示时为 null */
  avgPulls: number | null
  /** 出 UP 平均抽数(#18,歪 + 必中 UP 合并计一次);仅角色系限定池有值,组件据此切换子行文案 */
  avgUpPulls: number | null
  /** 歪率(0–1);仅角色系限定池有值 */
  offRate: number | null
  /** 修正项与彩蛋徽章 */
  modifiers: VerdictModifier[]
  /** 补充说明(替代平均出货子句,如新手池说明);无则为 null */
  note: string | null
}

/** 无评级场合的统一占位(菱章隐藏,同原型 .rank-mini.none) */
const NO_RANK = '—'

/** ≤10 抽彩蛋中取最欧的一个;并列取更晚的(最近的高光时刻) */
function luckiestFive(fives: readonly FiveStarPull[]): FiveStarPull | null {
  let best: FiveStarPull | null = null
  for (const five of fives) {
    if (five.pulls > LUCKIEST_PULLS) continue
    if (best === null || five.pulls <= best.pulls) best = five
  }
  return best
}

/** 由统计结果组装评语(档位定稿见 spec 档位表;修正项见 PRD §5) */
export function poolVerdict(stats: PoolStats): PoolVerdict {
  const { category, fives, avgPulls, avgUpPulls, offRate } = stats

  // 新手·感恩池规则特殊,不计入欧非总评(原型定稿)
  if (category === 'noviceGratitude') {
    return {
      rank: NO_RANK,
      text: '启程之人',
      avgPulls: null,
      avgUpPulls: null,
      offRate: null,
      modifiers: [],
      note: '新手池规则特殊，不计入欧非总评',
    }
  }
  // 未知池:规则未知,保守不给任何欧非评价(#09 兜底页签做浅统计)
  if (category === 'unknown') {
    return {
      rank: NO_RANK,
      text: '未知调谐池',
      avgPulls: null,
      avgUpPulls: null,
      offRate: null,
      modifiers: [],
      note: null,
    }
  }

  // 样本不足:角色系限定池五星 <2 个(其余池一个五星都没有时同样不给评级)
  const minFives = category === 'limitedChar' ? 2 : 1
  if (fives.length < minFives) {
    return {
      rank: NO_RANK,
      text: '样本不足，多抽点再来',
      avgPulls,
      avgUpPulls,
      offRate,
      modifiers: [],
      note: null,
    }
  }

  const tier = tierOf(avgPulls!)
  const modifiers: VerdictModifier[] = []
  if (offRate !== null && offRate >= UNLUCKY_OFF_RATE) {
    modifiers.push({ text: '命运的反面宠儿', tone: 'off' })
  }
  const luckiest = luckiestFive(fives)
  if (luckiest) {
    modifiers.push({ text: `出手如电 · ${luckiest.pulls} 抽${luckiest.record.name}`, tone: 'up' })
  }
  return { rank: tier.rank, text: tier.text, avgPulls, avgUpPulls, offRate, modifiers, note: null }
}
