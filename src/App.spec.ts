import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { GachaRecord } from '@/domain/records'
import { useRecordsStore } from '@/stores/records'
import App from './App.vue'

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  }),
}))

// jsdom 无 Tauri 运行时:启动加载档案的 invoke 一律返回空档案列表
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => []),
}))

function mountApp(seedRecords?: GachaRecord[]) {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (seedRecords) useRecordsStore().records = seedRecords
  return mount(App, { global: { plugins: [pinia] } })
}

let seq = 0

function record(overrides: Partial<GachaRecord> = {}): GachaRecord {
  seq += 1
  const n = seq % 86400
  const hh = String(Math.floor(n / 3600)).padStart(2, '0')
  const mm = String(Math.floor((n % 3600) / 60)).padStart(2, '0')
  const ss = String(n % 60).padStart(2, '0')
  return {
    cardPoolType: 1,
    cardPoolId: 100074,
    time: `2025-05-01 ${hh}:${mm}:${ss}`,
    name: '远行者佩枪·瞭望',
    qualityLevel: 3,
    resourceId: '21050001',
    resourceType: '武器',
    ...overrides,
  }
}

describe('应用壳(冒烟)', () => {
  it('渲染顶栏品牌与入口(一键获取已接线)', () => {
    const wrapper = mountApp()

    expect(wrapper.find('.brand-name').text()).toBe('鸣潮工具箱')
    expect(wrapper.text()).toContain('一键获取')
    expect(wrapper.text()).toContain('记录')
    expect(wrapper.find('button[aria-label="打开设置"]').exists()).toBe(true)
  })

  it('渲染主画面空态', () => {
    const wrapper = mountApp()

    expect(wrapper.find('.empty-title').text()).toBe('尚无唤取档案')
    expect(wrapper.find('.empty-hint').text()).toContain('一键获取')
  })

  it('状态栏常驻显示延迟提示、6 个月窗口、隐私声明与版本号', () => {
    const wrapper = mountApp()
    const bar = wrapper.find('.statusbar').text()

    expect(bar).toContain('30 分钟后可同步')
    expect(bar).toContain('近 6 个月记录')
    expect(bar).toContain('所有数据仅保存在本机')
    expect(bar).toContain(`v${__APP_VERSION__}`)
  })
})

describe('本池评语行(#07)', () => {
  it('档案为空时不渲染评语行(空态覆盖主画面)', () => {
    const wrapper = mountApp()

    expect(wrapper.find('.verdict-line').exists()).toBe(false)
    expect(wrapper.find('.empty-title').exists()).toBe(true)
  })

  it('有档案时评语行上屏:默认角色精准调谐池,评级 + 评语 + 平均出货 + 歪率', () => {
    // 池 1:40 抽歪(维里奈在常驻名单)+ 40 抽 UP(忌炎)→ 平均 40 → A,歪率 50%
    const asc: GachaRecord[] = []
    for (let i = 0; i < 2; i += 1) {
      for (let j = 0; j < 39; j += 1) asc.push(record())
      asc.push(record({ name: i === 0 ? '维里奈' : '忌炎', qualityLevel: 5, resourceType: '角色' }))
    }
    const wrapper = mountApp([...asc].reverse()) // 库内流水为时间倒序

    const line = wrapper.find('.verdict-line')
    expect(line.exists()).toBe(true)
    expect(line.find('.rank-mini').text()).toBe('A')
    expect(line.find('.vtext').text()).toBe('欧洲常驻居民')
    expect(line.find('.vsub').text()).toBe('平均出货 40.0 抽 · 歪率 50%')
  })
})

