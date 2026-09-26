import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
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
