import { describe, expect, it } from 'vitest'
import type { GachaRecord } from './records'
import { guaranteeStatus, overallStats, poolStats } from './stats'

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

/** 造 n 条三星垫抽(时间依次递增,秒级自增保证正序) */
function fillers(n: number, poolCode = 1): GachaRecord[] {
  return Array.from({ length: n }, () => record({ cardPoolType: poolCode }))
}

/** 库内流水为时间倒序:辅助函数按入参正序构造后整体 reverse,贴近真实数据形态 */
function descOrder(recordsAsc: GachaRecord[]): GachaRecord[] {
  return [...recordsAsc].reverse()
}

describe('出货抽数:含出货那一抽,按池内时间正序计算', () => {
  it('五星前的垫抽计入出货抽数,出货那抽本身也计入', () => {
    const records = descOrder([
      ...fillers(3),
      record({ name: '忌炎', qualityLevel: 5, resourceType: '角色' }), // 第 4 抽出货
      ...fillers(1),
      record({ name: '今汐', qualityLevel: 5, resourceType: '角色' }), // 第 2 抽出货
    ])
    const stats = poolStats(records, 1)

    expect(stats.fives.map((f) => f.pulls)).toEqual([4, 2])
    expect(stats.fives[0]!.record.name).toBe('忌炎') // 正序:先忌炎后今汐
    expect(stats.fives[1]!.record.name).toBe('今汐')
    expect(stats.totalPulls).toBe(6)
  })

  it('同 time 字符串原样排序(V1 不做时区换算,稳定排序)', () => {
    const same = '2025-05-01 10:00:00'
    // 三条记录 time 完全相同:排序须保持入参原序,五星按入参位置最后出货
    const records = [
      record({ time: same }),
      record({ time: same }),
      record({ time: same, name: '维里奈', qualityLevel: 5, resourceType: '角色' }), // 入参中在最后
    ]
    const stats = poolStats(records, 1)

    expect(stats.fives).toHaveLength(1)
    expect(stats.fives[0]!.pulls).toBe(3)
  })

  it('只统计该池 code 的记录,其他池不掺入', () => {
    const records = [
      ...fillers(5, 3), // 角色常驻池
      record({ cardPoolType: 3, name: '鉴心', qualityLevel: 5, resourceType: '角色' }),
      ...fillers(2, 1),
      record({ cardPoolType: 1, name: '忌炎', qualityLevel: 5, resourceType: '角色' }),
    ]
    const stats = poolStats(records, 1)

    expect(stats.fives).toHaveLength(1)
    expect(stats.fives[0]!.pulls).toBe(3)
    expect(stats.totalPulls).toBe(3)
  })

  it('四星不重置计数(保底进度独立于四星)', () => {
    const records = descOrder([
      ...fillers(2),
      record({ name: '白芷', qualityLevel: 4, resourceType: '角色' }),
      ...fillers(2),
      record({ name: '忌炎', qualityLevel: 5, resourceType: '角色' }), // 前面 5 条 + 出货那抽 = 6
    ])
    const stats = poolStats(records, 1)

    expect(stats.fives[0]!.pulls).toBe(6)
  })
})

describe('「不完整」:池内最早记录即五星,按 1 计并标记', () => {
  it('最早记录即五星 → pulls=1 且 incomplete=true;后续五星不受影响', () => {
    const records = descOrder([
      record({ name: '忌炎', qualityLevel: 5, resourceType: '角色' }), // 官方 6 个月窗口外的历史已不可得
      ...fillers(7),
      record({ name: '今汐', qualityLevel: 5, resourceType: '角色' }),
    ])
    const stats = poolStats(records, 1)

    expect(stats.fives[0]!.pulls).toBe(1)
    expect(stats.fives[0]!.incomplete).toBe(true)
    expect(stats.fives[1]!.pulls).toBe(8)
    expect(stats.fives[1]!.incomplete).toBe(false)
  })

  it('最早记录不是五星 → 无「不完整」标记', () => {
    const records = descOrder([...fillers(4), record({ name: '忌炎', qualityLevel: 5, resourceType: '角色' })])
    const stats = poolStats(records, 1)

    expect(stats.fives[0]!.incomplete).toBe(false)
    expect(stats.fives[0]!.pulls).toBe(5)
  })
})

