import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import App from './App.vue'

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  }),
}))

function mountApp() {
  return mount(App, { global: { plugins: [createPinia()] } })
}

describe('应用壳(冒烟)', () => {
  it('渲染顶栏品牌与三个占位入口', () => {
    const wrapper = mountApp()

    expect(wrapper.find('.brand-name').text()).toBe('唤取档案')
    expect(wrapper.text()).toContain('一键同步')
    expect(wrapper.text()).toContain('记录')
    expect(wrapper.find('button[aria-label="打开设置"]').exists()).toBe(true)
  })

  it('渲染主画面空态', () => {
    const wrapper = mountApp()

    expect(wrapper.find('.empty-title').text()).toBe('尚无唤取档案')
    expect(wrapper.find('.empty-hint').text()).toContain('一键同步')
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
  it('窗口标题/产品名按「唤取档案」定名,打包不配置安装器(ADR-0008)', async () => {
    const conf = (await import('../src-tauri/tauri.conf.json')).default

    expect(conf.productName).toBe('唤取档案')
    expect(conf.app.windows[0]!.title).toBe('唤取档案')
    expect(conf.bundle.targets).toEqual([])
  })

  it('package.json 与 tauri.conf.json 的版本号保持一致(状态栏版本号的单一事实来源)', async () => {
    const pkg = (await import('../package.json')).default
    const conf = (await import('../src-tauri/tauri.conf.json')).default

    expect(conf.version).toBe(pkg.version)
    expect(__APP_VERSION__).toBe(pkg.version)
  })
})
