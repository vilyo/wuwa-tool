import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { GachaRecord } from '@/domain/records'
import HighlightMoments from './HighlightMoments.vue'

let seq = 0

/** 单调递增时间戳(跨天进位),保证种子流水时间正序 */
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

/** 池内 [垫抽数, 五星名] 段按时间正序出货 */
function fiveAt(pullsBefore: number, name: string, poolCode = 1): GachaRecord[] {
  return [
    ...fillers(pullsBefore, poolCode),
    record({ cardPoolType: poolCode, name, qualityLevel: 5, resourceType: '角色' }),
  ]
}

function mountMoments(records: GachaRecord[]) {
  return mount(HighlightMoments, { props: { records: [...records].reverse() } })
}

describe('高光时刻纪念牌(#10)', () => {
  it('旅途总览:全档案口径的总抽数/五星数 + 最早记录年月', () => {
    const records = [
      ...fiveAt(9, '忌炎'),
      ...fillers(5, 2),
      ...fiveAt(3, '凌阳', 5),
    ]
    const wrapper = mountMoments(records)

    const journey = wrapper.findAll('.moment')[0]!
    expect(journey.find('.t').text()).toBe('旅途')
    expect(journey.find('.m').text()).toBe('19 抽 · 2 个五星')
    expect(journey.find('.s').text()).toBe('自 2025-05 · 全部卡池合计')
  })

  it('最欧「出手如电」与最非「漫长等待」:名字 · 抽数,副行日期 · 池 · 结局,最非为 slate 冷灰', () => {
    const records = [
      ...fiveAt(9, '忌炎'), // 10 抽 UP
      ...fiveAt(75, '维里奈'), // 76 抽 歪
    ]
    const wrapper = mountMoments(records)
    const moments = wrapper.findAll('.moment')

    const luckiest = moments[1]!
    expect(luckiest.find('.t').text()).toBe('出手如电')
    expect(luckiest.find('.m').text()).toBe('忌炎 · 10 抽')
    expect(luckiest.find('.s').text()).toContain('角色精准调谐 · UP')
    expect(luckiest.find('.s').text()).toMatch(/^\d{4}-\d{2}-\d{2}/)

    const longest = moments[2]!
    expect(longest.classes()).toContain('slate')
    expect(longest.find('.t').text()).toBe('漫长等待')
    expect(longest.find('.m').text()).toBe('维里奈 · 76 抽')
    expect(longest.find('.s').text()).toContain('角色精准调谐 · 歪')
  })

  it('大保底就绪牌:仅处于大保底时出现', () => {
    const guaranteed = mountMoments([
      ...fiveAt(39, '维里奈'), // 歪 → 大保底
      ...fillers(17),
    ])
    const moments = guaranteed.findAll('.moment')
    expect(moments).toHaveLength(4)
    const ready = moments[3]!
    expect(ready.find('.t').text()).toBe('大保底已就绪')
    expect(ready.find('.m').text()).toBe('下个五星必为当期 UP')
    expect(ready.find('.s').text()).toBe('角色精准调谐 · 当前垫 17 抽')

    const fiftyFifty = mountMoments([
      ...fiveAt(39, '忌炎'), // UP → 小保底
      ...fillers(5),
    ])
    expect(fiftyFifty.findAll('.moment')).toHaveLength(3)
    expect(fiftyFifty.text()).not.toContain('大保底已就绪')
  })

  it('空态:无角色系限定池五星时最欧/最非不出牌,旅途总览常驻', () => {
    const wrapper = mountMoments([...fiveAt(4, '凌阳', 5)]) // 只有新手池五星
    const moments = wrapper.findAll('.moment')
    expect(moments).toHaveLength(1)
    expect(moments[0]!.find('.t').text()).toBe('旅途')
    expect(moments[0]!.find('.m').text()).toBe('5 抽 · 1 个五星')
  })
})
