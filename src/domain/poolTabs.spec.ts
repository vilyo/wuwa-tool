import { describe, expect, it } from 'vitest'
import type { GachaRecord } from './records'
import { MAIN_POOL_BY_CATEGORY, poolCodesWithData, poolTabs } from './poolTabs'

let seq = 0

function record(cardPoolType: number): GachaRecord {
  seq += 1
  const rest = seq % 86400
  const hh = String(Math.floor(rest / 3600)).padStart(2, '0')
  const mm = String(Math.floor((rest % 3600) / 60)).padStart(2, '0')
  const ss = String(rest % 60).padStart(2, '0')
  return {
    cardPoolType,
    cardPoolId: 100074,
    time: `2025-05-01 ${hh}:${mm}:${ss}`,
    name: '远行者佩枪·瞭望',
    qualityLevel: 3,
    resourceId: '21050011',
    resourceType: '武器',
  }
}

describe('四固定类别页签', () => {
  it('常驻四个页签,顺序与文案为官方用语', () => {
    const tabs = poolTabs([])

    expect(tabs.map((tab) => tab.category)).toEqual([
      'limitedChar',
      'limitedWeapon',
      'standard',
      'noviceGratitude',
    ])
    expect(tabs.map((tab) => tab.label)).toEqual([
      '角色精准调谐',
      '武器精准调谐',
      '常驻调谐',
      '新手·感恩',
    ])
  })

  it('无数据页签保留,fallbackCode = 类别主池(T07 默认池假设收口到页签状态)', () => {
    expect(poolTabs([]).map((tab) => tab.fallbackCode)).toEqual([1, 2, 3, 5])
    expect(MAIN_POOL_BY_CATEGORY).toEqual({
      limitedChar: 1,
      limitedWeapon: 2,
      standard: 3,
      noviceGratitude: 5,
    })
  })
})

describe('类别内二级切换:实际有数据的池 code', () => {
  it('只列档案中实际有数据的 code,按官方枚举顺序去重', () => {
    const records = [record(8), record(1), record(12), record(1), record(2), record(5)]

    expect(poolCodesWithData(records, 'limitedChar')).toEqual([1, 8, 12])
    expect(poolCodesWithData(records, 'limitedWeapon')).toEqual([2])
    expect(poolCodesWithData(records, 'noviceGratitude')).toEqual([5])
  })

  it('无数据的类别为空数组(页签保留,内容区空态)', () => {
    expect(poolCodesWithData([], 'standard')).toEqual([])
  })

  it('未知 code 不落入任何固定类别页签', () => {
    const records = [record(99), record(1)]

    expect(poolCodesWithData(records, 'limitedChar')).toEqual([1])
    expect(poolCodesWithData(records, 'standard')).toEqual([])
  })
})

describe('未知池动态兜底页签', () => {
  it('档案中存在未知 code 记录时出现,殿后于四个固定页签,页内列出全部未知 code(升序)', () => {
    const records = [record(1), record(99), record(100), record(99)]
    const tabs = poolTabs(records)

    expect(tabs).toHaveLength(5)
    expect(tabs[4]!.category).toBe('unknown')
    expect(tabs[4]!.label).toBe('未知调谐池')
    expect(tabs[4]!.codesWithData).toEqual([99, 100])
    expect(tabs[4]!.fallbackCode).toBe(99)
  })

  it('无未知 code 记录时不占位', () => {
    const records = [record(1), record(2), record(5)]

    expect(poolTabs(records)).toHaveLength(4)
    expect(poolTabs(records).some((tab) => tab.category === 'unknown')).toBe(false)
  })
})
