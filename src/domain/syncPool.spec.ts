import { describe, expect, it } from 'vitest'
import { DomainError, LinkInvalidError, NetworkError } from './errors'
import { parseGachaLink } from './link'
import type { ClockPort, GachaApiPort, PoolQueryRequest, StoragePort } from './ports'
import type { GachaRecord } from './records'
import { RETRY_INTERVAL_MS, SYNC_RETRY_LIMIT, syncPool } from './syncPool'

const LINK = parseGachaLink(
  'https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?svr_id=76402e5bd7&player_id=106485288&lang=zh-Hans&gacha_id=100074&gacha_type=1&svr_area=cn&record_id=acdf99a1abc&resources_id=c9fbcd24def&platform=PC',
)

function apiData(times: string[]): string {
  return JSON.stringify({
    code: 0,
    message: 'ok',
    data: times.map((time) => ({
      cardPoolType: '角色精准调谐',
      resourceId: 21010043,
      qualityLevel: 5,
      resourceType: '角色',
      name: ` resonator ${time}`,
      count: 1,
      time,
    })),
  })
}

function fakeApi(responses: string[]) {
  const requests: PoolQueryRequest[] = []
  const fails: Error[] = []
  const api: GachaApiPort = {
    async queryPool(request) {
      requests.push(request)
      const fail = fails.shift()
      if (fail) throw fail
      return responses[Math.min(requests.length - 1, responses.length - 1)]!
    },
  }
  return {
    api,
    requests,
    failNextWith(...errors: Error[]) {
      fails.push(...errors)
    },
  }
}

function fakeStorage(initial: GachaRecord[] = []) {
  const insertedBatches: GachaRecord[][] = []
  let db = initial
  const storage: StoragePort = {
    async loadRecords() {
      return db
    },
    async insertRecords(_playerId, batch) {
      insertedBatches.push([...batch])
      db = [...db, ...batch]
      return batch.length
    },
  }
  return { storage, insertedBatches }
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

function deps(overrides: { api?: GachaApiPort; storage?: StoragePort; clock?: ClockPort } = {}) {
  const api = overrides.api ?? fakeApi([apiData(['2025-05-01 10:00:00'])]).api
  const storage = overrides.storage ?? fakeStorage().storage
  const clock = overrides.clock ?? fakeClock().clock
  return { api, storage, clock }
}

function seedRecord(time: string): GachaRecord {
  return {
    cardPoolType: 1,
    cardPoolId: 100074,
    time,
    name: ` resonator ${time}`,
    qualityLevel: 5,
    resourceId: '21010043',
    resourceType: '角色',
  }
}

describe('单池拉取编排', () => {
  it('按链接参数构造单池请求,拉取全量后合并入库,只写入新增集', async () => {
    const { api, requests } = fakeApi([
      apiData(['2025-05-01 10:00:00', '2025-05-02 11:30:00']),
    ])
    const storage = fakeStorage([seedRecord('2025-05-01 10:00:00')])

    const result = await syncPool(LINK, deps({ api, storage: storage.storage }))

    expect(requests).toHaveLength(1)
    expect(requests[0]).toEqual({
      region: 'cn',
      playerId: '106485288',
      recordId: 'acdf99a1abc',
      cardPoolId: 'c9fbcd24def',
      cardPoolType: 1,
      serverId: '76402e5bd7',
      languageCode: 'zh-Hans',
    })
    expect(storage.insertedBatches).toEqual([
      [seedRecord('2025-05-02 11:30:00')],
    ])
    expect(result).toEqual({ poolCode: 1, fetched: 2, added: 1, total: 2 })
  })

  it('同一链接重复同步幂等:无新增时不产生写入', async () => {
    const data = apiData(['2025-05-01 10:00:00', '2025-05-02 11:30:00'])
    const api = fakeApi([data, data])
    const storage = fakeStorage()

    await syncPool(LINK, deps({ api: api.api, storage: storage.storage }))
    const second = await syncPool(LINK, deps({ api: api.api, storage: storage.storage }))

    expect(second.added).toBe(0)
    expect(storage.insertedBatches).toHaveLength(1)
  })

  it('code != 0 判定链接失效,不重试、不写库,文案引导重开唤取记录页', async () => {
    const { api, requests } = fakeApi([JSON.stringify({ code: -1, message: 'expired' })])
    const storage = fakeStorage()

    const error = await syncPool(
      LINK,
      deps({ api, storage: storage.storage }),
    ).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(LinkInvalidError)
    expect((error as LinkInvalidError).message).toContain('重新打开')
    expect((error as LinkInvalidError).message).toContain('唤取记录')
    expect(requests).toHaveLength(1)
    expect(storage.insertedBatches).toHaveLength(0)
  })

  it('网络类失败重试:间隔由时钟注入,恢复后成功', async () => {
    const { api, requests, failNextWith } = fakeApi([apiData(['2025-05-01 10:00:00'])])
    failNextWith(new NetworkError('超时'), new NetworkError('超时'))
    const { clock, sleeps } = fakeClock()

    const result = await syncPool(LINK, deps({ api, clock }))

    expect(requests).toHaveLength(SYNC_RETRY_LIMIT - 1 + 1)
    expect(sleeps).toEqual([RETRY_INTERVAL_MS, RETRY_INTERVAL_MS])
    expect(result.added).toBe(1)
  })

  it(`重试 ${SYNC_RETRY_LIMIT} 次仍失败则抛网络错误`, async () => {
    const { api, requests, failNextWith } = fakeApi([])
    failNextWith(
      new NetworkError('超时'),
      new NetworkError('超时'),
      new NetworkError('超时'),
      new NetworkError('超时'),
    )
    const { clock, sleeps } = fakeClock()

    const error = await syncPool(LINK, deps({ api, clock })).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(NetworkError)
    expect(requests).toHaveLength(1 + SYNC_RETRY_LIMIT)
    expect(sleeps).toHaveLength(SYNC_RETRY_LIMIT)
  })

  it('返回体异常与请求失败同受重试保护:非 JSON 返回体后重试成功', async () => {
    const { api, requests } = fakeApi([
      '<html>Bad Gateway</html>',
      apiData(['2025-05-01 10:00:00']),
    ])
    const { clock, sleeps } = fakeClock()

    const result = await syncPool(LINK, deps({ api, clock }))

    expect(requests).toHaveLength(2)
    expect(sleeps).toEqual([RETRY_INTERVAL_MS])
    expect(result.added).toBe(1)
  })

  it('返回体异常按网络类失败重试,限次耗尽后报网络/协议错误', async () => {
    const { api, requests } = fakeApi(['<html>Bad Gateway</html>'])
    const { clock, sleeps } = fakeClock()

    const error = await syncPool(LINK, deps({ api, clock })).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NetworkError)
    expect(requests).toHaveLength(1 + SYNC_RETRY_LIMIT)
    expect(sleeps).toHaveLength(SYNC_RETRY_LIMIT)
  })

  it('确定性错误(非网络类)重试前被分类,立即抛出不重试', async () => {
    const { api, requests, failNextWith } = fakeApi([apiData(['2025-05-01 10:00:00'])])
    failNextWith(new DomainError('未知的服区标识:jp'))
    const { clock, sleeps } = fakeClock()

    const error = await syncPool(LINK, deps({ api, clock })).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DomainError)
    expect(error).not.toBeInstanceOf(NetworkError)
    expect((error as DomainError).message).toBe('未知的服区标识:jp')
    expect(requests).toHaveLength(1)
    expect(sleeps).toHaveLength(0)
  })
})
