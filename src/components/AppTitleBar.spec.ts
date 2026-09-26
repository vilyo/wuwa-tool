import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryPool: vi.fn(),
  loadRecords: vi.fn(),
  insertRecords: vi.fn(),
  listArchives: vi.fn(),
  probeGameDir: vi.fn(),
  extractLinks: vi.fn(),
  pickGameDirectory: vi.fn(),
  clearArchive: vi.fn(),
  writeTextFile: vi.fn(),
  readTextFile: vi.fn(),
  pickBackupSavePath: vi.fn(),
  pickBackupOpenPath: vi.fn(),
}))

vi.mock('@/services/tauriPorts', () => ({
  tauriGachaApi: { queryPool: mocks.queryPool },
  tauriStorage: { loadRecords: mocks.loadRecords, insertRecords: mocks.insertRecords },
  realClock: { now: () => 0, sleep: vi.fn() },
  listArchives: mocks.listArchives,
  tauriDirProbe: { probeGameDir: mocks.probeGameDir, extractLinks: mocks.extractLinks },
  pickGameDirectory: mocks.pickGameDirectory,
  clearArchive: mocks.clearArchive,
  tauriBackupFile: { writeTextFile: mocks.writeTextFile, readTextFile: mocks.readTextFile },
  pickBackupSavePath: mocks.pickBackupSavePath,
  pickBackupOpenPath: mocks.pickBackupOpenPath,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  }),
}))

import AppTitleBar from './AppTitleBar.vue'
import { useRecordsStore } from '@/stores/records'

const GAME_DIR = 'C:\\Wuthering Waves Game'
const CN_URL =
  'https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?svr_id=76402e5b&player_id=106485288&lang=zh-Hans&gacha_id=100074&gacha_type=1&svr_area=cn&record_id=acdf99a1&resources_id=c9fbcd24&platform=PC'

function mountBar() {
  // 同一个 pinia 实例既激活又挂载,需要时测试里可直接取 store 造状态
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(AppTitleBar, { global: { plugins: [pinia] } })
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

describe('顶栏「记录」抽屉入口(#11)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('「记录」按钮带 aria 标注,点击向 App 发出 open-records', async () => {
    const wrapper = mountBar()

    const button = wrapper.findAll('button').find((b) => b.text().includes('记录'))!
    expect(button.attributes('aria-label')).toBe('打开唤取记录')

    await button.trigger('click')

    expect(wrapper.emitted('open-records')).toHaveLength(1)
  })
})

describe('顶栏「设置」入口(#12)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('「设置」按钮带 aria 标注,点击向 App 发出 open-settings', async () => {
    const wrapper = mountBar()

    const button = wrapper.find('button[aria-label="打开设置"]')
    expect(button.exists()).toBe(true)

    await button.trigger('click')

    expect(wrapper.emitted('open-settings')).toHaveLength(1)
  })
})

describe('顶栏当前档案 UID 入口(#05)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mocks.loadRecords.mockResolvedValue([])
    mocks.listArchives.mockResolvedValue([])
  })

  it('尚无档案时不显示 UID 入口', () => {
    const wrapper = mountBar()

    expect(wrapper.find('button[aria-label="切换档案"]').exists()).toBe(false)
  })

  it('展示当前档案 UID,点击打开档案列表', async () => {
    const wrapper = mountBar()
    useRecordsStore().playerId = '106485288'
    await nextTick()

    const chip = wrapper.find('button[aria-label="切换档案"]')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('UID')
    expect(chip.text()).toContain('106485288')

    await chip.trigger('click')
    expect(useRecordsStore().archiveListOpen).toBe(true)
  })

  it('获取/同步期间 UID 入口禁用,避免同步中途切换档案', async () => {
    const wrapper = mountBar()
    const store = useRecordsStore()
    store.playerId = '106485288'
    store.probing = true
    await nextTick()

    expect((wrapper.find('button[aria-label="切换档案"]').element as HTMLButtonElement).disabled).toBe(true)
  })
})
