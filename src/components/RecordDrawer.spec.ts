import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RECORD_ROW_HEIGHT } from '@/domain/recordFilter'
import type { GachaRecord } from '@/domain/records'
import RecordDrawer from './RecordDrawer.vue'

/** 与组件约定一致的测试视口高度(虚拟滚动窗口计算用) */
const VIEWPORT_H = 360

function timeAt(i: number): string {
  const total = 36000 + i // 2025-05-01 10:00:00 起每条 +1 秒,严格递增
  const hh = String(Math.floor(total / 3600)).padStart(2, '0')
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `2025-05-01 ${hh}:${mm}:${ss}`
}

function record(overrides: Partial<GachaRecord> = {}): GachaRecord {
  return {
    cardPoolType: 1,
    cardPoolId: 100074,
    time: '2025-05-01 10:00:00',
    name: '长离',
    qualityLevel: 5,
    resourceId: '21010043',
    resourceType: '角色',
    ...overrides,
  }
}

/** 大批量种子:时间与名字都带序号,i 越大越新(倒序后 index k 对应 i = count-1-k) */
function seeds(count: number, overrides: Partial<GachaRecord> = {}): GachaRecord[] {
  return Array.from({ length: count }, (_, i) =>
    record({ time: timeAt(i), name: `物品 ${i}`, qualityLevel: 3, ...overrides }),
  )
}

