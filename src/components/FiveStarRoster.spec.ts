import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { GachaRecord } from '@/domain/records'
import FiveStarRoster from './FiveStarRoster.vue'

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
function history(
  segments: Array<[pullsBefore: number, five: string]>,
  poolCode = 1,
): GachaRecord[] {
  const asc: GachaRecord[] = []
  for (const [pullsBefore, five] of segments) {
    asc.push(...fillers(pullsBefore, poolCode))
    asc.push(record({ cardPoolType: poolCode, name: five, qualityLevel: 5, resourceType: '角色' }))
  }
  return [...asc].reverse()
}

function mountRoster(records: GachaRecord[], poolCode = 1) {
  return mount(FiveStarRoster, { props: { records, poolCode } })
}

describe('名册网格:时间倒序与卡片内容', () => {
  it('最新五星在前;卡片含头像字牌、名字、类型小标、出货大数字 + 微条、徽章、日期', () => {
    const wrapper = mountRoster(history([[39, '维里奈'], [9, '忌炎']]))
    const tiles = wrapper.findAll('.ftile')
    expect(tiles).toHaveLength(2)
    expect(tiles[0]!.find('.ft-name').text()).toBe('忌炎')

    const card = tiles[0]!
    // 忌炎无打包资产 → 缺图回退首字字牌
    expect(card.find('img').exists()).toBe(false)
    expect(card.find('.avatar-fb').text()).toBe('忌')
    // 记录无属性数据,小标展示 resourceType(角色/武器)
    expect(card.find('.ft-el').text()).toBe('角色')
    expect(card.find('.ft-pulls b').text()).toBe('10')
    expect(card.find('.ft-pulls').text()).toContain('抽出货')
    expect(card.find('.ft-bar i').attributes('style')).toContain('width')
    expect(card.find('.ft-badge').text()).toBe('UP')
    expect(card.find('.ft-date').text()).toBe('2025-05-01')
  })

  it('打包名单内的物品显示头像图', () => {
    const wrapper = mountRoster(history([[9, '卡卡罗']]))
    expect(wrapper.find('.ftile img').exists()).toBe(true)
  })
})

describe('UP / 歪两态', () => {
  it('UP 卡 up 态 + 实心 UP 徽章;歪卡 off 态 + 歪徽章', () => {
    const wrapper = mountRoster(history([[9, '忌炎'], [9, '维里奈']]))
    const tiles = wrapper.findAll('.ftile')
    // 时间倒序:维里奈最新在前(歪),忌炎其后(UP)
    expect(tiles[0]!.classes()).toContain('off')
    expect(tiles[0]!.find('.ft-badge').text()).toBe('歪')
    expect(tiles[1]!.classes()).toContain('up')
    expect(tiles[1]!.find('.ft-badge').text()).toBe('UP')
  })
})

describe('程度着色与 62 抽期望参考线', () => {
  it('数字与微条按程度着色:≤20 绿 / ≥70 红 / 其余中性', () => {
    const wrapper = mountRoster(history([[8, '忌炎'], [75, '维里奈']]))
    const tiles = wrapper.findAll('.ftile')
    expect(tiles[0]!.find('.ft-pulls b').classes()).toContain('n-unlucky')
    expect(tiles[0]!.find('.ft-bar i').classes()).toContain('bar-unlucky')
    expect(tiles[1]!.find('.ft-pulls b').classes()).toContain('n-lucky')
    expect(tiles[1]!.find('.ft-bar i').classes()).toContain('bar-lucky')
  })

  it('角色系微条带 62 抽期望刻线(社区口径标注),武器系不显示', () => {
    const wrapper = mountRoster(history([[8, '忌炎']]), 1)
    const ref = wrapper.find('.ft-ref')
    expect(ref.exists()).toBe(true)
    expect(ref.attributes('title')).toContain('社区口径')
    expect(wrapper.find('.ref-mark').exists()).toBe(true)

    const weapon = mountRoster(history([[20, '千古洑流']], 2), 2)
    expect(weapon.find('.ft-ref').exists()).toBe(false)
  })
})

describe('名册头部', () => {
  it('五星计数与汇总芯片:UP n · 歪 n · 超欧 n · 超非 n', () => {
    const wrapper = mountRoster(history([[8, '忌炎'], [39, '忌炎'], [75, '维里奈']]))
    expect(wrapper.find('.roster-count').text()).toContain('3')
    const sums = wrapper.findAll('.sum')
    expect(sums.map((s) => s.text())).toEqual(['UP 2', '歪 1', '超欧 1', '超非 1'])
  })
})

describe('常驻池特例', () => {
  it('出货超 80 微条按实际长度;同名第二次出现标「重复」;芯片只计重复', () => {
    const wrapper = mountRoster(history([[204, '安可'], [62, '凌阳'], [26, '安可']], 3), 3)
    const tiles = wrapper.findAll('.ftile')
    // 时间倒序:最新安可(27 抽)标重复,凌阳与最早安可(205 抽)不标
    expect(tiles[0]!.find('.ft-badge').text()).toBe('重复')
    expect(tiles[1]!.find('.ft-badge').exists()).toBe(false)
    expect(tiles[2]!.find('.ft-badge').exists()).toBe(false)
    // 分母取全池最大出货 205:27 → 13%,205 → 100%
    expect(tiles[0]!.find('.ft-bar i').attributes('style')).toContain('13%')
    expect(tiles[2]!.find('.ft-bar i').attributes('style')).toContain('100%')
    expect(wrapper.findAll('.sum').map((s) => s.text())).toEqual(['重复 1'])
  })
})

