import { describe, expect, it } from 'vitest'
import type { GachaRecord } from './records'
import { pityLines } from './pityLines'

let seq = 0

/** 单调递增时间戳(跨天/时/分进位),保证整档测试里时间字符串始终正序 */
function stamp(n: number): string {
  const day = Math.floor(n / 86400)
  const rest = n % 86400
  const hh = String(Math.floor(rest / 3600)).padStart(2, '0')
  const mm = String(Math.floor((rest % 3600) / 60)).padStart(2, '0')
  const ss = String(rest % 60).padStart(2, '0')
  return `2025-05-${String(1 + day).padStart(2, '0')} ${hh}:${mm}:${ss}`
}

function record(overrides: Partial<GachaRecord> = {}): GachaRecord {
  seq += 1
  return {
    cardPoolType: 1,
    cardPoolId: 100074,
    time: stamp(seq),
    name: '远行者佩枪·瞭望',
    qualityLevel: 3,
    resourceId: '21050001',
    resourceType: '武器',
    ...overrides,
  }
}

/** 造 n 条三星垫抽(时间依次递增,秒级自增保证正序) */
function fillers(n: number, poolCode = 1): GachaRecord[] {
  return Array.from({ length: n }, () => record({ cardPoolType: poolCode }))
}

/** 池内出一个个五星后继续垫抽:维里奈在常驻名单(歪),忌炎为 UP */
function fiveThenFillers(name: string, fillersAfter: number, poolCode = 1): GachaRecord[] {
  return [
    ...fillers(3, poolCode),
    record({ cardPoolType: poolCode, name, qualityLevel: 5, resourceType: '角色' }),
    ...fillers(fillersAfter, poolCode),
  ]
}

describe('保底引线:固定三池与已垫/还差', () => {
  it('固定输出角色精准 1 / 武器精准 2 / 角色常驻 3,垫抽数取对应池 pity', () => {
    const records = [...fillers(17, 1), ...fillers(5, 2), ...fillers(24, 3)]
    const lines = pityLines([...records].reverse())

    expect(lines.map((line) => line.poolCode)).toEqual([1, 2, 3])
    expect(lines.map((line) => line.label)).toEqual([
      '角色精准调谐',
      '武器精准调谐',
      '角色常驻调谐',
    ])
    expect(lines[0]).toMatchObject({ current: 17, hard: 80, remain: 63 })
    expect(lines[1]).toMatchObject({ current: 5, hard: 80, remain: 75 })
    expect(lines[2]).toMatchObject({ current: 24, hard: 80, remain: 56 })
  })

  it('某池无任何记录时该引线不出现(空态)', () => {
    const lines = pityLines([...fillers(3, 1)].reverse())
    expect(lines.map((line) => line.poolCode)).toEqual([1])
  })

  it('空档案输出空数组', () => {
    expect(pityLines([])).toEqual([])
  })
})

describe('保底引线:大小保底标注与说明', () => {
  it('上个角色系限定池五星歪了 → 角色精准引线标「大保底」,说明下个必 UP', () => {
    const lines = pityLines([...fiveThenFillers('维里奈', 17)].reverse())
    expect(lines).toHaveLength(1)
    expect(lines[0]!.badge).toBe('大保底')
    expect(lines[0]!.note).toBe('上一个五星歪了，下一个必为当期 UP')
  })

  it('上个五星当期 UP → 标「小保底」', () => {
    const lines = pityLines([...fiveThenFillers('忌炎', 9)].reverse())
    expect(lines[0]!.badge).toBe('小保底')
    expect(lines[0]!.note).toBe('下一个五星 50% 为当期 UP')
  })

  it('大小保底标注只出现在角色精准引线,武器/常驻引线不标', () => {
    const records = [
      ...fiveThenFillers('维里奈', 5),
      ...fillers(2, 2),
      ...fillers(4, 3),
    ]
    const lines = pityLines([...records].reverse())
    expect(lines.map((line) => line.badge)).toEqual(['大保底', null, null])
  })

  it('武器系与常驻引线说明按定稿原型文案', () => {
    const lines = pityLines([...fillers(1, 2), ...fillers(1, 3)].reverse())
    expect(lines.map((line) => line.note)).toEqual(['没有 50/50，出货即 UP', '常驻池无 UP 概念'])
  })
})

describe('保底引线:边界', () => {
  it('垫抽达到硬保底时距必得剩余钳为 0', () => {
    const lines = pityLines([...fillers(80, 1)].reverse())
    expect(lines[0]).toMatchObject({ current: 80, remain: 0 })
  })
})
