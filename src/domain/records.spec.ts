import { describe, expect, it } from 'vitest'
import { mergeRecords, recordKey, toDomainRecords, type GachaRecord } from './records'

function record(overrides: Partial<GachaRecord>): GachaRecord {
  return {
    cardPoolType: 1,
    cardPoolId: 100074,
    time: '2025-05-01 10:00:00',
    name: '长离',
    qualityLevel: 5,
    resourceId: '21010043',
    resourceType: '角色',
    ...overrides,
  }
}

const API_ITEM = {
  cardPoolType: '角色精准调谐',
  resourceId: 21010043,
  qualityLevel: 5,
  resourceType: '角色',
  name: '长离',
  count: 1,
  time: '2025-05-01 10:00:00',
}

describe('合并去重', () => {
  it('只追加本地不存在的新记录,返回新增集', () => {
    const existing = [record({})]
    const incoming = [
      record({}),
      record({ time: '2025-05-02 11:30:00', name: '折枝' }),
    ]

    const { records, added } = mergeRecords(existing, incoming)

    expect(records).toHaveLength(2)
    expect(added).toEqual([record({ time: '2025-05-02 11:30:00', name: '折枝' })])
  })

  it('重复导入幂等:同一批记录再合并不产生新增', () => {
    const existing = [
      record({}),
      record({ time: '2025-05-02 11:30:00', name: '折枝' }),
    ]
    const sameAgain = [
      record({ time: '2025-05-02 11:30:00', name: '折枝' }),
      record({}),
    ]

    const { records, added } = mergeRecords(existing, sameAgain)

    expect(added).toHaveLength(0)
    expect(records).toEqual(existing)
  })

  it('去重键为 time+name+qualityLevel+cardPoolType:同刻同名同稀有度但不同池不算重复', () => {
    const existing = [record({ cardPoolType: 1 })]
    const incoming = [record({ cardPoolType: 8 })]

    const { records, added } = mergeRecords(existing, incoming)

    expect(added).toHaveLength(1)
    expect(records).toHaveLength(2)
    expect(recordKey(records[0]!)).not.toBe(recordKey(records[1]!))
  })

  it('只增不减:已存在记录原样保留,不因新记录缺失而丢失', () => {
    const existing = [
      record({ time: '2024-12-01 08:00:00', name: '早期记录' }),
      record({ time: '2025-05-02 11:30:00', name: '折枝' }),
    ]
    const incoming = [record({ time: '2025-05-02 11:30:00', name: '折枝' })]

    const { records } = mergeRecords(existing, incoming)

    expect(records).toHaveLength(2)
    expect(records).toContainEqual(existing[0]!)
  })
})

describe('官方返回映射为领域记录', () => {
  it('忽略返回中的中文池名字符串,池 code 取本池请求的数字 code;resourceId 转字符串', () => {
    const records = toDomainRecords([API_ITEM], 1, 100074)

    expect(records[0]).toEqual({
      cardPoolType: 1,
      cardPoolId: 100074,
      time: '2025-05-01 10:00:00',
      name: '长离',
      qualityLevel: 5,
      resourceId: '21010043',
      resourceType: '角色',
    })
  })

  it('cardPoolId 无法从链接 gacha_id 解析时为 null;缺失的扩展字段容错', () => {
    const records = toDomainRecords(
      [{ ...API_ITEM, resourceId: undefined, resourceType: undefined }],
      3,
      null,
    )

    expect(records[0]!.cardPoolId).toBeNull()
    expect(records[0]!.resourceId).toBe('')
    expect(records[0]!.resourceType).toBe('')
  })
})
