import { describe, expect, it } from 'vitest'
import { mergeRecords, recordKey, toDomainRecords, type GachaRecord, type RawApiItem } from './records'

function record(overrides: Partial<GachaRecord>): GachaRecord {
  return {
    cardPoolType: 1,
    cardPoolId: 100074,
    time: '2025-05-01 10:00:00',
    name: '长离',
    qualityLevel: 5,
    resourceId: '21010043',
    resourceType: '角色',
    count: 1,
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

  it('同键 count 升级(#15):新到抽数更多时取 max,归入 updated 而非 added', () => {
    const existing = [record({})]
    const incoming = [record({ count: 3 })]

    const { records, added, updated } = mergeRecords(existing, incoming)

    expect(added).toHaveLength(0)
    expect(updated).toEqual([record({ count: 3 })])
    expect(records).toEqual([record({ count: 3 })])
  })

  it('同键多行按 Σcount 聚合(#15 真实机制):十连里同名同星的多件不丢抽数', () => {
    // 官方逐抽返回:同一秒抽到 2 件同名三星 = 同键 2 行(count 恒 1)
    const existing = [record({ name: '暗夜臂铠·夜芒', qualityLevel: 3, count: 1 })]
    const incoming = [
      record({ name: '暗夜臂铠·夜芒', qualityLevel: 3, count: 1 }),
      record({ name: '暗夜臂铠·夜芒', qualityLevel: 3, count: 1 }),
    ]

    const { records, added, updated } = mergeRecords(existing, incoming)

    expect(added).toHaveLength(0) // 无新行,只升级抽数
    expect(updated).toEqual([record({ name: '暗夜臂铠·夜芒', qualityLevel: 3, count: 2 })])
    expect(records).toHaveLength(1)
    expect(records[0]!.count).toBe(2)
  })

  it('新键的同键多行聚合为一条 count=Σ 的记录入库', () => {
    const incoming = [
      record({ time: '2025-05-02 11:30:00', name: '远行者佩枪·洞察', qualityLevel: 3, count: 1 }),
      record({ time: '2025-05-02 11:30:00', name: '远行者佩枪·洞察', qualityLevel: 3, count: 1 }),
      record({ time: '2025-05-02 11:30:00', name: '远行者佩枪·洞察', qualityLevel: 3, count: 1 }),
    ]

    const { records, added, updated } = mergeRecords([], incoming)

    expect(updated).toHaveLength(0)
    expect(added).toHaveLength(1)
    expect(added[0]!.count).toBe(3)
    expect(records).toHaveLength(1)
  })

  it('同键只增不减:既有抽数更多时保持既有值(重放/窗口缩水不回退)', () => {
    const existing = [record({ count: 3 })]
    const incoming = [record({ count: 2 }), record({ count: 1 })]

    const { records, added, updated } = mergeRecords(existing, incoming)

    expect(added).toHaveLength(0)
    expect(updated).toHaveLength(0)
    expect(records).toEqual([record({ count: 3 })])
  })

  it('不同键的新记录照常追加,count 随记录本身保留', () => {
    const existing = [record({ count: 3 })]
    const incoming = [record({ time: '2025-05-02 11:30:00', name: '折枝', count: 5 })]

    const { records, added, updated } = mergeRecords(existing, incoming)

    expect(updated).toHaveLength(0)
    expect(added).toEqual([record({ time: '2025-05-02 11:30:00', name: '折枝', count: 5 })])
    expect(records).toEqual([...existing, added[0]!])
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
      count: 1,
    })
  })

  it('count>1 保留官方值:同秒多抽合一条,禁止展开成多行(#15)', () => {
    const records = toDomainRecords([{ ...API_ITEM, count: 7 }], 1, 100074)

    expect(records).toHaveLength(1)
    expect(records[0]!.count).toBe(7)
  })

  it('count 缺失或非法(0/负数/小数/非数字)按 1 兜底(#15)', () => {
    // 官方返回体未经我方校验,count 可能是任意形状:以 RawApiItem 之外的运行时数据容错
    const items: unknown[] = [
      { ...API_ITEM, count: undefined },
      { ...API_ITEM, count: 0 },
      { ...API_ITEM, count: -3 },
      { ...API_ITEM, count: 2.5 },
      { ...API_ITEM, count: '3' },
    ]

    const records = toDomainRecords(items as readonly RawApiItem[], 1, 100074)
    expect(records.map((r) => r.count)).toEqual([1, 1, 1, 1, 1])
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
