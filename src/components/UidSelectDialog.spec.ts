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

import UidSelectDialog from './UidSelectDialog.vue'
import { useRecordsStore } from '@/stores/records'

const CN_URL =
  'https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?svr_id=76402e5b&player_id=106485288&lang=zh-Hans&gacha_id=100074&gacha_type=1&svr_area=cn&record_id=acdf99a1&resources_id=c9fbcd24&platform=PC'
const OVERSEA_URL =
  'https://aki-gm-resources-oversea.aki-game.net/aki/gacha/index.html#/record?svr_id=ee5066f9&player_id=882210234&lang=en-US&gacha_id=100074&gacha_type=1&svr_area=oversea&record_id=bb771234&resources_id=dd559012&platform=PC'

function mountDialog() {
  // 同一个 pinia 实例既激活又挂载,测试里 useRecordsStore() 拿到的就是组件用的 store
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(UidSelectDialog, { global: { plugins: [pinia] } })
}

describe('UID 选择弹窗(#05)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mocks.loadRecords.mockResolvedValue([])
    mocks.insertRecords.mockResolvedValue(1)
  })

  it('没有待选择的 UID 时不渲染', () => {
    const wrapper = mountDialog()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('逐行展示检测到的 UID,已有档案与新档案可辨识', async () => {
    const wrapper = mountDialog()
    const store = useRecordsStore()
    store.pendingUids = [
      { playerId: '106485288', url: CN_URL, archive: null },
      {
        playerId: '882210234',
        url: OVERSEA_URL,
        archive: { playerId: '882210234', count: 130, firstTime: '2025-04-01 10:00:00', lastTime: '2025-05-05 10:00:00' },
      },
    ]
    await nextTick()

    const rows = wrapper.findAll('.uid-row')

    expect(wrapper.find('[role="dialog"]').attributes('aria-label')).toBe('选择要导入的档案')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('UID 106485288')
    expect(rows[0]!.text()).toContain('新档案')
    expect(rows[1]!.text()).toContain('UID 882210234')
    expect(rows[1]!.text()).toContain('已有档案')
    expect(rows[1]!.text()).toContain('130 条记录')
    expect(rows[1]!.text()).toContain('2025-04-01')
    expect(rows[1]!.text()).toContain('2025-05-05')
  })

  it('点击某个 UID 行即导入该 UID 的档案', async () => {
    mocks.queryPool.mockResolvedValue(
      JSON.stringify({ code: 0, data: [{ cardPoolType: '角色精准调谐', resourceId: 1, qualityLevel: 5, resourceType: '角色', name: '长离', count: 1, time: '2025-05-01 10:00:00' }] }),
    )
    const wrapper = mountDialog()
    const store = useRecordsStore()
    store.pendingUids = [
      { playerId: '106485288', url: CN_URL, archive: null },
      { playerId: '882210234', url: OVERSEA_URL, archive: null },
    ]
    await nextTick()

    await wrapper.findAll('.uid-row')[1]!.trigger('click')
    // chooseUid 一开始就清空待选列表,等整条管线跑完再断言
    await vi.waitFor(() => {
      expect(store.syncing).toBe(false)
      expect(store.message?.kind).toBe('success')
    })

    expect(mocks.queryPool).toHaveBeenCalledTimes(13)
    expect(store.playerId).toBe('882210234')
  })

  it('点击取消清空待选列表,不发起任何拉取', async () => {
    const wrapper = mountDialog()
    const store = useRecordsStore()
    store.pendingUids = [{ playerId: '106485288', url: CN_URL, archive: null }]
    await nextTick()

    await wrapper.find('button.dialog-cancel').trigger('click')

    expect(store.pendingUids).toBeNull()
    expect(mocks.queryPool).not.toHaveBeenCalled()
  })
})