describe('歪判定与歪率:仅角色系限定池(1/8/10/12)计算', () => {
  it('名单内 = 歪 / 名单外 = UP,未知物品不计入歪率分母', () => {
    const records = descOrder([
      record({ name: '维里奈', qualityLevel: 5, resourceType: '角色' }), // 名单内 → 歪
      record({ name: '', resourceId: '', qualityLevel: 5, resourceType: '角色' }), // 无法识别 → 未知
      record({ name: '忌炎', qualityLevel: 5, resourceType: '角色' }), // 名单外 → UP
    ])
    const stats = poolStats(records, 1)

    expect(stats.fives.map((f) => f.off)).toEqual([true, 'unknown', false])
    expect(stats.offRate).toBe(0.5) // 1 歪 / 2 计入分母
  })

  it('角色系各 code(8/10/12)同样计算歪率', () => {
    for (const code of [8, 10, 12]) {
      const records = descOrder([
        record({ cardPoolType: code, name: '凌阳', qualityLevel: 5, resourceType: '角色' }),
        record({ cardPoolType: code, name: '守岸人', qualityLevel: 5, resourceType: '角色' }),
      ])
      expect(poolStats(records, code).offRate, `code ${code}`).toBe(0.5)
    }
  })

  it('武器系限定池(2/9/11/13)必中 UP:名单内武器也不判歪,歪率不计算', () => {
    for (const code of [2, 9, 11, 13]) {
      const records = descOrder([
        record({ cardPoolType: code, name: '千古洑流', qualityLevel: 5, resourceType: '武器' }), // 在常驻名单,但武器池必 UP
      ])
      const stats = poolStats(records, code)
      expect(stats.fives[0]!.off, `code ${code}`).toBe(false)
      expect(stats.offRate, `code ${code}`).toBeNull()
    }
  })

  it('常驻/新手池不计算歪率(仅角色系限定池)', () => {
    const five = { name: '鉴心', qualityLevel: 5, resourceType: '角色' }
    expect(poolStats([record({ cardPoolType: 3, ...five })], 3).offRate).toBeNull()
    expect(poolStats([record({ cardPoolType: 5, ...five })], 5).offRate).toBeNull()
  })

  it('计入分母的五星为零时歪率为 null(避免 0/0)', () => {
    const records = descOrder([record({ name: '', resourceId: '', qualityLevel: 5, resourceType: '角色' })])
    expect(poolStats(records, 1).offRate).toBeNull()
  })
})

describe('保底进度:自上一个五星后的抽数 + 硬保底', () => {
  it('当前垫抽数 = 上一个五星之后的记录数', () => {
    const records = descOrder([
      ...fillers(4),
      record({ name: '忌炎', qualityLevel: 5, resourceType: '角色' }),
      ...fillers(17),
    ])
    const stats = poolStats(records, 1)

    expect(stats.pity).toEqual({ current: 17, hard: 80 })
  })

  it('池内无五星:垫抽数 = 全部记录数(本地可见窗口内一金未出)', () => {
    const stats = poolStats(fillers(23), 1)
    expect(stats.pity).toEqual({ current: 23, hard: 80 })
  })

  it('新手调谐池(5)硬保底 50;无记录池垫抽数为 0', () => {
    expect(poolStats(fillers(9, 5), 5).pity).toEqual({ current: 9, hard: 50 })
    expect(poolStats([], 1).pity).toEqual({ current: 0, hard: 80 })
  })

  it('五星平均出货 = 各五星出货抽数的算术平均;无五星为 null', () => {
    const records = descOrder([
      ...fillers(29),
      record({ name: '忌炎', qualityLevel: 5, resourceType: '角色' }), // 30 抽
      ...fillers(49),
      record({ name: '今汐', qualityLevel: 5, resourceType: '角色' }), // 50 抽
    ])
    const stats = poolStats(records, 1)
    expect(stats.avgPulls).toBeCloseTo(40, 10)
    expect(stats.fives).toHaveLength(2)

    expect(poolStats(fillers(3), 1).avgPulls).toBeNull()
    expect(poolStats(fillers(3), 1).fives).toEqual([])
  })
})

