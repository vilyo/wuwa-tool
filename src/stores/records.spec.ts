import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GachaRecord } from '@/domain/records'
import type { PoolQueryRequest } from '@/domain/ports'

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
    localStorage.clear()
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

describe('records store · 一键获取', () => {
  const GAME_DIR = 'C:\\Wuthering Waves Game'
  const OLD_CN_URL =
    'https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?svr_id=76402e5b&player_id=106485288&lang=zh-Hans&gacha_id=100074&gacha_type=1&svr_area=cn&record_id=old111111&resources_id=c9fbcd24&platform=PC'
  const NEW_OVERSEA_URL =
    'https://aki-gm-resources-oversea.aki-game.net/aki/gacha/index.html#/record?svr_id=ee5066f9&player_id=882210234&lang=en-US&gacha_id=100074&gacha_type=1&svr_area=oversea&record_id=bb771234&resources_id=dd559012&platform=PC'

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mocks.loadRecords.mockResolvedValue([])
    mocks.insertRecords.mockResolvedValue(1)
    mocks.queryPool.mockResolvedValue(apiOk([apiItem('2025-05-01 10:00:00')]))
  })

  it('探测到目录后提取链接,取最新一条走全池管线,并在结果中注明检测到的 UID 列表', async () => {
    mocks.probeGameDir.mockResolvedValue({
      candidates: [{ path: GAME_DIR, source: 'common-scan' }],
      diagnosis: null,
    })
    mocks.extractLinks.mockResolvedValue({
      files: [],
      links: [
        { playerId: '106485288', url: OLD_CN_URL },
        { playerId: '882210234', url: NEW_OVERSEA_URL },
      ],
      diagnosis: null,
    })

    const store = useRecordsStore()
    const ok = await store.oneClickSync()

    expect(ok).toBe(true)
    expect(mocks.probeGameDir).toHaveBeenCalledWith(null)
    expect(mocks.extractLinks).toHaveBeenCalledWith(GAME_DIR)
    // 最新一条 = 末位(国际服新链接),直接进入 #03 全池管线
    expect(mocks.queryPool).toHaveBeenCalledTimes(13)
    const firstRequest = mocks.queryPool.mock.calls[0]![0] as PoolQueryRequest
    expect(firstRequest.playerId).toBe('882210234')
    expect(firstRequest.region).toBe('oversea')
    expect(store.playerId).toBe('882210234')
    // 检测到的 UID 列表在结果里注明
    expect(store.detectedUids).toEqual(['106485288', '882210234'])
    expect(store.message?.kind).toBe('success')
    expect(store.message?.text).toContain('检测到 2 个 UID(106485288、882210234)')
    expect(store.message?.text).toContain('882210234')
  })

  it('探测不到目录时引导手动指定,选择的目录被记住并继续同步', async () => {
    mocks.probeGameDir
      .mockResolvedValueOnce({ candidates: [], diagnosis: 'no-game-dir' })
      .mockResolvedValueOnce({ candidates: [{ path: GAME_DIR, source: 'manual' }], diagnosis: null })
    mocks.pickGameDirectory.mockResolvedValue(GAME_DIR)
    mocks.extractLinks.mockResolvedValue({
      files: [],
      links: [{ playerId: '106485288', url: OLD_CN_URL }],
      diagnosis: null,
    })

    const store = useRecordsStore()
    const ok = await store.oneClickSync()

    expect(ok).toBe(true)
    expect(mocks.pickGameDirectory).toHaveBeenCalledTimes(1)
    expect(mocks.probeGameDir).toHaveBeenNthCalledWith(1, null)
    expect(mocks.probeGameDir).toHaveBeenNthCalledWith(2, GAME_DIR)
    expect(mocks.extractLinks).toHaveBeenCalledWith(GAME_DIR)
    expect(localStorage.getItem('wuwatool.gameDir')).toBe(GAME_DIR)
    expect(store.message?.kind).toBe('success')
  })

  it('记住的目录作为 manualDir 传入探测', async () => {
    localStorage.setItem('wuwatool.gameDir', GAME_DIR)
    mocks.probeGameDir.mockResolvedValue({
      candidates: [{ path: GAME_DIR, source: 'manual' }],
      diagnosis: null,
    })
    mocks.extractLinks.mockResolvedValue({
      files: [],
      links: [{ playerId: '106485288', url: OLD_CN_URL }],
      diagnosis: null,
    })

    const store = useRecordsStore()
    await store.oneClickSync()

    expect(mocks.probeGameDir).toHaveBeenCalledWith(GAME_DIR)
  })

  it('用户取消手动指定时不发起请求,保留找不到目录的指引消息', async () => {
    mocks.probeGameDir.mockResolvedValue({ candidates: [], diagnosis: 'no-game-dir' })
    mocks.pickGameDirectory.mockResolvedValue(null)

    const store = useRecordsStore()
    const ok = await store.oneClickSync()

    expect(ok).toBe(false)
    expect(mocks.queryPool).not.toHaveBeenCalled()
    expect(mocks.extractLinks).not.toHaveBeenCalled()
    expect(store.message?.kind).toBe('error')
    expect(store.message?.text).toContain('未找到游戏安装目录')
  })

  it('手动选择的目录无效时不记住选择,并给出具体指引', async () => {
    mocks.probeGameDir
      .mockResolvedValueOnce({ candidates: [], diagnosis: 'no-game-dir' })
      .mockResolvedValueOnce({ candidates: [], diagnosis: 'no-game-dir' })
    mocks.pickGameDirectory.mockResolvedValue('D:\\NotAGame')

    const store = useRecordsStore()
    const ok = await store.oneClickSync()

    expect(ok).toBe(false)
    expect(localStorage.getItem('wuwatool.gameDir')).toBeNull()
    expect(mocks.queryPool).not.toHaveBeenCalled()
    expect(store.message?.kind).toBe('error')
    expect(store.message?.text).toContain('Client 文件夹')
  })

  it('日志无链接时按诊断给出下一步指引,不进入拉取管线', async () => {
    mocks.probeGameDir.mockResolvedValue({
      candidates: [{ path: GAME_DIR, source: 'registry-uninstall' }],
      diagnosis: null,
    })
    mocks.extractLinks.mockResolvedValue({ files: [], links: [], diagnosis: 'no-link' })

    const store = useRecordsStore()
    const ok = await store.oneClickSync()

    expect(ok).toBe(false)
    expect(mocks.queryPool).not.toHaveBeenCalled()
    expect(store.message?.kind).toBe('error')
    expect(store.message?.text).toContain('唤取记录')
  })

  it('日志只读 ACL 的诊断给出解除只读的指引', async () => {
    mocks.probeGameDir.mockResolvedValue({
      candidates: [{ path: GAME_DIR, source: 'registry-uninstall' }],
      diagnosis: null,
    })
    mocks.extractLinks.mockResolvedValue({ files: [], links: [], diagnosis: 'log-denied' })

    const store = useRecordsStore()
    await store.oneClickSync()

    expect(store.message?.kind).toBe('error')
    expect(store.message?.text).toContain('只读')
  })
})
