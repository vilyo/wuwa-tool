import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryPool: vi.fn(),
  loadRecords: vi.fn(),
  insertRecords: vi.fn(),
  listArchives: vi.fn(),
}))

vi.mock('@/services/tauriPorts', () => ({
  tauriGachaApi: { queryPool: mocks.queryPool },
  tauriStorage: { loadRecords: mocks.loadRecords, insertRecords: mocks.insertRecords },
  realClock: { now: () => 0, sleep: vi.fn() },
  listArchives: mocks.listArchives,
}))

import { useRecordsStore } from './records'

const CN_LINK =
  'https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?svr_id=76402e5b&player_id=106485288&lang=zh-Hans&gacha_id=100074&gacha_type=1&svr_area=cn&record_id=acdf99a1&resources_id=c9fbcd24&platform=PC'

function apiOk(data: unknown[]): string {
  return JSON.stringify({ code: 0, message: 'ok', data })
}

function apiItem(time: string) {
  return {
    cardPoolType: '角色精准调谐',
    resourceId: 21010043,
    qualityLevel: 5,
    resourceType: '角色',
    name: '长离',
    count: 1,
    time,
  }
}

describe('records store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('启动时恢复最近更新的档案', async () => {
    mocks.listArchives.mockResolvedValue([
      { playerId: '42', count: 1, firstTime: '2025-05-01 10:00:00', lastTime: '2025-05-01 10:00:00' },
    ])
    mocks.loadRecords.mockResolvedValue([
      { cardPoolType: 1, cardPoolId: 100074, time: '2025-05-01 10:00:00', name: '长离', qualityLevel: 5, resourceId: '21010043', resourceType: '角色' },
    ])

    const store = useRecordsStore()
    await store.init()

    expect(store.playerId).toBe('42')
    expect(store.records).toHaveLength(1)
    expect(mocks.loadRecords).toHaveBeenCalledWith('42')
  })

  it('本地无档案时保持空态,不读记录', async () => {
    mocks.listArchives.mockResolvedValue([])

    const store = useRecordsStore()
    await store.init()

    expect(store.playerId).toBeNull()
    expect(store.records).toHaveLength(0)
    expect(mocks.loadRecords).not.toHaveBeenCalled()
  })

  it('导入成功:拉取、入库、刷新展示并给出成功消息', async () => {
    mocks.loadRecords
      .mockResolvedValueOnce([]) // syncPool 合并时的既有记录
      .mockResolvedValueOnce([
        { cardPoolType: 1, cardPoolId: 100074, time: '2025-05-01 10:00:00', name: '长离', qualityLevel: 5, resourceId: '21010043', resourceType: '角色' },
      ]) // 导入后刷新
    mocks.insertRecords.mockResolvedValue(1)
    mocks.queryPool.mockResolvedValue(apiOk([apiItem('2025-05-01 10:00:00')]))

    const store = useRecordsStore()
    const ok = await store.importLink(CN_LINK)

    expect(ok).toBe(true)
    expect(mocks.queryPool).toHaveBeenCalledTimes(1)
    expect(mocks.insertRecords).toHaveBeenCalledWith('106485288', [
      expect.objectContaining({ name: '长离', cardPoolType: 1, time: '2025-05-01 10:00:00' }),
    ])
    expect(store.playerId).toBe('106485288')
    expect(store.records).toHaveLength(1)
    expect(store.message?.kind).toBe('success')
    expect(store.message?.text).toContain('新增 1 条')
  })

  it('重复导入幂等:无新增时不写库,消息提示新增 0 条', async () => {
    const existing = [
      { cardPoolType: 1, cardPoolId: 100074, time: '2025-05-01 10:00:00', name: '长离', qualityLevel: 5, resourceId: '21010043', resourceType: '角色' },
    ]
    mocks.loadRecords.mockResolvedValue(existing)
    mocks.queryPool.mockResolvedValue(apiOk([apiItem('2025-05-01 10:00:00')]))

    const store = useRecordsStore()
    await store.importLink(CN_LINK)

    expect(mocks.insertRecords).not.toHaveBeenCalled()
    expect(store.records).toHaveLength(1)
    expect(store.message?.text).toContain('新增 0 条')
  })

  it('链接无法解析时报错误消息,不发起请求', async () => {
    const store = useRecordsStore()
    const ok = await store.importLink('不是链接')

    expect(ok).toBe(false)
    expect(mocks.queryPool).not.toHaveBeenCalled()
    expect(store.message?.kind).toBe('error')
    expect(store.message?.text).toContain('唤取链接')
  })

  it('code != 0 时消息引导重开游戏内唤取记录页', async () => {
    mocks.loadRecords.mockResolvedValue([])
    mocks.queryPool.mockResolvedValue(JSON.stringify({ code: -100, message: 'expired' }))

    const store = useRecordsStore()
    await store.importLink(CN_LINK)

    expect(store.message?.kind).toBe('error')
    expect(store.message?.text).toContain('重新打开')
    expect(store.message?.text).toContain('唤取记录')
    expect(mocks.insertRecords).not.toHaveBeenCalled()
  })
})
