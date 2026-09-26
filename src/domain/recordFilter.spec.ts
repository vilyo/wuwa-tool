import { describe, expect, it } from 'vitest'
import type { GachaRecord } from '@/domain/records'
import { filterRecords, poolCodesIn } from './recordFilter'

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

describe('poolCodesIn(抽屉卡池下拉全集)', () => {
  it('取档案中出现的池 code,升序去重', () => {
    const codes = poolCodesIn([
      record({ cardPoolType: 2 }),
      record({ cardPoolType: 1 }),
      record({ cardPoolType: 2 }),
      record({ cardPoolType: 5 }),
    ])

    expect(codes).toEqual([1, 2, 5])
  })

  it('空档案返回空集', () => {
    expect(poolCodesIn([])).toEqual([])
  })
})

describe('filterRecords(抽屉筛选)', () => {
  const records = [
    record({ time: '2025-05-01 10:00:00', name: '较早五星', cardPoolType: 1, qualityLevel: 5 }),
    record({ time: '2025-05-03 09:00:00', name: '最新三星', cardPoolType: 2, qualityLevel: 3 }),
    record({ time: '2025-05-02 08:00:00', name: '居中四星', cardPoolType: 5, qualityLevel: 4 }),
  ]

  it('无条件筛选 = 全量按时间倒序(防御性重排,不依赖入参顺序)', () => {
    const rows = filterRecords(records, { qualityLevel: null, poolCode: null })

    expect(rows.map((row) => row.name)).toEqual(['最新三星', '居中四星', '较早五星'])
  })

  it('按稀有度筛选', () => {
    const rows = filterRecords(records, { qualityLevel: 4, poolCode: null })

    expect(rows.map((row) => row.name)).toEqual(['居中四星'])
  })

  it('按卡池筛选;未知池 code 一视同仁', () => {
    const rows = filterRecords(records, { qualityLevel: null, poolCode: 2 })

    expect(rows.map((row) => row.name)).toEqual(['最新三星'])
  })

  it('稀有度与卡池组合筛选', () => {
    const rows = filterRecords(records, { qualityLevel: 3, poolCode: 2 })

    expect(rows.map((row) => row.name)).toEqual(['最新三星'])
    expect(filterRecords(records, { qualityLevel: 5, poolCode: 2 })).toEqual([])
  })

  it('不改写入参', () => {
    filterRecords(records, { qualityLevel: 3, poolCode: null })

    expect(records.map((row) => row.name)).toEqual(['较早五星', '最新三星', '居中四星'])
  })
})
