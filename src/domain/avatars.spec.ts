import { describe, expect, it } from 'vitest'
import {
  AVATAR_ASSET_ENTRIES,
  ROSTER_FILES,
  avatarIndex,
  elementColor,
  normNameKey,
  resolveAvatarFile,
  resolveAvatarUrl,
  type AvatarAssetEntry,
} from './avatars'

describe('头像资产映射(resourceId → 文件名,ADR-0005)', () => {
  it('按 resourceId 命中(语言无关首选键)', () => {
    const entries: AvatarAssetEntry[] = [
      { resourceId: '21020017', en: 'Calcharo', zh: '卡卡罗', file: 'Calcharo.png' },
    ]
    const index = avatarIndex(entries)
    expect(resolveAvatarFile(index, { resourceId: '21020017', name: '' })).toBe('Calcharo.png')
  })

  it('resourceId 查不到时按名称兜底(en/zh 双路)', () => {
    const index = avatarIndex([
      { resourceId: '21020017', en: 'Calcharo', zh: '卡卡罗', file: 'Calcharo.png' },
    ])
    expect(resolveAvatarFile(index, { resourceId: '999', name: 'Calcharo' })).toBe('Calcharo.png')
    expect(resolveAvatarFile(index, { resourceId: '999', name: '卡卡罗' })).toBe('Calcharo.png')
  })

  it('名称匹配忽略大小写、空格与分隔符(API 名随 lang 变化)', () => {
    expect(resolveAvatarUrl({ resourceId: '', name: 'xiangli yao' })).toMatch(
      /XiangliYao\.png$/,
    )
    expect(resolveAvatarUrl({ resourceId: '', name: '  EMERALD OF GENESIS ' })).toMatch(
      /EmeraldOfGenesis\.png$/,
    )
    expect(resolveAvatarUrl({ resourceId: '', name: '千古洑流' })).toMatch(
      /EmeraldOfGenesis\.png$/,
    )
  })

  it('查不到返回 null(缺图走回退字牌,不报错)', () => {
    expect(resolveAvatarUrl({ resourceId: '424242', name: '无名之辈' })).toBeNull()
    expect(resolveAvatarUrl({ resourceId: '', name: '' })).toBeNull()
  })

  it('随包资产文件全部被映射覆盖,映射文件全部真实存在(防孤儿/防笔误)', () => {
    const mapped = new Set(AVATAR_ASSET_ENTRIES.map((e) => e.file))
    for (const entry of AVATAR_ASSET_ENTRIES) {
      expect(ROSTER_FILES[entry.file], `资产缺失: ${entry.file}`).toBeTruthy()
    }
    for (const file of Object.keys(ROSTER_FILES)) {
      expect(mapped.has(file), `未映射的打包资产: ${file}`).toBe(true)
    }
    expect(mapped.size).toBe(Object.keys(ROSTER_FILES).length)
  })
})

describe('属性色(定稿原型 EL 色标,未知回退组件默认)', () => {
  it('已知属性/武器类型返回色值', () => {
    expect(elementColor('衍射')).toBe('#C29A3A')
    expect(elementColor('导电')).toBe('#9273D6')
    expect(elementColor('佩枪')).toBe('#7E8B99')
  })

  it('未知属性返回 undefined', () => {
    expect(elementColor('未知属性')).toBeUndefined()
    expect(elementColor(undefined)).toBeUndefined()
  })
})

describe('normNameKey(名称归一化键)', () => {
  it('小写化并去除非字母数字汉字字符', () => {
    expect(normNameKey('  Xiangli Yao ')).toBe('xiangliyao')
    expect(normNameKey("Firstlight's Herald")).toBe('firstlightsherald')
    expect(normNameKey('远行者长刃·辟路')).toBe('远行者长刃辟路')
  })
})