function mountDrawer(records: GachaRecord[], open = true) {
  // jsdom 无布局:统一把视口高度定为 360(含挂载时的测量),滚动容器另补 scrollHeight 供 clamp
  const spy = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(VIEWPORT_H)
  const wrapper = mount(RecordDrawer, {
    props: { open, records },
    attachTo: document.body,
  })
  return { wrapper, spy }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('记录抽屉(#11):渲染', () => {
  it('open=false 时不渲染任何内容', () => {
    const { wrapper } = mountDrawer(seeds(3), false)

    expect(wrapper.find('.drawer').exists()).toBe(false)
    expect(wrapper.find('.drawer-backdrop').exists()).toBe(false)
  })

  it('open 时渲染右侧抽屉:role=dialog、aria-modal、标题「唤取记录」、关闭按钮', () => {
    const { wrapper } = mountDrawer(seeds(3))

    const drawer = wrapper.find('.drawer')
    expect(drawer.attributes('role')).toBe('dialog')
    expect(drawer.attributes('aria-modal')).toBe('true')
    expect(drawer.attributes('aria-label')).toBe('唤取记录')
    expect(wrapper.find('.drawer-title').text()).toBe('唤取记录')
    expect(wrapper.find('.drawer-close').attributes('aria-label')).toBe('关闭记录抽屉')
  })

  it('每行展示时间、所属池、物品名与稀有度,并按稀有度着色(5/4/3 三档)', () => {
    const { wrapper } = mountDrawer([
      record({ time: '2025-05-01 10:00:00', name: '五星角色', cardPoolType: 1, qualityLevel: 5 }),
      record({ time: '2025-05-02 10:00:00', name: '四星武器', cardPoolType: 2, qualityLevel: 4, resourceType: '武器' }),
      record({ time: '2025-05-03 10:00:00', name: '三星材料', qualityLevel: 3 }),
    ])

    // 倒序后:rows[0] = 05-03 三星、rows[1] = 05-02 四星武器、rows[2] = 05-01 五星角色
    const rows = wrapper.findAll('.rec-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.classes()).toContain('q3')
    expect(rows[0]!.find('.rec-name').text()).toBe('三星材料')
    expect(rows[0]!.find('.rec-name').classes()).toContain('q3')
    expect(rows[0]!.text()).toContain('2025-05-03 10:00:00')
    expect(rows[0]!.text()).toContain('角色精准调谐')
    expect(rows[0]!.find('.rarity-cell').text()).toBe('3星')
    expect(rows[0]!.find('.dot').classes()).toContain('q3')

    expect(rows[1]!.classes()).toContain('q4')
    expect(rows[1]!.find('.rec-name').classes()).toContain('q4')
    expect(rows[1]!.text()).toContain('武器精准调谐')
    expect(rows[1]!.find('.dot').classes()).toContain('q4')

    expect(rows[2]!.classes()).toContain('q5')
    expect(rows[2]!.find('.rec-name').classes()).toContain('q5')
    expect(rows[2]!.find('.dot').classes()).toContain('q5')
    expect(wrapper.find('.rec-count').text()).toBe('共 3 条')
  })

  it('按时间倒序展示(库内口径防御性重排)', () => {
    const { wrapper } = mountDrawer([
      record({ time: '2025-05-01 10:00:00', name: '较早' }),
      record({ time: '2025-05-03 10:00:00', name: '最新' }),
      record({ time: '2025-05-02 10:00:00', name: '居中' }),
    ])

    const names = wrapper.findAll('.rec-row').map((row) => row.find('.rec-name').text())
    expect(names).toEqual(['最新', '居中', '较早'])
  })
})

describe('记录抽屉(#11):筛选', () => {
  const mixed = [
    record({ time: '2025-05-01 10:00:00', name: '池一五星', cardPoolType: 1, qualityLevel: 5 }),
    record({ time: '2025-05-02 10:00:00', name: '池二三星', cardPoolType: 2, qualityLevel: 3, resourceType: '武器' }),
    record({ time: '2025-05-03 10:00:00', name: '新手四星', cardPoolType: 5, qualityLevel: 4 }),
  ]

  it('稀有度芯片为单选:默认「全部」激活,点「四星」后只剩四星行且计数更新', async () => {
    const { wrapper } = mountDrawer(mixed)
    const chips = wrapper.findAll('.r-chip')
    expect(chips.map((chip) => chip.text())).toEqual(['全部', '五星', '四星', '三星'])
    expect(chips[0]!.classes()).toContain('is-active')

    await chips[2]!.trigger('click')

    const rows = wrapper.findAll('.rec-row')
    expect(rows.map((row) => row.find('.rec-name').text())).toEqual(['新手四星'])
    expect(wrapper.find('.rec-count').text()).toBe('共 1 条')
    expect(wrapper.findAll('.r-chip')[2]!.classes()).toContain('is-active')
    expect(wrapper.findAll('.r-chip')[0]!.classes()).not.toContain('is-active')
  })

  it('点回「全部」恢复全量', async () => {
    const { wrapper } = mountDrawer(mixed)
    await wrapper.findAll('.r-chip')[2]!.trigger('click')
    await wrapper.findAll('.r-chip')[0]!.trigger('click')

    expect(wrapper.findAll('.rec-row')).toHaveLength(3)
  })

  it('卡池下拉选项 = 档案中出现的池(池名兜底),选择后只显示该池', async () => {
    const { wrapper } = mountDrawer(mixed)

    const options = wrapper.findAll('option')
    expect(options.map((option) => option.text())).toEqual([
      '全部卡池',
      '角色精准调谐',
      '武器精准调谐',
      '新手调谐',
    ])

    await wrapper.find('select').setValue(5)

    expect(wrapper.findAll('.rec-row').map((row) => row.find('.rec-name').text())).toEqual(['新手四星'])
    expect(wrapper.find('.rec-count').text()).toBe('共 1 条')
  })

  it('筛选结果为空:提示 + 「清除筛选」,点击后恢复全量并复位芯片与下拉', async () => {
    const { wrapper } = mountDrawer(mixed)
    await wrapper.findAll('.r-chip')[1]!.trigger('click') // 五星只有 1 条

    await wrapper.find('select').setValue(2) // 武器池无五星 → 空

    const empty = wrapper.find('.rec-empty')
    expect(empty.text()).toContain('没有符合筛选条件的记录')
    expect(empty.find('.rec-clear').text()).toBe('清除筛选')

    await empty.find('.rec-clear').trigger('click')

    expect(wrapper.findAll('.rec-row')).toHaveLength(3)
    expect(wrapper.find('.rec-empty').exists()).toBe(false)
    expect(wrapper.findAll('.r-chip')[0]!.classes()).toContain('is-active')
  })

  it('筛选变化后滚动窗口回到顶部(避免窗口悬空)', async () => {
    const { wrapper } = mountDrawer(seeds(2000))
    const list = wrapper.find('.rec-list')
    Object.defineProperty(list.element, 'scrollHeight', {
      value: 2000 * RECORD_ROW_HEIGHT,
      configurable: true,
    })
    list.element.scrollTop = RECORD_ROW_HEIGHT * 1000
    await list.trigger('scroll')
    // 倒序后 index 1000 附近 = 物品 999 附近(± 缓冲)
    expect(wrapper.findAll('.rec-row').some((row) => row.text().includes('物品 1000'))).toBe(true)

    await wrapper.findAll('.r-chip')[3]!.trigger('click') // 重新筛选(三星=全量) → 回顶部

    const names = wrapper.findAll('.rec-row').map((row) => row.find('.rec-name').text())
    expect(names[0]).toContain('物品 1999') // 最新记录回到首行
  })
})

describe('记录抽屉(#11):空态', () => {
  it('档案为空:空态文案,不出现「清除筛选」', () => {
    const { wrapper } = mountDrawer([])

    expect(wrapper.find('.rec-empty').text()).toContain('暂无唤取记录')
    expect(wrapper.find('.rec-clear').exists()).toBe(false)
    expect(wrapper.find('.rec-count').text()).toBe('共 0 条')
  })
})

describe('记录抽屉(#11):浮层无障碍', () => {
  it('点击 backdrop 触发 close', async () => {
    const { wrapper } = mountDrawer(seeds(3))

    await wrapper.find('.drawer-backdrop').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('点击关闭按钮触发 close', async () => {
    const { wrapper } = mountDrawer(seeds(3))

    await wrapper.find('.drawer-close').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('open 时按 ESC 触发 close;close 后监听移除不再触发', async () => {
    const { wrapper } = mountDrawer(seeds(3))

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)

    await wrapper.setProps({ open: false })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1) // 不增加
  })

  it('焦点往返:打开时焦点进入抽屉(关闭按钮),关闭后回到触发按钮', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = '记录'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const { wrapper } = mountDrawer(seeds(3))
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(wrapper.find('.drawer-close').element)
    })

    await wrapper.setProps({ open: false })
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })
    wrapper.unmount()
  })
})

