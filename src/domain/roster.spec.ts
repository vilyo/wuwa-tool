import { describe, expect, it } from 'vitest'
import { poolStats } from './stats'
import type { GachaRecord } from './records'
import { rosterCards, rosterSummary } from './roster'

let seq = 0

/** 单调递增时间戳,保证种子流水时间正序 */
function stamp(n: number): string {
  const rest = n % 86400
  const hh = String(Math.floor(rest / 3600)).padStart(2, '0')
  const mm = String(Math.floor((rest % 3600) / 60)).padStart(2, '0')
  const ss = String(rest % 60).padStart(2, '0')
  return `2025-05-01 ${hh}:${mm}:${ss}`
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

/** 每段 [垫抽数(不含出货), 五星名] 按时间正序出货,返回库内口径的时间倒序流水 */
function history(segments: Array<[pullsBefore: number, five: string]>, poolCode = 1): GachaRecord[] {
  const asc: GachaRecord[] = []
  for (const [pullsBefore, five] of segments) {
    asc.push(...fillers(pullsBefore, poolCode))
    asc.push(record({ cardPoolType: poolCode, name: five, qualityLevel: 5, resourceType: '角色' }))
  }
  return [...asc].reverse()
}

describe('名册卡片视图模型:时间倒序', () => {
  it('最新五星排在最前(stats.fives 时间正序的反转)', () => {
    const cards = rosterCards(poolStats(history([[39, '维里奈'], [9, '忌炎']]), 1))
    expect(cards.map((card) => card.record.name)).toEqual(['忌炎', '维里奈'])
    expect(cards[0]!.pulls).toBe(10)
    expect(cards[1]!.pulls).toBe(40)
  })
})

describe('名册卡片视图模型:程度与微条', () => {
  it('程度按出货抽数定档:≤20 绿 / ≥70 红 / 其余中性', () => {
    const cards = rosterCards(
      poolStats(history([[8, '忌炎'], [39, '维里奈'], [75, '卡卡罗']]), 1),
    )
    expect(cards.map((card) => card.degree)).toEqual(['unlucky', 'normal', 'lucky'])
  })

  it('微条常规对照 0–80:出货抽数映射为填充百分比', () => {
    const cards = rosterCards(
      poolStats(history([[8, '忌炎'], [39, '维里奈'], [79, '卡卡罗']]), 1),
    )
    expect(cards.map((card) => card.barPercent)).toEqual([100, 50, 11])
  })

  it('62 抽期望参考线仅角色系限定池携带,武器系与常驻池不显示', () => {
    const charCards = rosterCards(poolStats(history([[8, '忌炎']]), 1))
    expect(charCards[0]!.refPercent).toBe(77.5)
    const weaponCards = rosterCards(poolStats(history([[20, '千古洑流']], 2), 2))
    expect(weaponCards[0]!.refPercent).toBeNull()
    const stdCards = rosterCards(poolStats(history([[40, '安可']], 3), 3))
    expect(stdCards[0]!.refPercent).toBeNull()
  })
})

describe('名册卡片视图模型:结局视觉态', () => {
  it('限定池:常驻名单命中为 off(歪),名单外为 up,识别不了为 neutral', () => {
    const cards = rosterCards(
      poolStats(history([[9, '维里奈'], [9, '忌炎'], [9, '']]), 1),
    )
    expect(cards.map((card) => card.outcome)).toEqual(['neutral', 'up', 'off'])
  })

  it('武器系限定池必中 UP:全部为 up;常驻池无 UP 概念:全部 neutral', () => {
    const weaponCards = rosterCards(poolStats(history([[20, '千古洑流']], 2), 2))
    expect(weaponCards.map((card) => card.outcome)).toEqual(['up'])
    const stdCards = rosterCards(poolStats(history([[40, '安可']], 3), 3))
    expect(stdCards.map((card) => card.outcome)).toEqual(['neutral'])
  })
})

describe('常驻池特例', () => {
  it('出货抽数超过 80 时微条按实际长度显示(分母取全池最大出货)', () => {
    const cards = rosterCards(
      poolStats(history([[204, '安可'], [62, '凌阳'], [26, '维里奈']], 3), 3),
    )
    // 全池最大出货 205:27 → 13%,63 → 31%,205 → 100%
    expect(cards.map((card) => [card.pulls, card.barPercent])).toEqual([
      [27, 13],
      [63, 31],
      [205, 100],
    ])
  })

  it('同一池同名物品第二次及以上出现标「重复」', () => {
    const cards = rosterCards(
      poolStats(history([[141, '安可'], [62, '凌阳'], [26, '安可']], 3), 3),
    )
    expect(cards.map((card) => [card.record.name, card.duplicate])).toEqual([
      ['安可', true],
      ['凌阳', false],
      ['安可', false],
    ])
  })

  it('限定池复刻同一 UP 属正常出货,不标「重复」', () => {
    const cards = rosterCards(poolStats(history([[9, '忌炎'], [9, '忌炎']]), 1))
    expect(cards.map((card) => card.duplicate)).toEqual([false, false])
  })
})

describe('名册汇总芯片计数', () => {
  it('UP/歪/超欧/超非按当前池卡片计数,未知判定不计入 UP/歪', () => {
    const cards = rosterCards(
      poolStats(history([[8, '忌炎'], [39, '忌炎'], [75, '维里奈'], [9, '']]), 1),
    )
    expect(rosterSummary(cards)).toEqual({ up: 2, off: 1, lucky: 2, unlucky: 1, duplicate: 0 })
  })

  it('重复五星计入重复计数', () => {
    const cards = rosterCards(
      poolStats(history([[141, '安可'], [62, '安可']], 3), 3),
    )
    expect(rosterSummary(cards).duplicate).toBe(1)
  })
})
