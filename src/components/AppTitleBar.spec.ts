import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryPool: vi.fn(),
  loadRecords: vi.fn(),
  insertRecords: vi.fn(),
  listArchives: vi.fn(),
  probeGameDir: vi.fn(),
  extractLinks: vi.fn(),
  pickGameDirectory: vi.fn(),
}))

vi.mock('@/services/tauriPorts', () => ({
  tauriGachaApi: { queryPool: mocks.queryPool },
  tauriStorage: { loadRecords: mocks.loadRecords, insertRecords: mocks.insertRecords },
  realClock: { now: () => 0, sleep: vi.fn() },
  listArchives: mocks.listArchives,
  tauriDirProbe: { probeGameDir: mocks.probeGameDir, extractLinks: mocks.extractLinks },
  pickGameDirectory: mocks.pickGameDirectory,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  }),
}))

import AppTitleBar from './AppTitleBar.vue'

const GAME_DIR = 'C:\\Wuthering Waves Game'
const CN_URL =
  'https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?svr_id=76402e5b&player_id=106485288&lang=zh-Hans&gacha_id=100074&gacha_type=1&svr_area=cn&record_id=acdf99a1&resources_id=c9fbcd24&platform=PC'

function mountBar() {
  return mount(AppTitleBar, { global: { plugins: [createPinia()] } })
}

describe('顶栏一键获取入口', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mocks.loadRecords.mockResolvedValue([])
    mocks.insertRecords.mockResolvedValue(1)
  })

  it('渲染金色「一键获取」入口按钮', () => {
    const wrapper = mountBar()

    const button = wrapper.find('button.tbtn.gold')
    expect(button.text()).toContain('一键获取')
    expect((button.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('点击后走「探测 → 提取 → 全池管线」,完成后按钮恢复可用', async () => {
    mocks.probeGameDir.mockResolvedValue({
      candidates: [{ path: GAME_DIR, source: 'common-scan' }],
      diagnosis: null,
    })
    mocks.extractLinks.mockResolvedValue({
      files: [],
      links: [{ playerId: '106485288', url: CN_URL }],
      diagnosis: null,
    })
    mocks.queryPool.mockResolvedValue(
      JSON.stringify({
        code: 0,
        data: [
          { cardPoolType: '角色精准调谐', resourceId: 1, qualityLevel: 5, resourceType: '角色', name: '长离', count: 1, time: '2025-05-01 10:00:00' },
        ],
      }),
    )

    const wrapper = mountBar()
    await wrapper.find('button.tbtn.gold').trigger('click')

    await vi.waitFor(() => {
      expect(mocks.queryPool).toHaveBeenCalledTimes(13)
    })
    expect(mocks.probeGameDir).toHaveBeenCalledWith(null)
    expect(mocks.extractLinks).toHaveBeenCalledWith(GAME_DIR)
    await vi.waitFor(() => {
      expect(wrapper.find('button.tbtn.gold').text()).toContain('一键获取')
      expect((wrapper.find('button.tbtn.gold').element as HTMLButtonElement).disabled).toBe(false)
    })
  })

  it('同步期间按钮显示「获取中…」并禁用', async () => {
    mocks.probeGameDir.mockResolvedValue({
      candidates: [{ path: GAME_DIR, source: 'common-scan' }],
      diagnosis: null,
    })
    mocks.extractLinks.mockResolvedValue({
      files: [],
      links: [{ playerId: '106485288', url: CN_URL }],
      diagnosis: null,
    })
    // 首池请求挂起,保持同步中的状态
    mocks.queryPool.mockImplementation(
      () => new Promise<string>(() => { /* 挂起 */ }),
    )

    const wrapper = mountBar()
    await wrapper.find('button.tbtn.gold').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.find('button.tbtn.gold').text()).toContain('获取中…')
      expect((wrapper.find('button.tbtn.gold').element as HTMLButtonElement).disabled).toBe(true)
    })
  })
})
