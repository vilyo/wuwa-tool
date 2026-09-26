import { defineStore } from 'pinia'
import { ref } from 'vue'
import { loadTheme, saveTheme, type ThemeName } from '@/stores/preferences'

export type { ThemeName }

/**
 * 主题状态(明色为默认,设计系统 v11:强调色随主题——明 = 共鸣青,暗 = 低饱和金)。
 * 初始值从偏好存储恢复(#13 持久化,重启后保持);index.html 的 data-theme="light"
 * 只承担首帧防闪烁,偏好为暗色时接受启动后的一次切换。
 */
export const useThemeStore = defineStore('theme', () => {
  const theme = ref<ThemeName>(loadTheme())

  function apply() {
    document.documentElement.dataset.theme = theme.value
  }

  function set(next: ThemeName) {
    theme.value = next
    saveTheme(next)
    apply()
  }

  function toggle() {
    set(theme.value === 'light' ? 'dark' : 'light')
  }

  // 让 DOM 属性以 store 为准(恢复暗色时覆盖 index.html 的明色兜底)
  apply()

  return { theme, set, toggle }
})