describe('池页签与联动汇总(#09)', () => {
  /** 库内口径(时间倒序)的多池种子流水 */
  function poolHistory(
    segments: Array<[pullsBefore: number, five: string]>,
    poolCode: number,
    resourceType = '角色',
  ): GachaRecord[] {
    const asc: GachaRecord[] = []
    for (const [pullsBefore, five] of segments) {
      for (let i = 0; i < pullsBefore; i += 1) asc.push(record({ cardPoolType: poolCode }))
      asc.push(
        record({ cardPoolType: poolCode, name: five, qualityLevel: 5, resourceType }),
      )
    }
    return [...asc].reverse()
  }

  it('默认页签 = 角色精准调谐:汇总行、评语行、名册、详情条都是池 1 数据', () => {
    const records = [
      ...poolHistory([[39, '维里奈'], [39, '忌炎']], 1),
      ...poolHistory([[20, '千古洑流']], 2, '武器'),
      ...poolHistory([[9, '凌阳']], 5),
    ]
    const wrapper = mountApp(records)

    const tabs = wrapper.findAll('.pool-tab')
    expect(tabs.map((tab) => tab.text())).toEqual([
      '角色精准调谐',
      '武器精准调谐',
      '常驻调谐',
      '新手·感恩',
    ])
    expect(tabs[0]!.classes()).toContain('is-active')
    expect(wrapper.find('.tabs-status').text()).toContain('总唤取 80')
    expect(wrapper.find('.verdict-line .vtext').text()).toBe('欧洲常驻居民')
    expect(wrapper.find('.detail-strip').text()).toContain('忌炎')
    expect(wrapper.find('.detail-strip').text()).toContain('角色精准调谐')
  })

  it('切到武器精准调谐:汇总/评语/名册/详情条联动,无歪率、无 62 抽期望刻线', async () => {
    const records = [
      ...poolHistory([[39, '维里奈'], [39, '忌炎']], 1),
      ...poolHistory([[20, '千古洑流']], 2, '武器'),
    ]
    const wrapper = mountApp(records)

    await wrapper.findAll('.pool-tab')[1]!.trigger('click')

    const stats = wrapper.find('.tabs-status').text()
    expect(stats).toContain('总唤取 21')
    expect(stats).toContain('平均出货 21.0')
    expect(stats).not.toContain('歪率')
    expect(wrapper.find('.verdict-line .vsub').text()).not.toContain('歪率')
    expect(wrapper.find('.detail-strip').text()).toContain('千古洑流')
    expect(wrapper.find('.detail-strip').text()).toContain('武器精准调谐')
    expect(wrapper.find('.ref-mark').exists()).toBe(false)
  })

  it('切到无数据的常驻调谐:页签保留,二级切换不出现,内容区空态', async () => {
    const records = poolHistory([[39, '维里奈'], [39, '忌炎']], 1)
    const wrapper = mountApp(records)

    await wrapper.findAll('.pool-tab')[2]!.trigger('click')

    expect(wrapper.find('.pool-sub').exists()).toBe(false)
    expect(wrapper.find('.tabs-status').text()).toContain('平均出货 —')
    expect(wrapper.find('.roster-empty').text()).toBe('本池暂无五星记录')
  })

  it('切到新手·感恩:评级「—」、评语「启程之人」、说明替代平均出货', async () => {
    const records = [
      ...poolHistory([[39, '忌炎']], 1),
      ...poolHistory([[9, '凌阳']], 5),
    ]
    const wrapper = mountApp(records)

    await wrapper.findAll('.pool-tab')[3]!.trigger('click')

    expect(wrapper.find('.rank-mini').classes()).toContain('none')
    expect(wrapper.find('.vtext').text()).toBe('启程之人')
    expect(wrapper.find('.vsub').text()).toBe('新手池规则特殊，不计入欧非总评')
    expect(wrapper.find('.tabs-status').text()).toContain('总唤取 10')
  })

  it('未知池动态兜底页签:有未知 code 记录时出现并做浅统计,无记录时不占位', async () => {
    const withUnknown = mountApp([
      ...poolHistory([[39, '忌炎']], 1),
      ...poolHistory([[4, '未知五星']], 99),
    ])
    const tabs = withUnknown.findAll('.pool-tab')
    expect(tabs).toHaveLength(5)
    expect(tabs[4]!.text()).toBe('未知调谐池')

    await tabs[4]!.trigger('click')
    expect(withUnknown.find('.vtext').text()).toBe('未知调谐池')
    expect(withUnknown.find('.rank-mini').classes()).toContain('none')
    expect(withUnknown.find('.tabs-status').text()).toContain('总唤取 5')

    const without = mountApp(poolHistory([[39, '忌炎']], 1))
    expect(without.findAll('.pool-tab')).toHaveLength(4)
  })

  it('停在未知池页签时档案切换为无未知记录的档案:选中类别归一化回首个页签', async () => {
    const wrapper = mountApp([
      ...poolHistory([[39, '忌炎']], 1),
      ...poolHistory([[4, '未知五星']], 99),
    ])
    await wrapper.findAll('.pool-tab')[4]!.trigger('click')
    expect(wrapper.findAll('.pool-tab')[4]!.classes()).toContain('is-active')

    // 模拟切换档案:records 整体替换,未知池记录消失
    useRecordsStore().records = poolHistory([[39, '忌炎']], 1)
    await nextTick()

    const tabs = wrapper.findAll('.pool-tab')
    expect(tabs).toHaveLength(4)
    expect(tabs[0]!.classes()).toContain('is-active')
  })

  it('角色系档案含多池 code 时二级切换:切到池 8 后名册与详情条随池联动', async () => {
    const records = [
      ...poolHistory([[39, '维里奈'], [39, '忌炎']], 1),
      ...poolHistory([[19, '守岸人']], 8),
    ]
    const wrapper = mountApp(records)
    const subs = wrapper.findAll('.pool-sub-tab')
    expect(subs.map((sub) => sub.text())).toEqual(['角色精准调谐', '角色新旅调谐'])

    await subs[1]!.trigger('click')

    expect(wrapper.find('.tabs-status').text()).toContain('总唤取 20')
    expect(wrapper.find('.detail-strip').text()).toContain('守岸人')
    expect(wrapper.find('.detail-strip').text()).toContain('角色新旅调谐')
  })

  it('角色系只有非主池(code 8)有数据时,默认选中回落到首个有数据的 code', () => {
    const wrapper = mountApp(poolHistory([[19, '守岸人']], 8))

    expect(wrapper.find('.tabs-status').text()).toContain('总唤取 20')
    expect(wrapper.find('.detail-strip').text()).toContain('角色新旅调谐')
  })
})

