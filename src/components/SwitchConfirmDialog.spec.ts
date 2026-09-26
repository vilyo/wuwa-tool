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
}))

vi.mock('@/services/tauriPorts', () => ({
  tauriGachaApi: { queryPool: mocks.queryPool },
  tauriStorage: { loadRecords: mocks.loadRecords, insertRecords: mocks.insertRecords },
  realClock: { now: () => 0, sleep: vi.fn() },
  listArchives: mocks.listArchives,
  tauriDirProbe: { probeGameDir: mocks.probeGameDir, extractLinks: mocks.extractLinks },
  pickGameDirectory: mocks.pickGameDirectory,
}))

import SwitchConfirmDialog from './SwitchConfirmDialog.vue'
import { parseGachaLink } from '@/domain/link'
import { useRecordsStore } from '@/stores/records'

const OVERSEA_LINK =
  'https://aki-gm-resources-oversea.aki-game.net/aki/gacha/index.html#/record?svr_id=ee5066f9&player_id=882210234&lang=en-US&gacha_id=100074&gacha_type=1&svr_area=oversea&record_id=bb771234&resources_id=dd559012&platform=PC'

function mountDialog() {
  // 同一个 pinia 实例既激活又挂载,测试里 useRecordsStore() 拿到的就是组件用的 store
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(SwitchConfirmDialog, { global: { plugins: [pinia] } })
}

describe('切换确认弹窗(#05)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mocks.loadRecords.mockResolvedValue([])
    mocks.insertRecords.mockResolvedValue(1)
  })

  it('没有待确认的切换时不渲染', () => {
    const wrapper = mountDialog()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('展示新旧两个 UID 与旧档案保留说明', async () => {
    const wrapper = mountDialog()
    const store = useRecordsStore()
    store.playerId = '106485288'
    store.pendingSwitch = { playerId: '882210234', link: parseGachaLink(OVERSEA_LINK) }
    await nextTick()

    const dialog = wrapper.find('[role="dialog"]')

    expect(dialog.attributes('aria-label')).toBe('切换档案确认')
    expect(dialog.text()).toContain('882210234')
    expect(dialog.text()).toContain('106485288')
    expect(dialog.text()).toContain('保留')
  })

  it('确认后切换到新 UID 并开始导入', async () => {
    mocks.queryPool.mockResolvedValue(
      JSON.stringify({ code: 0, data: [{ cardPoolType: '角色精准调谐', resourceId: 1, qualityLevel: 5, resourceType: '角色', name: '维里奈', count: 1, time: '2025-05-01 10:00:00' }] }),
    )
    const wrapper = mountDialog()
    const store = useRecordsStore()
    store.playerId = '106485288'
    store.pendingSwitch = { playerId: '882210234', link: parseGachaLink(OVERSEA_LINK) }
    await nextTick()

    await wrapper.find('button.dialog-confirm').trigger('click')
    await vi.waitFor(() => {
      expect(store.playerId).toBe('882210234')
    })

    expect(mocks.queryPool).toHaveBeenCalledTimes(13)
    expect(store.pendingSwitch).toBeNull()
  })

  it('取消后中止本次导入,当前档案不变', async () => {
    const wrapper = mountDialog()
    const store = useRecordsStore()
    store.playerId = '106485288'
    store.pendingSwitch = { playerId: '882210234', link: parseGachaLink(OVERSEA_LINK) }
    await nextTick()

    await wrapper.find('button.dialog-cancel').trigger('click')

    expect(store.pendingSwitch).toBeNull()
    expect(store.playerId).toBe('106485288')
    expect(mocks.queryPool).not.toHaveBeenCalled()
  })
})
