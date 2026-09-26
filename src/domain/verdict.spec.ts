import { describe, expect, it } from 'vitest'
import type { GachaRecord } from './records'
import { overallStats, poolStats } from './stats'
import {
  DEFAULT_VERDICT_POOL_CODE,
  degreeOf,
  EXPECTED_PULLS_LIMITED_CHAR,
  expectedReferencePulls,
  LUCKIEST_PULLS,
  poolVerdict,
  tierOf,
  UNLUCKY_OFF_RATE,
} from './verdict'

let seq = 0

/** 单调递增时间戳(跨天/时/分进位),保证整档测试里时间字符串始终正序 */
function stamp(n: number): string {
  const day = Math.floor(n / 86400)
  const rest = n % 86400
  const hh = String(Math.floor(rest / 3600)).padStart(2, '0')
  const mm = String(Math.floor((rest % 3600) / 60)).padStart(2, '0')
  const ss = String(rest % 60).padStart(2, '0')
  return `2025-05-${String(1 + day).padStart(2, '0')} ${hh}:${mm}:${ss}`
}

function record(overrides: Partial<GachaRecord> = {}): GachaRecord {
  seq += 1
  return {
    cardPoolType: 1,
    cardPoolId: 100074,
    time: stamp(seq),
    name: '远行者佩枪·瞭望',
    qualityLevel: 3,
    resourceId: '21050001',
    resourceType: '武器',
    ...overrides,
  }
}

function fillers(n: number, poolCode = 1): GachaRecord[] {
  return Array.from({ length: n }, () => record({ cardPoolType: poolCode }))
}

/** 构造一个池的档案:每段 [垫抽数, 五星名] 依次出货;五星名 null 表示只垫抽不出金 */
function pool1History(segments: Array<[pulls: number, five: string | '歪' | 'UP' | '未知' | null]>): GachaRecord[] {
  const asc: GachaRecord[] = []
  for (const [pulls, five] of segments) {
    asc.push(...fillers(pulls - 1))
    if (five !== null) {
      const off = five === '歪' ? '维里奈' : five === 'UP' ? '忌炎' : five === '未知' ? '' : five
      asc.push(record({ name: off, qualityLevel: 5, resourceType: '角色' }))
    }
  }
  return [...asc].reverse()
}

describe('评语档位与评级字母(原型 tierOf 定稿):档位边界逐一测试', () => {
  it('S ≤35 天选之人 / A ≤50 欧洲常驻居民 / B+ ≤62 手气不错 / B ≤70 中规中矩 / C ≤78 玄不救非 / D >78 保底战神', () => {
    expect(tierOf(35)).toEqual({ rank: 'S', text: '天选之人' })
    expect(tierOf(36)).toEqual({ rank: 'A', text: '欧洲常驻居民' })
    expect(tierOf(50)).toEqual({ rank: 'A', text: '欧洲常驻居民' })
    expect(tierOf(51)).toEqual({ rank: 'B+', text: '手气不错' })
    expect(tierOf(62)).toEqual({ rank: 'B+', text: '手气不错' })
    expect(tierOf(63)).toEqual({ rank: 'B', text: '中规中矩' })
    expect(tierOf(70)).toEqual({ rank: 'B', text: '中规中矩' })
    expect(tierOf(71)).toEqual({ rank: 'C', text: '玄不救非' })
    expect(tierOf(78)).toEqual({ rank: 'C', text: '玄不救非' })
    expect(tierOf(79)).toEqual({ rank: 'D', text: '保底战神' })
  })

  it('极值:0 抽(理论下限)为 S,超大平均为 D', () => {
    expect(tierOf(0).rank).toBe('S')
    expect(tierOf(200).rank).toBe('D')
  })
})

describe('程度阈值:超欧 ≤20 抽 / 超非 ≥70 抽', () => {
  it('边界值 20/21 与 69/70', () => {
    expect(degreeOf(1)).toBe('lucky')
    expect(degreeOf(20)).toBe('lucky')
    expect(degreeOf(21)).toBe('normal')
    expect(degreeOf(69)).toBe('normal')
    expect(degreeOf(70)).toBe('unlucky')
    expect(degreeOf(120)).toBe('unlucky')
  })
})

