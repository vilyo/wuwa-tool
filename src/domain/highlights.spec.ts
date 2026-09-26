import { describe, expect, it } from 'vitest'
import type { GachaRecord } from './records'
import { highlights } from './highlights'

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

/** 池内 [垫抽数, 五星名] 段按时间正序出货 */
function fiveAt(pullsBefore: number, name: string, poolCode = 1): GachaRecord[] {
  return [
    ...fillers(pullsBefore, poolCode),
    record({ cardPoolType: poolCode, name, qualityLevel: 5, resourceType: '角色' }),
  ]
}

describe('高光时刻:旅途总览', () => {
  it('总抽数/五星数按全部档案记录口径(含常驻/新手池),自取最早记录年月', () => {
    const records = [
      ...fiveAt(9, '忌炎'), // 池 1:10 抽 + 五星
      ...fillers(5, 2), // 池 2:5 抽
      ...fiveAt(3, '凌阳', 5), // 新手池:4 抽 + 五星
      ...fillers(2, 3), // 常驻:2 抽
    ]
    const vm = highlights([...records].reverse())

    expect(vm.journey.totalPulls).toBe(21)
    expect(vm.journey.fiveStars).toBe(2)
    expect(vm.journey.since).toBe('2025-05')
  })

  it('空档案:全零与 null,不出任何纪念牌', () => {
    const vm = highlights([])
    expect(vm.journey).toEqual({ totalPulls: 0, fiveStars: 0, since: null })
    expect(vm.luckiest).toBeNull()
    expect(vm.longest).toBeNull()
    expect(vm.guaranteed).toBeNull()
  })
})

describe('高光时刻:最欧「出手如电」与最非「漫长等待」', () => {
  it('取角色系限定池内出货最小/最大的五星,并列取更晚的', () => {
    const records = [
      ...fiveAt(9, '忌炎'), // 10 抽(早)
      ...fiveAt(75, '维里奈'), // 76 抽(最非)
      ...fiveAt(8, '今汐', 8), // 9 抽(最晚且并列最小? 否:比 10 抽更小 → 最欧)
      ...fiveAt(9, '椿', 10), // 10 抽(与忌炎并列,更晚 → 取椿)
    ]
    const vm = highlights([...records].reverse())

    expect(vm.luckiest).toMatchObject({
      title: '出手如电',
      name: '今汐',
      pulls: 9,
      pool: '角色新旅调谐',
      outcome: 'UP',
    })
    expect(vm.luckiest!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(vm.longest).toMatchObject({
      title: '漫长等待',
      name: '维里奈',
      pulls: 76,
      pool: '角色精准调谐',
      outcome: '歪',
    })
  })

  it('并列同抽数时取更晚的一个(最近的高光时刻)', () => {
    const records = [...fiveAt(9, '忌炎'), ...fiveAt(9, '椿', 8)]
    const vm = highlights([...records].reverse())
    expect(vm.luckiest!.name).toBe('椿')
    expect(vm.longest!.name).toBe('椿')
  })

  it('常驻/新手池五星不参与欧非极端(角色系限定池口径),判定未知五星 outcome 为 null', () => {
    const records = [
      ...fiveAt(204, '安可', 3), // 常驻池 205 抽:不参与
      // 名单外且名称缺失 → 判定未知(信息不足),纪念牌副行省略结局
      ...fillers(39),
      record({ name: '', qualityLevel: 5, resourceType: '角色' }),
    ]
    const vm = highlights([...records].reverse())
    expect(vm.longest).not.toBeNull()
    expect(vm.longest!.pulls).toBe(40)
    expect(vm.longest!.outcome).toBeNull()
    expect(vm.luckiest!.pulls).toBe(40)
  })

  it('无角色系限定池五星时最欧/最非不出牌', () => {
    const vm = highlights([...fiveAt(4, '凌阳', 5)].reverse()) // 只有新手池五星
    expect(vm.luckiest).toBeNull()
    expect(vm.longest).toBeNull()
  })
})

describe('高光时刻:大保底就绪', () => {
  it('处于大保底时出牌:池取最近有记录的角色系限定池,垫抽数取该池 pity', () => {
    const records = [
      ...fiveAt(39, '维里奈'), // 池 1 五星歪 → 大保底
      ...fillers(17, 8), // 之后在池 8 垫抽:最近活动池
    ]
    const vm = highlights([...records].reverse())
    expect(vm.guaranteed).toEqual({ pool: '角色新旅调谐', current: 17 })
  })

  it('小保底或无角色系限定池数据时不出牌', () => {
    const up = highlights([...fiveAt(39, '忌炎'), ...fillers(5, 8)].reverse())
    expect(up.guaranteed).toBeNull()

    const noviceOnly = highlights([...fiveAt(4, '凌阳', 5)].reverse())
    expect(noviceOnly.guaranteed).toBeNull()
  })
})
