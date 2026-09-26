import { describe, expect, it } from 'vitest'
import {
  FOUR_STAR_HARD_PITY,
  hardPity,
  NOVICE_HARD_PITY,
  poolCategory,
  poolLabel,
} from './pools'

describe('池类别划分(#07 统计口径 / #09 页签共用)', () => {
  it('角色系限定池 = 1/8/10/12', () => {
    for (const code of [1, 8, 10, 12]) {
      expect(poolCategory(code), `code ${code}`).toBe('limitedChar')
    }
  })

  it('武器系限定池 = 2/9/11/13', () => {
    for (const code of [2, 9, 11, 13]) {
      expect(poolCategory(code), `code ${code}`).toBe('limitedWeapon')
    }
  })

  it('常驻池 = 3/4', () => {
    for (const code of [3, 4]) {
      expect(poolCategory(code), `code ${code}`).toBe('standard')
    }
  })

  it('新手·感恩池 = 5/6/7', () => {
    for (const code of [5, 6, 7]) {
      expect(poolCategory(code), `code ${code}`).toBe('noviceGratitude')
    }
  })

  it('未知 code 容错兜底(开放式枚举)', () => {
    for (const code of [0, 14, 99, -1]) {
      expect(poolCategory(code), `code ${code}`).toBe('unknown')
    }
  })
})

describe('保底规则(池属性)', () => {
  it('新手调谐池(5)五星硬保底 50,其余池按 80', () => {
    expect(hardPity(5)).toBe(NOVICE_HARD_PITY)
    expect(NOVICE_HARD_PITY).toBe(50)
    for (const code of [1, 2, 3, 4, 6, 7, 8, 13]) {
      expect(hardPity(code), `code ${code}`).toBe(80)
    }
  })

  it('四星保底 10 抽;未知 code 按 80 兜底', () => {
    expect(FOUR_STAR_HARD_PITY).toBe(10)
    expect(hardPity(99)).toBe(80)
  })

  it('官方池名不受类别扩展影响(回归)', () => {
    expect(poolLabel(1)).toBe('角色精准调谐')
    expect(poolLabel(5)).toBe('新手调谐')
  })
})