describe('期望参考线常量:角色系 62 抽(社区口径),武器系 V1 不显示', () => {
  it('常量值与按类别取值', () => {
    expect(EXPECTED_PULLS_LIMITED_CHAR).toBe(62)
    expect(expectedReferencePulls('limitedChar')).toBe(62)
    expect(expectedReferencePulls('limitedWeapon')).toBeNull()
    expect(expectedReferencePulls('standard')).toBeNull()
    expect(expectedReferencePulls('noviceGratitude')).toBeNull()
    expect(expectedReferencePulls('unknown')).toBeNull()
  })
})

describe('修正项阈值常量', () => {
  it('歪率 ≥80% 与 ≤10 抽彩蛋的阈值', () => {
    expect(UNLUCKY_OFF_RATE).toBe(0.8)
    expect(LUCKIEST_PULLS).toBe(10)
  })
})

describe('本池评语:角色系限定池', () => {
  it('按五星平均出货定档,透传平均出货与歪率', () => {
    // 30 抽 + 50 抽 → 平均 40 → A 欧洲常驻居民;一歪一 UP → 歪率 50%
    const records = pool1History([[30, '歪'], [50, 'UP']])
    const verdict = poolVerdict(poolStats(records, 1))

    expect(verdict.rank).toBe('A')
    expect(verdict.text).toBe('欧洲常驻居民')
    expect(verdict.avgPulls).toBeCloseTo(40, 10)
    expect(verdict.offRate).toBeCloseTo(0.5, 10)
    expect(verdict.modifiers).toEqual([])
    expect(verdict.note).toBeNull()
  })

  it('五星 <2 个:评级「—」、评语「样本不足，多抽点再来」(原型无此场景,评级取「—」)', () => {
    const one = poolVerdict(poolStats(pool1History([[40, 'UP']]), 1))
    expect(one.rank).toBe('—')
    expect(one.text).toBe('样本不足，多抽点再来')
    expect(one.avgPulls).toBeCloseTo(40, 10) // 有 1 个五星仍展示平均出货

    const none = poolVerdict(poolStats(pool1History([[40, null]]), 1))
    expect(none.rank).toBe('—')
    expect(none.text).toBe('样本不足，多抽点再来')
    expect(none.avgPulls).toBeNull()
  })

  it('歪率 ≥80%:追加「命运的反面宠儿」;恰好 80% 触发,不足不触发', () => {
    // 4 歪 1 UP → 歪率 80%
    const at = poolVerdict(
      poolStats(pool1History([[40, '歪'], [40, '歪'], [40, '歪'], [40, '歪'], [40, 'UP']]), 1),
    )
    expect(at.offRate).toBeCloseTo(0.8, 10)
    expect(at.modifiers).toContainEqual({ text: '命运的反面宠儿', tone: 'off' })

    const below = poolVerdict(
      poolStats(pool1History([[40, '歪'], [40, '歪'], [40, '歪'], [40, 'UP'], [40, 'UP'], [40, 'UP'], [40, 'UP']]), 1),
    )
    expect(below.offRate).toBeLessThan(0.8)
    expect(below.modifiers).toEqual([])
  })

  it('出过 ≤10 抽的五星:追加「十里坡剑圣」式彩蛋(原型文案「出手如电 · N 抽名」)', () => {
    const records = pool1History([[9, 'UP'], [50, 'UP'], [50, 'UP']])
    const verdict = poolVerdict(poolStats(records, 1))
    expect(verdict.modifiers).toContainEqual({ text: '出手如电 · 9 抽忌炎', tone: 'up' })

    const noLucky = poolVerdict(poolStats(pool1History([[11, 'UP'], [50, 'UP']]), 1))
    expect(noLucky.modifiers).toEqual([])
  })

  it('多个 ≤10 抽五星:取最欧的一个;并列时取更晚的', () => {
    const pickMin = poolVerdict(poolStats(pool1History([[50, 'UP'], [9, 'UP'], [7, 'UP'], [40, 'UP']]), 1))
    expect(pickMin.modifiers).toContainEqual({ text: '出手如电 · 7 抽忌炎', tone: 'up' })

    const tie = poolVerdict(poolStats(pool1History([[8, '歪'], [8, 'UP'], [40, 'UP']]), 1))
    expect(tie.modifiers).toContainEqual({ text: '出手如电 · 8 抽忌炎', tone: 'up' })
  })

  it('两个修正项可同时追加(命运的反面宠儿在前)', () => {
    const records = pool1History([[9, '歪'], [40, '歪'], [40, '歪'], [40, '歪'], [40, 'UP']]) // 歪率 4/5 = 80%
    const verdict = poolVerdict(poolStats(records, 1))
    expect(verdict.modifiers).toEqual([
      { text: '命运的反面宠儿', tone: 'off' },
      { text: '出手如电 · 9 抽维里奈', tone: 'up' },
    ])
  })
})