describe('大小保底状态 = 上一个角色系限定池五星是否歪', () => {
  it('上一个五星歪(名单内)→ 大保底', () => {
    const records = descOrder([
      ...fillers(5),
      record({ name: '维里奈', qualityLevel: 5, resourceType: '角色' }),
    ])
    expect(guaranteeStatus(records)).toBe('guaranteed')
  })

  it('上一个五星 UP → 小保底;没抽过角色系限定池五星 → 小保底', () => {
    const up = descOrder([...fillers(5), record({ name: '忌炎', qualityLevel: 5, resourceType: '角色' })])
    expect(guaranteeStatus(up)).toBe('fiftyFifty')
    expect(guaranteeStatus(fillers(9))).toBe('fiftyFifty')
    expect(guaranteeStatus([])).toBe('fiftyFifty')
  })

  it('按时间取最新:更早的歪被更晚的 UP 覆盖(跨 1/8/10/12 合并时间序)', () => {
    const records = descOrder([
      ...fillers(1, 8),
      record({ cardPoolType: 8, name: '维里奈', qualityLevel: 5, resourceType: '角色' }), // 先歪
      ...fillers(1, 1),
      record({ cardPoolType: 1, name: '忌炎', qualityLevel: 5, resourceType: '角色' }), // 后 UP
    ])
    expect(guaranteeStatus(records)).toBe('fiftyFifty')
  })

  it('只看角色系限定池:常驻/新手池的名单内五星不影响状态', () => {
    const records = descOrder([
      ...fillers(1, 3),
      record({ cardPoolType: 3, name: '鉴心', qualityLevel: 5, resourceType: '角色' }), // 常驻池「歪」不相关
      ...fillers(1, 1),
      record({ cardPoolType: 1, name: '忌炎', qualityLevel: 5, resourceType: '角色' }),
    ])
    expect(guaranteeStatus(records)).toBe('fiftyFifty')
  })

  it('最近五星无法识别时保守按小保底(不武断宣称必 UP)', () => {
    const records = descOrder([
      ...fillers(1),
      record({ name: '', resourceId: '', qualityLevel: 5, resourceType: '角色' }),
    ])
    expect(guaranteeStatus(records)).toBe('fiftyFifty')
  })
})

describe('总评数据集 = 全部角色系限定池(1/8/10/12)合并', () => {
  it('跨池合并计算出货与歪率,非限定池不掺入', () => {
    const records = [
      ...fillers(9, 1),
      record({ cardPoolType: 1, name: '维里奈', qualityLevel: 5, resourceType: '角色' }), // 10 抽,歪
      ...fillers(4, 8),
      record({ cardPoolType: 8, name: '忌炎', qualityLevel: 5, resourceType: '角色' }), // 5 抽,UP
      ...fillers(3, 3), // 常驻池不掺入
      record({ cardPoolType: 3, name: '鉴心', qualityLevel: 5, resourceType: '角色' }),
    ]
    const stats = overallStats(records)

    expect(stats.fives.map((f) => f.record.name)).toEqual(['维里奈', '忌炎'])
    expect(stats.fives.map((f) => f.pulls)).toEqual([10, 5])
    expect(stats.avgPulls).toBeCloseTo(7.5, 10)
    expect(stats.offRate).toBe(0.5)
    expect(stats.cardPoolType).toBeNull() // 跨池合计,无单一池 code
  })
})
