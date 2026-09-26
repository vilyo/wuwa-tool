/**
 * 右栏保底引线视图模型(#10,定稿原型 FUSES + PRD F2.2)。
 *
 * - 引线固定三条:角色精准调谐(1) / 武器精准调谐(2) / 角色常驻调谐(3),垫抽数取
 *   对应池 poolStats().pity;某池无任何记录时该引线不出现(空态,与名册「进行中」卡同口径)。
 * - 角色精准引线标注大小保底(guaranteeStatus,1/8/10/12 合并时间序):上个角色系限定池
 *   五星歪了 → 大保底「下个必 UP」,否则小保底;武器系与常驻引线按原型给固定说明。
 */
import { poolCategory, poolLabel } from './pools'
import type { GachaRecord } from './records'
import { guaranteeStatus, poolStats } from './stats'

/** 引线固定三池(定稿原型/PRD F2.2):角色精准 / 武器精准 / 角色常驻 */
export const PITY_LINE_POOLS: readonly number[] = [1, 2, 3]

/** 单条保底引线 */
export interface PityLineVM {
  poolCode: number
  /** 池名(官方用语) */
  label: string
  /** 已垫抽数 */
  current: number
  /** 五星硬保底 */
  hard: number
  /** 距必得剩余(钳为 ≥0) */
  remain: number
  /** 大小保底标注;仅角色系限定引线有值 */
  badge: '小保底' | '大保底' | null
  /** 引线说明(原型 fuse-note 文案) */
  note: string
}

/** 角色系限定引线的标注与说明(guaranteeStatus 为跨池口径,固定取全档案状态) */
function charLineBadge(status: 'guaranteed' | 'fiftyFifty'): { badge: '小保底' | '大保底'; note: string } {
  return status === 'guaranteed'
    ? { badge: '大保底', note: '上一个五星歪了，下一个必为当期 UP' }
    : { badge: '小保底', note: '下一个五星 50% 为当期 UP' }
}

/** 三条保底引线视图模型(仅含有记录的池,按固定顺序输出) */
export function pityLines(records: readonly GachaRecord[]): PityLineVM[] {
  const lines: PityLineVM[] = []
  for (const poolCode of PITY_LINE_POOLS) {
    const stats = poolStats(records, poolCode)
    if (stats.totalPulls === 0) continue
    const { current, hard } = stats.pity
    const category = poolCategory(poolCode)
    const { badge, note } =
      category === 'limitedChar'
        ? charLineBadge(guaranteeStatus(records))
        : category === 'limitedWeapon'
          ? { badge: null, note: '没有 50/50，出货即 UP' }
          : { badge: null, note: '常驻池无 UP 概念' }
    lines.push({
      poolCode,
      label: poolLabel(poolCode),
      current,
      hard,
      remain: Math.max(0, hard - current),
      badge,
      note,
    })
  }
  return lines
}
