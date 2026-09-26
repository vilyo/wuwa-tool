import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GachaRecord } from '@/domain/records'
import type { PoolQueryRequest } from '@/domain/ports'

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

/** 内存数据库:全池多次读写累积,贴近真实 SQLite 行为 */
function seedDb(initial: GachaRecord[] = []) {
  const db = [...initial]
  mocks.loadRecords.mockImplementation(async () => [...db])
  mocks.insertRecords.mockImplementation(async (_playerId: string, batch: GachaRecord[]) => {
    db.push(...batch)
    return batch.length
  })
  return db
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

  it('导入成功:全池串行拉取(1..=13)、入库、刷新展示并给出带延迟提示的结果反馈', async () => {
    const db = seedDb()
    mocks.queryPool.mockResolvedValue(apiOk([apiItem('2025-05-01 10:00:00')]))

    const store = useRecordsStore()
    const ok = await store.importLink(CN_LINK)

    expect(ok).toBe(true)
    expect(mocks.queryPool).toHaveBeenCalledTimes(13)
    const requestedCodes = mocks.queryPool.mock.calls.map(
      (call) => (call[0] as PoolQueryRequest).cardPoolType,
    )
    expect(requestedCodes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    expect(mocks.insertRecords).toHaveBeenCalledTimes(13)
    expect(db).toHaveLength(13)
    expect(store.playerId).toBe('106485288')
    expect(store.records).toHaveLength(13)
    expect(store.message?.kind).toBe('success')
    expect(store.message?.text).toContain('新增 13 条')
    expect(store.message?.text).toContain('档案共 13 条')
    expect(store.message?.text).toContain('30 分钟')
    expect(store.message?.text).toContain('预期行为')
  })

  it('同步过程更新进度状态,完成后清空并给出结果反馈', async () => {
    seedDb()
    let resolveFirst!: (value: string) => void
    mocks.queryPool.mockImplementation(
      () => new Promise<string>((resolve) => { resolveFirst = resolve }),
    )
    const store = useRecordsStore()
    const pending = store.importLink(CN_LINK)

    await vi.waitFor(() => {
      expect(store.syncProgress).toEqual({ index: 1, total: 13, poolCode: 1 })
    })

    resolveFirst(apiOk([apiItem('2025-05-01 10:00:00')]))
    mocks.queryPool.mockResolvedValue(apiOk([apiItem('2025-05-01 10:00:00')]))
    await pending

    expect(store.syncProgress).toBeNull()
    expect(store.message?.kind).toBe('success')
  })

  it('重复导入幂等:全池二次同步无新增时不写库,消息提示新增 0 条', async () => {
    seedDb()
    mocks.queryPool.mockResolvedValue(apiOk([apiItem('2025-05-01 10:00:00')]))

    const store = useRecordsStore()
    await store.importLink(CN_LINK)
    expect(mocks.insertRecords).toHaveBeenCalledTimes(13)

    mocks.insertRecords.mockClear()
    await store.importLink(CN_LINK)

    expect(mocks.insertRecords).not.toHaveBeenCalled()
    expect(store.records).toHaveLength(13)
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

  it('任一池 code != 0:停止后续池请求,消息引导重开游戏内唤取记录页,不误报网络错误', async () => {
    seedDb()
    mocks.queryPool.mockResolvedValue(JSON.stringify({ code: -100, message: 'expired' }))

    const store = useRecordsStore()
    await store.importLink(CN_LINK)

    expect(mocks.queryPool).toHaveBeenCalledTimes(1)
    expect(mocks.insertRecords).not.toHaveBeenCalled()
    expect(store.message?.kind).toBe('error')
    expect(store.message?.text).toContain('重新打开')
    expect(store.message?.text).toContain('唤取记录')
    expect(store.message?.text).not.toContain('网络')
  })

  it('中途链接失效:已拉到的池数据照常入库保留并刷新展示', async () => {
    const db = seedDb()
    mocks.queryPool.mockImplementation((request: PoolQueryRequest) =>
      request.cardPoolType === 4
        ? Promise.resolve(JSON.stringify({ code: -100, message: 'expired' }))
        : Promise.resolve(apiOk([apiItem(`2025-05-01 10:0${request.cardPoolType}:00`)])),
    )

    const store = useRecordsStore()
    const ok = await store.importLink(CN_LINK)

    expect(ok).toBe(false)
    expect(mocks.queryPool).toHaveBeenCalledTimes(4)
    expect(db).toHaveLength(3)
    expect(store.records).toHaveLength(3)
    expect(store.message?.kind).toBe('error')
    expect(store.message?.text).toContain('重新打开')
  })
})