describe('选中与详情条联动', () => {
  it('默认选中最新;点击其他卡片后详情条切换为该五星完整信息', async () => {
    const wrapper = mountRoster(history([[39, '维里奈'], [9, '忌炎']]))
    expect(wrapper.find('.detail-strip').text()).toContain('忌炎')

    const tiles = wrapper.findAll('.ftile')
    await tiles[1]!.trigger('click')

    expect(wrapper.findAll('.ftile')[1]!.classes()).toContain('is-sel')
    const strip = wrapper.find('.detail-strip')
    expect(strip.text()).toContain('维里奈')
    expect(strip.text()).not.toContain('忌炎')
    // 完整信息:池、出货抽数、UP、时间、资源 ID
    expect(strip.text()).toContain('角色精准调谐')
    expect(strip.text()).toContain('40')
    expect(strip.text()).toContain('2025-05-01')
    expect(strip.text()).toContain('21050001')
    expect(strip.find('.badge').text()).toBe('歪')
  })

  it('键盘 Enter / Space 可选中卡片', async () => {
    const wrapper = mountRoster(history([[39, '维里奈'], [9, '忌炎']]))
    const tiles = wrapper.findAll('.ftile')
    await tiles[1]!.trigger('keydown.enter')
    expect(wrapper.find('.detail-strip').text()).toContain('维里奈')

    await wrapper.findAll('.ftile')[0]!.trigger('keydown.space')
    expect(wrapper.find('.detail-strip').text()).toContain('忌炎')
  })

  it('卡片为原生 button,可 Tab 聚焦(全局 focus-visible 生效的前提)', () => {
    const wrapper = mountRoster(history([[9, '忌炎']]))
    expect(wrapper.find('.ftile').element.tagName).toBe('BUTTON')
  })

  it('池内最早记录即五星的卡,详情条标「不完整」', () => {
    const asc = [record({ name: '忌炎', qualityLevel: 5, resourceType: '角色' }), ...fillers(9)]
    const wrapper = mountRoster([...asc].reverse())
    expect(wrapper.find('.detail-strip').text()).toContain('不完整')
  })
})

describe('长线名册与空态', () => {
  it('52 个五星全部渲染,名册容器具备内部滚动结构(grid + overflow)', () => {
    const segments = Array.from(
      { length: 52 },
      (_, i) => [39, i % 2 === 0 ? '忌炎' : '维里奈'] as [number, string],
    )
    const wrapper = mountRoster(history(segments))
    expect(wrapper.findAll('.ftile')).toHaveLength(52)
    expect(wrapper.find('.roster').exists()).toBe(true)
  })

  it('本池无任何记录时显示空态,无进行中卡,详情条不渲染', () => {
    const wrapper = mountRoster([], 1)
    expect(wrapper.findAll('.ftile')).toHaveLength(0)
    expect(wrapper.find('.ipcard').exists()).toBe(false)
    expect(wrapper.find('.detail-strip').exists()).toBe(false)
    expect(wrapper.find('.roster-count').text()).toContain('0')
    expect(wrapper.text()).toContain('本池暂无五星记录')
  })
})

describe('名册首位「进行中」卡(#10)', () => {
  /** 最新五星之后仍在垫抽的流水:池内 39 抽出货忌炎,其后又垫了 17 抽 */
  function historyWithTrailing(trailing: number): GachaRecord[] {
    const asc = [...fillers(39), record({ name: '忌炎', qualityLevel: 5, resourceType: '角色' }), ...fillers(trailing)]
    return [...asc].reverse()
  }

  it('名册首位为虚线进行中卡:已垫大数字 + 距必得剩余 + 当前池名', () => {
    const wrapper = mountRoster(historyWithTrailing(17))

    const ghost = wrapper.find('.ipcard')
    expect(ghost.exists()).toBe(true)
    expect(ghost.find('.ft-name').text()).toBe('进行中')
    expect(ghost.find('.ft-sub').text()).toBe('角色精准调谐')
    expect(ghost.find('.ft-pulls b').text()).toBe('17')
    expect(ghost.find('.ip-note').text()).toBe('距必得五星还差 63 抽')
  })

  it('进行中卡在五星卡之前,不占用 .ftile 名册卡的计数与序位', () => {
    const wrapper = mountRoster(historyWithTrailing(17))
    const tiles = wrapper.findAll('.ftile')
    expect(tiles).toHaveLength(1)
    expect(tiles[0]!.find('.ft-name').text()).toBe('忌炎')
    expect(wrapper.find('.roster-count').text()).toContain('1')
  })

  it('池有垫抽但尚无五星:进行中卡替代空态出现', () => {
    const wrapper = mountRoster(fillers(10))
    expect(wrapper.find('.ipcard').exists()).toBe(true)
    expect(wrapper.find('.ip-note').text()).toBe('距必得五星还差 70 抽')
    expect(wrapper.findAll('.ftile')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('本池暂无五星记录')
  })

  it('当前池无任何记录时不显示进行中卡', () => {
    const wrapper = mountRoster([...fillers(17, 2)].reverse(), 1)
    expect(wrapper.find('.ipcard').exists()).toBe(false)
  })
})
