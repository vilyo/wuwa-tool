import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { GachaRecord } from '@/domain/records'
import PoolVerdictLine from './PoolVerdictLine.vue'

let seq = 0

/** 单调递增时间戳,保证种子流水正序 */
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

/** 每段 [垫抽数(不含出货), 五星] 按时间正序出货 */
function history(segments: Array<[pullsBefore: number, five: string]>): GachaRecord[] {
  const asc: GachaRecord[] = []
  for (const [pullsBefore, five] of segments) {
    asc.push(...fillers(pullsBefore))
    asc.push(record({ name: five, qualityLevel: 5, resourceType: '角色' }))
  }
  return [...asc].reverse() // 库内流水为时间倒序
}

describe('本池评语行:评级菱章 + 评语 + 平均出货 + 歪率', () => {
  it('随当前池(默认角色精准调谐 code 1)数据渲染评级、评语、平均出货与歪率', () => {
    // 40 抽歪(维里奈在常驻名单) + 40 抽 UP(忌炎) → 平均 40 → A,歪率 50%
    const wrapper = mount(PoolVerdictLine, {
      props: { records: history([[39, '维里奈'], [39, '忌炎']]) },
    })

    const rank = wrapper.find('.rank-mini')
    expect(rank.text()).toBe('A')
    expect(rank.attributes('aria-label')).toBe('欧非评级 A')
    expect(rank.classes()).not.toContain('none')
    expect(wrapper.find('.vtext').text()).toBe('欧洲常驻居民')
    expect(wrapper.find('.vsub').text()).toBe('平均出货 40.0 抽 · 歪率 50%')
  })

  it('歪率 ≥80% 时追加修正项徽章「命运的反面宠儿」', () => {
    const wrapper = mount(PoolVerdictLine, {
      props: { records: history([[39, '维里奈'], [39, '维里奈'], [39, '维里奈'], [39, '维里奈'], [39, '忌炎']]) },
    })

    expect(wrapper.find('.vtext').text()).toBe('欧洲常驻居民')
    const badges = wrapper.findAll('.badge')
    expect(badges).toHaveLength(1)
    expect(badges[0]!.text()).toBe('命运的反面宠儿')
    expect(badges[0]!.classes()).toContain('badge-off')
  })

  it('≤10 抽出货追加彩蛋徽章(原型文案「出手如电 · N 抽名」)', () => {
    const wrapper = mount(PoolVerdictLine, {
      props: { records: history([[8, '忌炎'], [39, '忌炎'], [39, '维里奈']]) },
    })

    const badges = wrapper.findAll('.badge')
    expect(badges.map((b) => b.text())).toEqual(['出手如电 · 9 抽忌炎'])
    expect(badges[0]!.classes()).toContain('badge-up')
  })
})

describe('无评级场合', () => {
  it('样本不足:评级「—」隐藏菱章,评语「样本不足，多抽点再来」', () => {
    const wrapper = mount(PoolVerdictLine, {
      props: { records: history([[39, '忌炎']]) },
    })

    const rank = wrapper.find('.rank-mini')
    expect(rank.classes()).toContain('none')
    expect(rank.attributes('aria-label')).toBe('欧非评级 —')
    expect(wrapper.find('.vtext').text()).toBe('样本不足，多抽点再来')
    expect(wrapper.find('.vsub').text()).toBe('平均出货 40.0 抽 · 歪率 0%')
  })

  it('新手·感恩池:评级「—」、评语「启程之人」、说明文字替代平均出货', () => {
    const wrapper = mount(PoolVerdictLine, {
      props: {
        records: [
          ...fillers(9, 5),
          record({ cardPoolType: 5, name: '凌阳', qualityLevel: 5, resourceType: '角色' }),
        ],
        poolCode: 5,
      },
    })

    expect(wrapper.find('.rank-mini').classes()).toContain('none')
    expect(wrapper.find('.vtext').text()).toBe('启程之人')
    expect(wrapper.find('.vsub').text()).toBe('新手池规则特殊，不计入欧非总评')
  })
})

describe('随当前池数据刷新', () => {
  it('records 变化后评语行整体更新(页签联动前的最小联动能力)', async () => {
    const wrapper = mount(PoolVerdictLine, {
      props: { records: history([[39, '维里奈'], [39, '忌炎']]) },
    })
    expect(wrapper.find('.rank-mini').text()).toBe('A')

    // 档案切换为另一个池(常驻):常驻池安可 142 抽出货 → D 保底战神
    await wrapper.setProps({
      records: [
        ...fillers(141, 3),
        record({ cardPoolType: 3, name: '安可', qualityLevel: 5, resourceType: '角色' }),
      ],
      poolCode: 3,
    })

    expect(wrapper.find('.rank-mini').text()).toBe('D')
    expect(wrapper.find('.vtext').text()).toBe('保底战神')
    expect(wrapper.find('.vsub').text()).toBe('平均出货 142.0 抽') // 常驻池不显示歪率
  })
})
