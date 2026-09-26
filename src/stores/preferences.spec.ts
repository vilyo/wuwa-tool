import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  STORAGE_KEYS,
  loadAutoSync,
  loadGameDir,
  loadLastSyncUrl,
  loadTheme,
  saveAutoSync,
  saveGameDir,
  saveLastSyncUrl,
  saveTheme,
  usePreferencesStore,
} from './preferences'

describe('preferences 偏好存储(#13:key 集中、读写容错)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('key 常量集中管理,与既有 #04 手动目录 key 兼容', () => {
    expect(STORAGE_KEYS.theme).toBe('wuwatool.theme')
    expect(STORAGE_KEYS.autoSync).toBe('wuwatool.autoSync')
    expect(STORAGE_KEYS.lastSyncUrl).toBe('wuwatool.lastSyncUrl')
    expect(STORAGE_KEYS.gameDir).toBe('wuwatool.gameDir')
  })

  it('主题:明色为默认;存过暗色则恢复暗色', () => {
    expect(loadTheme()).toBe('light')

    saveTheme('dark')
    expect(loadTheme()).toBe('dark')
    expect(localStorage.getItem('wuwatool.theme')).toBe('dark')

    saveTheme('light')
    expect(loadTheme()).toBe('light')
  })

  it('主题:存储值非法时回落明色', () => {
    localStorage.setItem('wuwatool.theme', 'sepia')
    expect(loadTheme()).toBe('light')
  })

  it('启动自动同步开关:默认开;显式关闭后保持关', () => {
    expect(loadAutoSync()).toBe(true)

    saveAutoSync(false)
    expect(loadAutoSync()).toBe(false)
    expect(localStorage.getItem('wuwatool.autoSync')).toBe('false')

    saveAutoSync(true)
    expect(loadAutoSync()).toBe(true)
  })

  it('缓存链接与游戏目录:读写往返', () => {
    expect(loadLastSyncUrl()).toBeNull()
    expect(loadGameDir()).toBeNull()

    saveLastSyncUrl('https://example.invalid/gacha?player_id=1')
    saveGameDir('D:\\Wuthering Waves Game')
    expect(loadLastSyncUrl()).toBe('https://example.invalid/gacha?player_id=1')
    expect(loadGameDir()).toBe('D:\\Wuthering Waves Game')
  })

  it('autoSync 响应式状态:切换立即生效并立即持久化', () => {
    const preferences = usePreferencesStore()
    expect(preferences.autoSync).toBe(true)

    preferences.setAutoSync(false)
    expect(preferences.autoSync).toBe(false)
    expect(localStorage.getItem('wuwatool.autoSync')).toBe('false')
  })
})