describe('记录抽屉(#11):虚拟滚动(2 万条种子)', () => {
  function scrollTo(wrapper: ReturnType<typeof mountDrawer>['wrapper'], row: number) {
    const list = wrapper.find('.rec-list')
    Object.defineProperty(list.element, 'scrollHeight', {
      value: 20000 * RECORD_ROW_HEIGHT,
      configurable: true,
    })
    list.element.scrollTop = RECORD_ROW_HEIGHT * row
    return list.trigger('scroll')
  }

  it('渲染行数受限:2 万条只渲染可视区 ± 缓冲,总高按全量撑起', () => {
    const { wrapper } = mountDrawer(seeds(20000))

    const rows = wrapper.findAll('.rec-row')
    // 视口 360px ≈ 10 行 + 上下各 10 行缓冲 → 远小于 20000
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(60)
    // 首屏:最新记录在顶部,最旧记录不在渲染窗口内
    expect(rows[0]!.text()).toContain('物品 19999')
    expect(rows.some((row) => row.text().includes('物品 0'))).toBe(false)
    // 占位高度 = 全量行数 × 行高(滚动条真实、跳转可定位)
    expect(wrapper.find('.rec-spacer').attributes('style')).toContain(
      `height: ${20000 * RECORD_ROW_HEIGHT}px`,
    )
  })

  it('滚动改变渲染窗口:scrollTop 移动后渲染对应区间,原窗口内容卸载', async () => {
    const { wrapper } = mountDrawer(seeds(20000))

    await scrollTo(wrapper, 10000) // 停在第 10000 行

    const texts = wrapper.findAll('.rec-row').map((row) => row.text())
    // 倒序后 index 10000 附近 = 物品 10000 附近(± 缓冲)
    expect(texts.some((text) => text.includes('物品 10000'))).toBe(true)
    expect(texts.every((text) => !text.includes('物品 19999'))).toBe(true)
  })

  it('1 万条同样流畅(渲染行数不受数据量影响)', () => {
    const { wrapper } = mountDrawer(seeds(10000))

    expect(wrapper.findAll('.rec-row').length).toBeLessThanOrEqual(60)
  })
})
