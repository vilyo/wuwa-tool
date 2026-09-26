import { describe, expect, it } from 'vitest'
import { LinkInvalidError, NetworkError } from './errors'
import { parseGachaLink } from './link'
import type { ClockPort, GachaApiPort, PoolQueryRequest, StoragePort } from './ports'
import type { GachaRecord } from './records'
import { POOL_INTERVAL_MIN_MS, POOL_INTERVAL_MS, syncAll } from './syncAll'

const LINK = parseGachaLink(
  'https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?svr_id=76402e5bd7&player_id=106485288&lang=zh-Hans&gacha_id=100074&gacha_type=1&svr_area=cn&record_id=acdf99a1abc&resources_id=c9fbcd24def&platform=PC',
)

function apiData(time: string): string {
  return JSON.stringify({
    code: 0,
    message: 'ok',
    data: [
      {
        cardPoolType: '角色精准调谐',
        resourceId: 21010043,
        qualityLevel: 5,
        resourceType: '角色',
        name: '长离',
        count: 1,
        time,
      },
    ],
  })
}

/** 可按池 code 定制响应/失败的网络端口,并按时间线记录请求次序 */
function fakeApi(byCode: (code: number) => string | Error) {
  const codes: number[] = []
  const api: GachaApiPort = {
    async queryPool(request: PoolQueryRequest) {
      codes.push(request.cardPoolType)
      const outcome = byCode(request.cardPoolType)
      if (outcome instanceof Error) throw outcome
      return outcome
    },
  }
  return { api, codes }
}

function fakeStorage() {
  const db: GachaRecord[] = []
  const storage: StoragePort = {
    async loadRecords() {
      return [...db]
    },
    async insertRecords(_playerId, batch) {
      db.push(...batch)
      return batch.length
    },
  }
  return { storage, db }
}

function fakeClock() {
  const sleeps: number[] = []
  const clock: ClockPort = {
    now: () => 0,
    async sleep(ms) {
      sleeps.push(ms)
    },
  }
  return { clock, sleeps }
}

describe('全池同步编排', () => {
  it('逐池串行请求全部已知卡池 code(1..=13),链接参数逐池复用', async () => {
    const { api, codes } = fakeApi((code) => apiData(`2025-05-01 10:${String(code).padStart(2, '0')}:00`))
    const { storage } = fakeStorage()
    const { clock } = fakeClock()

    const result = await syncAll(LINK, { api, storage, clock })

    expect(codes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    expect(result.pools.map((pool) => pool.poolCode)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    expect(result.fetched).toBe(13)
    expect(result.added).toBe(13)
    expect(result.total).toBe(13)
  })

  it('相邻池请求间隔默认 1s(下限 600ms),间隔经时钟注入', async () => {
    const { api } = fakeApi(() => apiData('2025-05-01 10:00:00'))
    const { storage } = fakeStorage()
    const { clock, sleeps } = fakeClock()

    await syncAll(LINK, { api, storage, clock })

    // 13 池之间共 12 次间隔,首池前与末池后不限速
    expect(sleeps).toEqual(Array.from({ length: 12 }, () => POOL_INTERVAL_MS))
    expect(POOL_INTERVAL_MS).toBeGreaterThanOrEqual(POOL_INTERVAL_MIN_MS)
    expect(POOL_INTERVAL_MIN_MS).toBe(600)
  })

  it('每池请求前回调进度:「正在获取 卡池 x/13」的 x 为正在请求的第几个池', async () => {
    const { api, codes } = fakeApi(() => apiData('2025-05-01 10:00:00'))
    const { storage } = fakeStorage()
    const { clock } = fakeClock()
    const timeline: string[] = []

    const result = await syncAll(LINK, { api, storage, clock }, (progress) => {
      timeline.push(`进度${progress.index}/${progress.total}池${progress.poolCode}`)
    })
    for (const code of codes) timeline.push(`请求${code}`)

    expect(timeline[0]).toBe('进度1/13池1')
    expect(timeline.filter((entry) => entry.startsWith('进度'))).toHaveLength(13)
    // 每个进度事件先于对应池的请求发出
    for (let i = 0; i < 13; i++) {
      expect(timeline.indexOf(`进度${i + 1}/13池${i + 1}`)).toBeLessThan(timeline.indexOf(`请求${i + 1}`))
    }
    expect(result.pools).toHaveLength(13)
  })

  it('任一池 code != 0:立即停止后续池请求,已拉到的池数据照常入库保留', async () => {
    const { api, codes } = fakeApi((code) =>
      code === 4 ? JSON.stringify({ code: -100, message: 'expired' }) : apiData('2025-05-01 10:00:00'),
    )
    const { storage, db } = fakeStorage()
    const { clock, sleeps } = fakeClock()

    const error = await syncAll(LINK, { api, storage, clock }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(LinkInvalidError)
    expect(codes).toEqual([1, 2, 3, 4])
    expect(db.map((record) => record.cardPoolType)).toEqual([1, 2, 3])
    expect(sleeps).toHaveLength(3)
  })

  it('池内网络类失败沿用单池重试:恢复后继续后续池', async () => {
    const networkError = new NetworkError('超时')
    const { api, codes } = fakeApi((code) => {
      if (code === 2) {
        retries[code] = (retries[code] ?? 0) + 1
        if (retries[code]! <= 2) throw networkError
      }
      return apiData('2025-05-01 10:00:00')
    })
    const retries: Record<number, number> = {}
    const { storage } = fakeStorage()
    const { clock, sleeps } = fakeClock()

    const result = await syncAll(LINK, { api, storage, clock })

    expect(codes.filter((code) => code === 2)).toHaveLength(3)
    expect(result.added).toBe(13)
    // 池 1→2 间隔、两次重试间隔、池 2→3 间隔,其后 10 个池间隔
    expect(sleeps).toEqual(Array.from({ length: 14 }, () => POOL_INTERVAL_MS))
  })

  it('重试限次耗尽:中止本次同步,后续池不再请求,已入库的池保留', async () => {
    const networkError = new NetworkError('超时')
    const { api, codes } = fakeApi((code) => (code === 2 ? networkError : apiData('2025-05-01 10:00:00')))
    const { storage, db } = fakeStorage()
    const { clock } = fakeClock()

    const error = await syncAll(LINK, { api, storage, clock }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NetworkError)
    expect(codes).toEqual([1, 2, 2, 2, 2])
    expect(db.map((record) => record.cardPoolType)).toEqual([1])
  })
})