describe('本池评语:武器系限定池 / 常驻池', () => {
  it('武器池同样按平均出货定档,但歪率恒为 null(必中 UP 不显示)', () => {
    const records = [
      ...fillers(20, 2),
      record({ cardPoolType: 2, name: '千般渡', qualityLevel: 5, resourceType: '武器' }),
      ...fillers(62, 2),
      record({ cardPoolType: 2, name: '存帧', qualityLevel: 5, resourceType: '武器' }),
    ]
    const verdict = poolVerdict(poolStats(records, 2))

    expect(verdict.rank).toBe('A')
    expect(verdict.text).toBe('欧洲常驻居民')
    expect(verdict.avgPulls).toBeCloseTo(42, 10)
    expect(verdict.offRate).toBeNull()
  })

  it('常驻池按原型显示档位(样本 n≥1),歪率为 null', () => {
    const records = [
      ...fillers(141, 3),
      record({ cardPoolType: 3, name: '安可', qualityLevel: 5, resourceType: '角色' }),
    ]
    const verdict = poolVerdict(poolStats(records, 3))
    expect(verdict.rank).toBe('D')
    expect(verdict.text).toBe('保底战神')
    expect(verdict.offRate).toBeNull()
  })

  it('武器/常驻池一个五星都没有:同样按「样本不足」兜底,不给评级', () => {
    const verdict = poolVerdict(poolStats(fillers(30, 2), 2))
    expect(verdict.rank).toBe('—')
    expect(verdict.text).toBe('样本不足，多抽点再来')
  })
})

describe('新手·感恩池不计入欧非总评:评级「—」、评语「启程之人」', () => {
  it('池 5/6/7 一律「—」+ 启程之人,不出平均出货与歪率', () => {
    for (const code of [5, 6, 7]) {
      const records = [
        ...fillers(9, code),
        record({ cardPoolType: code, name: '凌阳', qualityLevel: 5, resourceType: '角色' }),
      ]
      const verdict = poolVerdict(poolStats(records, code))
      expect(verdict.rank, `code ${code}`).toBe('—')
      expect(verdict.text, `code ${code}`).toBe('启程之人')
      expect(verdict.note, `code ${code}`).toBe('新手池规则特殊，不计入欧非总评')
      expect(verdict.avgPulls, `code ${code}`).toBeNull()
      expect(verdict.offRate, `code ${code}`).toBeNull()
      expect(verdict.modifiers, `code ${code}`).toEqual([])
    }
  })
})

describe('未知池与默认当前池', () => {
  it('未知 code 不给欧非评级(保守兜底,不编造评语)', () => {
    const records = [
      ...fillers(5, 99),
      record({ cardPoolType: 99, name: '某角色', qualityLevel: 5, resourceType: '角色' }),
    ]
    const verdict = poolVerdict(poolStats(records, 99))
    expect(verdict.rank).toBe('—')
    expect(verdict.avgPulls).toBeNull()
    expect(verdict.offRate).toBeNull()
  })

  it('默认评语池 = 角色精准调谐(code 1)', () => {
    expect(DEFAULT_VERDICT_POOL_CODE).toBe(1)
  })
})

describe('总评:数据集 = 全部角色系限定池(1/8/10/12)', () => {
  it('跨池平均出货定档与歪率;新手/常驻/武器池不掺入', () => {
    const records = [
      ...pool1History([[30, '歪']]), // 池 1:30 抽,歪
      ...[
        ...fillers(49, 8),
        record({ cardPoolType: 8, name: '今汐', qualityLevel: 5, resourceType: '角色' }), // 池 8:50 抽,UP
      ],
      ...[
        ...fillers(9, 5),
        record({ cardPoolType: 5, name: '凌阳', qualityLevel: 5, resourceType: '角色' }), // 新手池不掺入
      ],
    ]
    const verdict = poolVerdict(overallStats(records))

    expect(verdict.rank).toBe('A') // 平均 (30 + 50) / 2 = 40 → A
    expect(verdict.text).toBe('欧洲常驻居民')
    expect(verdict.avgPulls).toBeCloseTo(40, 10)
    expect(verdict.offRate).toBeCloseTo(0.5, 10)
  })
})