describe('右栏:保底引线与高光时刻(#10)', () => {
  /** 库内口径(时间倒序)的多池种子流水 */
  function poolHistory(
    segments: Array<[pullsBefore: number, five: string]>,
    poolCode: number,
    resourceType = '角色',
  ): GachaRecord[] {
    const asc: GachaRecord[] = []
    for (const [pullsBefore, five] of segments) {
      for (let i = 0; i < pullsBefore; i += 1) asc.push(record({ cardPoolType: poolCode }))
      asc.push(record({ cardPoolType: poolCode, name: five, qualityLevel: 5, resourceType }))
    }
    return [...asc].reverse()
  }

  it('档案为空时右栏不渲染(主画面空态覆盖)', () => {
    const wrapper = mountApp()
    expect(wrapper.find('.rail').exists()).toBe(false)
  })

  it('有档案时右栏两栏布局:三条保底引线 + 高光时刻,名册首位进行中卡', () => {
    // 池 1:维里奈(歪)后继续垫 17 抽 → 大保底;池 2/池 3 仅垫抽
    const records: GachaRecord[] = [
      ...poolHistory([[3, '维里奈']], 1),
      ...Array.from({ length: 5 }, () => record({ cardPoolType: 2 })),
      ...Array.from({ length: 24 }, () => record({ cardPoolType: 3 })),
      ...Array.from({ length: 17 }, () => record({ cardPoolType: 1 })),
    ]
    const wrapper = mountApp(records)

    expect(wrapper.find('.rail').exists()).toBe(true)
    const fuses = wrapper.findAll('.fuse-item')
    expect(fuses).toHaveLength(3)
    expect(fuses[0]!.find('.cnt').text()).toBe('已垫 17 · 还差 63 抽')
    expect(fuses[0]!.find('.badge').text()).toBe('大保底')
    expect(wrapper.find('.ipcard').exists()).toBe(true)

    const moments = wrapper.findAll('.moment')
    expect(moments[0]!.find('.t').text()).toBe('旅途')
    expect(wrapper.findAll('.moment').some((m) => m.find('.t').text() === '大保底已就绪')).toBe(true)
  })

  it('档案只有新手池数据:引线栏与高光极端不出牌,空态占位', () => {
    const records = poolHistory([[9, '凌阳']], 5)
    const wrapper = mountApp(records)

    expect(wrapper.find('.rail').exists()).toBe(true)
    expect(wrapper.findAll('.fuse-item')).toHaveLength(0)
    expect(wrapper.find('.rail-empty').exists()).toBe(true)
    expect(wrapper.findAll('.moment')).toHaveLength(1) // 仅旅途总览
  })
})

describe('设置弹窗(#12)', () => {
  it('顶栏「设置」呼出弹窗:数据区入口上屏;ESC 关闭', async () => {
    const wrapper = mountApp()
    expect(wrapper.find('.settings-modal').exists()).toBe(false)

    await wrapper.find('button[aria-label="打开设置"]').trigger('click')

    expect(wrapper.find('.settings-modal').exists()).toBe(true)
    expect(wrapper.find('.settings-modal').attributes('role')).toBe('dialog')
    expect(wrapper.text()).toContain('导出备份')
    expect(wrapper.text()).toContain('导入恢复')
    expect(wrapper.text()).toContain('清空数据')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.find('.settings-modal').exists()).toBe(false)
  })

  it('清空走二次确认:确认层写明 UID,取消后设置弹窗保持打开', async () => {
    const wrapper = mountApp()

    await wrapper.find('button[aria-label="打开设置"]').trigger('click')
    await wrapper.findAll('button').find((b) => b.text() === '清空数据')!.trigger('click')

    expect(wrapper.find('.confirm-modal').exists()).toBe(true)

    await wrapper.findAll('button').find((b) => b.text() === '取消')!.trigger('click')
    expect(wrapper.find('.confirm-modal').exists()).toBe(false)
    expect(wrapper.find('.settings-modal').exists()).toBe(true)
  })
})

