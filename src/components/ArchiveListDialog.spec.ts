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

import ArchiveListDialog from './ArchiveListDialog.vue'
import { useRecordsStore } from '@/stores/records'
import type { ArchiveSummary } from '@/domain/archives'
import type { GachaRecord } from '@/domain/records'

function record(name: string): GachaRecord {
  return {
    cardPoolType: 1,
    cardPoolId: 100074,
    time: '2025-05-01 10:00:00',
    name,
    qualityLevel: 5,
    resourceId: '21010043',
    resourceType: '角色',
  }
}

const ARCHIVES: ArchiveSummary[] = [
  { playerId: '882210234', count: 130, firstTime: '2025-04-01 10:00:00', lastTime: '2025-05-05 10:00:00' },
  { playerId: '106485288', count: 13, firstTime: '2025-05-01 10:00:00', lastTime: '2025-05-01 10:00:00' },
]

function mountDialog() {
  // 同一个 pinia 实例既激活又挂载,测试里 useRecordsStore() 拿到的就是组件用的 store
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(ArchiveListDialog, { global: { plugins: [pinia] } })
}

describe('档案列表弹窗(#05 最小切换入口)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('列表未打开时不渲染', () => {
    const wrapper = mountDialog()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('展示库内档案(记录数/最近更新),当前档案带标记', async () => {
    const wrapper = mountDialog()
    const store = useRecordsStore()
    store.playerId = '882210234'
    store.archives = ARCHIVES
    store.archiveListOpen = true
    await nextTick()

    const dialog = wrapper.find('[role="dialog"]')
    const rows = wrapper.findAll('.archive-row')

    expect(dialog.attributes('aria-label')).toBe('选择档案')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('UID 882210234')
    expect(rows[0]!.text()).toContain('130 条记录')
    expect(rows[0]!.text()).toContain('2025-05-05')
    expect(rows[0]!.classes()).toContain('is-current')
    expect(rows[0]!.text()).toContain('当前')
    expect(rows[1]!.classes()).not.toContain('is-current')
  })

  it('点击其他档案即切换,名册整体替换且列表关闭', async () => {
    const wrapper = mountDialog()
    const store = useRecordsStore()
    store.playerId = '882210234'
    store.records = [record('维里奈')]
    store.archives = ARCHIVES
    store.archiveListOpen = true
    await nextTick()
    mocks.loadRecords.mockImplementation(async (playerId: string) =>
      playerId === '106485288' ? [record('长离')] : [record('维里奈')],
    )

    await wrapper.findAll('.archive-row')[1]!.trigger('click')

    expect(store.playerId).toBe('106485288')
    expect(store.records).toHaveLength(1)
    expect(store.records[0]!.name).toBe('长离')
    expect(store.archiveListOpen).toBe(false)
  })

  it('点击关闭只收起列表,档案不变', async () => {
    const wrapper = mountDialog()
    const store = useRecordsStore()
    store.playerId = '882210234'
    store.archives = ARCHIVES
    store.archiveListOpen = true
    await nextTick()

    await wrapper.find('button.dialog-cancel').trigger('click')

    expect(store.archiveListOpen).toBe(false)
    expect(store.playerId).toBe('882210234')
  })
})
