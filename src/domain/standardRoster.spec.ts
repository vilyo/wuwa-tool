import { describe, expect, it } from 'vitest'
import type { GachaRecord } from './records'
import { isStandardRosterItem, STANDARD_ROSTER } from './standardRoster'
import { resolveAvatarUrl } from './avatars'

function record(overrides: Partial<GachaRecord>): GachaRecord {
  return {
    cardPoolType: 1,
    cardPoolId: 100074,
    time: '2025-05-01 10:00:00',
    name: '维里奈',
    qualityLevel: 5,
    resourceId: '21020041',
    resourceType: '角色',
    ...overrides,
  }
}

describe('常驻名单反向判定(ADR-0002):名单内 = 歪', () => {
  it('角色按中文名命中(链接 lang 为中文)', () => {
    for (const zh of ['维里奈', '卡卡罗', '安可', '凌阳', '鉴心', '相里要']) {
      expect(isStandardRosterItem(record({ name: zh })), zh).toBe(true)
    }
  })

  it('角色按英文名命中(链接 lang 为英文;忽略大小写与空格)', () => {
    for (const en of ['Verina', 'Calcharo', 'Encore', 'Lingyang', 'Jianxin', 'Xiangli Yao']) {
      expect(isStandardRosterItem(record({ name: en })), en).toBe(true)
    }
    expect(isStandardRosterItem(record({ name: '  xiangli yao ' }))).toBe(true)
  })

  it('武器常驻五星按中英文名命中', () => {
    expect(isStandardRosterItem(record({ name: '千古洑流', resourceType: '武器' }))).toBe(true)
    expect(isStandardRosterItem(record({ name: '浩境粼光', resourceType: '武器' }))).toBe(true)
    expect(isStandardRosterItem(record({ name: '停驻之烟', resourceType: '武器' }))).toBe(true)
    expect(isStandardRosterItem(record({ name: '擎渊怒涛', resourceType: '武器' }))).toBe(true)
    expect(isStandardRosterItem(record({ name: '漪澜浮录', resourceType: '武器' }))).toBe(true)
    expect(isStandardRosterItem(record({ name: 'Static Mist', resourceType: '武器' }))).toBe(true)
    expect(
      isStandardRosterItem(record({ name: 'Emerald of Genesis', resourceType: '武器' })),
    ).toBe(true)
  })

  it('条目带 resourceId 时按 resourceId 精确命中(语言无关)', () => {
    const entry = STANDARD_ROSTER.find((e) => e.resourceId)
    if (!entry?.resourceId) return // 当前名单未收录可靠 resourceId 时跳过(见数据文件注释)
    expect(
      isStandardRosterItem(record({ resourceId: entry.resourceId, name: '不相关名' })),
    ).toBe(true)
  })
})

describe('名单外 = 当期 UP(false)', () => {
  it('非名单角色/武器判 false', () => {
    expect(isStandardRosterItem(record({ name: '忌炎' }))).toBe(false)
    expect(isStandardRosterItem(record({ name: 'Chisa', resourceId: '21020099' }))).toBe(false)
    expect(isStandardRosterItem(record({ name: '千般渡', resourceType: '武器' }))).toBe(false)
  })

  it('resourceType 与条目类别不符时不命中', () => {
    expect(isStandardRosterItem(record({ name: '卡卡罗', resourceType: '武器' }))).toBe(false)
  })
})

describe('无法识别 = unknown(标「未知」不计入歪率)', () => {
  it('name 与 resourceId 双缺失', () => {
    expect(isStandardRosterItem(record({ name: '', resourceId: '' }))).toBe('unknown')
    expect(isStandardRosterItem(record({ name: '   ', resourceId: '' }))).toBe('unknown')
  })

  it('name 为空、resourceId 无法对应名单时也不武断判 UP', () => {
    expect(isStandardRosterItem(record({ name: '', resourceId: '21029999' }))).toBe('unknown')
  })
})

describe('名单数据自检', () => {
  it('每条含中英文名与类别;当前常驻池六角色 + 五武器', () => {
    expect(STANDARD_ROSTER.filter((e) => e.kind === 'resonator')).toHaveLength(6)
    expect(STANDARD_ROSTER.filter((e) => e.kind === 'weapon')).toHaveLength(5)
    for (const entry of STANDARD_ROSTER) {
      expect(entry.zh.trim()).not.toBe('')
      expect(entry.en.trim()).not.toBe('')
    }
  })

  it('名单内物品均有对应图标(映射覆盖测试)', () => {
    for (const entry of STANDARD_ROSTER) {
      expect(resolveAvatarUrl({ resourceId: '', name: entry.en }), `${entry.en} 缺图标`).not.toBeNull()
      expect(resolveAvatarUrl({ resourceId: '', name: entry.zh }), `${entry.zh} 缺图标`).not.toBeNull()
    }
  })
})