describe('记录抽屉(#11)', () => {
  it('顶栏「记录」呼出抽屉:流水行含池名与稀有度;ESC 关闭', async () => {
    const wrapper = mountApp([
      record({ name: '垫', time: '2025-05-01 09:59:00' }),
      record({ name: '忌炎', qualityLevel: 5, resourceType: '角色' }),
    ])

    expect(wrapper.find('.drawer').exists()).toBe(false)
    const button = wrapper.findAll('button').find((b) => b.text().includes('记录'))!
    await button.trigger('click')

    const drawer = wrapper.find('.drawer')
    expect(drawer.attributes('role')).toBe('dialog')
    expect(drawer.attributes('aria-modal')).toBe('true')
    const rows = wrapper.findAll('.rec-row')
    expect(rows).toHaveLength(2)
    expect(wrapper.find('.rec-count').text()).toBe('共 2 条')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.find('.drawer').exists()).toBe(false)
  })

  it('旧的全量流水过渡件已移除,主画面不再内联展示流水', () => {
    const wrapper = mountApp([record()])

    expect(wrapper.find('.record-list').exists()).toBe(false)
    expect(wrapper.find('.record-list-wrap').exists()).toBe(false)
  })
})

describe('主题切换(临时入口,#13 移交设置)', () => {
  it('点击按钮在明暗两套 tokens 间切换,明色为默认', async () => {
    const wrapper = mountApp()

    expect(document.documentElement.dataset.theme).toBe('light')

    await wrapper.find('button[aria-label="切换明暗主题"]').trigger('click')
    expect(document.documentElement.dataset.theme).toBe('dark')

    await wrapper.find('button[aria-label="切换明暗主题"]').trigger('click')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('启动自动同步(#13)', () => {
  const CN_LINK =
    'https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?svr_id=76402e5b&player_id=106485288&lang=zh-Hans&gacha_id=100074&gacha_type=1&svr_area=cn&record_id=acdf99a1&resources_id=c9fbcd24&platform=PC'

  afterEach(() => {
    localStorage.clear()
    ;(invoke as unknown as Mock).mockRestore()
  })

  it('有缓存链接且开关开:启动后自动发起同步,失败仅状态栏温和提示(接线冒烟)', async () => {
    // gacha_query 快速失败(非网络类不重试),其余命令照常返回空档案
    ;(invoke as unknown as Mock).mockImplementation(async (cmd: string) => {
      if (cmd === 'gacha_query') throw new Error('stub fail fast')
      return []
    })
    localStorage.setItem('wuwatool.autoSync', 'true')
    localStorage.setItem('wuwatool.lastSyncUrl', CN_LINK)

    const wrapper = mountApp()

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('gacha_query', expect.anything())
    })
    await vi.waitFor(() => {
      expect(wrapper.find('.statusbar').text()).toContain('自动同步失败')
    })
    // 静默:错误不进消息横幅打扰
    expect(wrapper.find('.paste-message').exists()).toBe(false)
  })

  it('无缓存链接:启动不做任何同步请求', async () => {
    const wrapper = mountApp()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(invoke).not.toHaveBeenCalledWith('gacha_query', expect.anything())
    expect(wrapper.find('.statusbar').text()).not.toContain('自动同步失败')
  })
})

describe('Tauri 配置', () => {
  it('窗口标题/产品名按「鸣潮工具箱」定名,打包不配置安装器(ADR-0008)', async () => {
    const conf = (await import('../src-tauri/tauri.conf.json')).default

    expect(conf.productName).toBe('鸣潮工具箱')
    expect(conf.app.windows[0]!.title).toBe('鸣潮工具箱')
    expect(conf.bundle.targets).toEqual([])
  })

  it('package.json 与 tauri.conf.json 的版本号保持一致(状态栏版本号的单一事实来源)', async () => {
    const pkg = (await import('../package.json')).default
    const conf = (await import('../src-tauri/tauri.conf.json')).default

    expect(conf.version).toBe(pkg.version)
    expect(__APP_VERSION__).toBe(pkg.version)
  })
})
