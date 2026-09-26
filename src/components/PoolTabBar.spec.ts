import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { GachaRecord } from '@/domain/records'
import PoolTabBar from './PoolTabBar.vue'

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
    resourceId: '21050011',
    resourceType: '武器',
    ...overrides,
  }
}

function fillers(n: number, poolCode: number): GachaRecord[] {
  return Array.from({ length: n }, () => record({ cardPoolType: poolCode }))
}

/** 每段 [垫抽数(不含出货), 五星名] 按时间正序出货,返回库内口径的时间倒序流水 */
function history(
  segments: Array<[pullsBefore: number, five: string]>,
  poolCode = 1,
  resourceType = '角色',
): GachaRecord[] {
  const asc: GachaRecord[] = []
  for (const [pullsBefore, five] of segments) {
    asc.push(...fillers(pullsBefore, poolCode))
    asc.push(
      record({ cardPoolType: poolCode, name: five, qualityLevel: 5, resourceType }),
    )
  }
  return [...asc].reverse()
}

function mountBar(records: GachaRecord[], activeCategory = 'limitedChar', poolCode = 1) {
  return mount(PoolTabBar, {
    props: {
      records,
      activeCategory: activeCategory as never,
      poolCode,
    },
  })
}

describe('四固定类别页签', () => {
  it('渲染四个页签,文案为官方用语;激活态随 activeCategory', () => {
    const wrapper = mountBar(history([[9, '忌炎']]))
    const tabs = wrapper.findAll('.pool-tab')

    expect(tabs.map((tab) => tab.text())).toEqual([
      '角色精准调谐',
      '武器精准调谐',
      '常驻调谐',
      '新手·感恩',
    ])
    expect(tabs[0]!.classes()).toContain('is-active')
    expect(tabs[1]!.classes()).not.toContain('is-active')
  })

  it('点击页签回传 select-category', async () => {
    const wrapper = mountBar(history([[9, '忌炎']]))

    await wrapper.findAll('.pool-tab')[2]!.trigger('click')

    expect(wrapper.emitted('select-category')).toEqual([['standard']])
  })

  it('档案中存在未知 code 记录时出现兜底页签;无记录时不占位', () => {
    const without = mountBar(history([[9, '忌炎']]))
    expect(without.findAll('.pool-tab')).toHaveLength(4)

    const withUnknown = mountBar([...history([[9, '忌炎']]), record({ cardPoolType: 99 })])
    const tabs = withUnknown.findAll('.pool-tab')
    expect(tabs).toHaveLength(5)
    expect(tabs[4]!.text()).toBe('未知调谐池')
  })
})

describe('类别内二级池切换', () => {
  it('只显示档案中实际有数据的池 code(官方池名);点击回传 select-pool', async () => {
    const records = [
      ...history([[9, '忌炎']], 1),
      ...history([[19, '守岸人']], 8),
    ]
    const wrapper = mountBar(records, 'limitedChar', 1)
    const subs = wrapper.findAll('.pool-sub-tab')

    expect(subs.map((sub) => sub.text())).toEqual(['角色精准调谐', '角色新旅调谐'])
    expect(subs[0]!.classes()).toContain('is-active')

    await subs[1]!.trigger('click')
    expect(wrapper.emitted('select-pool')).toEqual([[8]])
  })

  it('类别完全无数据时不渲染二级切换(内容区空态由名册负责)', () => {
    const wrapper = mountBar(history([[9, '忌炎']], 1), 'standard', 3)

    expect(wrapper.find('.pool-sub').exists()).toBe(false)
  })
})

describe('顶部汇总指标行(随页签联动)', () => {
  it('显示总唤取、五星数、平均出货;歪率仅角色系限定池有值', () => {
    // 池 1:40 抽歪(维里奈) + 10 抽 UP(忌炎) → 歪率 50%
    const char = mountBar(history([[39, '维里奈'], [9, '忌炎']]), 'limitedChar', 1)
    const charStats = char.find('.tabs-status')
    expect(charStats.text()).toContain('总唤取 50')
    expect(charStats.text()).toContain('五星 2')
    expect(charStats.text()).toContain('平均出货 25.0')
    expect(charStats.text()).toContain('歪率 50%')

    // 武器系(必中 UP,无歪率):poolCode 换成 2 后指标随池联动
    const weapon = mountBar(
      [...history([[20, '千古洑流']], 2, '武器'), ...history([[39, '维里奈']])],
      'limitedWeapon',
      2,
    )
    const weaponStats = weapon.find('.tabs-status')
    expect(weaponStats.text()).toContain('总唤取 21')
    expect(weaponStats.text()).toContain('五星 1')
    expect(weaponStats.text()).toContain('平均出货 21.0')
    expect(weaponStats.text()).not.toContain('歪率')
  })

  it('本池无五星时平均出货显示「—」,无歪率', () => {
    const wrapper = mountBar(fillers(5, 3), 'standard', 3)

    expect(wrapper.find('.tabs-status').text()).toContain('平均出货 —')
    expect(wrapper.find('.tabs-status').text()).not.toContain('歪率')
  })

  it('未知池兜底页签做浅统计:总唤取按未知池数据计', () => {
    const records = [record({ cardPoolType: 99 }), ...fillers(9, 99)]
    const wrapper = mountBar(records, 'unknown', 99)

    expect(wrapper.find('.tabs-status').text()).toContain('总唤取 10')
  })
})
