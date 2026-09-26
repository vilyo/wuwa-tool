import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeName = 'light' | 'dark'

/**
 * 偏好存储(#13):全部偏好相关的 localStorage key 与读写集中在此,key 常量集中管理。
 * 读写一律容错(存储不可用时跳过,不影响主流程),与 #04 的 gameDir 先例一致。
 */
export const STORAGE_KEYS = {
  theme: 'wuwatool.theme',
  autoSync: 'wuwatool.autoSync',
  lastSyncUrl: 'wuwatool.lastSyncUrl',
  gameDir: 'wuwatool.gameDir',
} as const

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 存储不可用时跳过记忆,不影响本次操作
  }
}

/** 主题:明色为默认(ADR-0006);非法值按默认明色处理 */
export function loadTheme(): ThemeName {
  return read(STORAGE_KEYS.theme) === 'dark' ? 'dark' : 'light'
}

export function saveTheme(theme: ThemeName): void {
  write(STORAGE_KEYS.theme, theme)
}

/** 启动自动同步开关:默认开;仅显式存过 'false' 才视为关 */
export function loadAutoSync(): boolean {
  return read(STORAGE_KEYS.autoSync) !== 'false'
}

export function saveAutoSync(enabled: boolean): void {
  write(STORAGE_KEYS.autoSync, enabled ? 'true' : 'false')
}

/** 最近一次成功同步的唤取链接(启动自动同步的缓存,每次成功同步后刷新) */
export function loadLastSyncUrl(): string | null {
  return read(STORAGE_KEYS.lastSyncUrl)
}

export function saveLastSyncUrl(url: string): void {
  write(STORAGE_KEYS.lastSyncUrl, url)
}

/** 手动指定的游戏目录(#04 记住的选择;#13 起读写收编到本模块) */
export function loadGameDir(): string | null {
  return read(STORAGE_KEYS.gameDir)
}

export function saveGameDir(dir: string): void {
  write(STORAGE_KEYS.gameDir, dir)
}

/** 自动同步开关的响应式状态(设置弹窗即时可见、切换立即持久化) */
export const usePreferencesStore = defineStore('preferences', () => {
  const autoSync = ref(loadAutoSync())

  function setAutoSync(enabled: boolean): void {
    autoSync.value = enabled
    saveAutoSync(enabled)
  }

  return { autoSync, setAutoSync }
})
