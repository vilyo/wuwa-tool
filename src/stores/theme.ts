import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeName = 'light' | 'dark'

/**
 * 主题状态(明色为默认,设计系统 v11:强调色随主题——明 = 共鸣青,暗 = 低饱和金)。
 * 初始主题由 index.html 的 data-theme="light" 承担;此处的临时开关仅保存在内存中,
 * #13 将把主题并入设置弹窗并做持久化。
 */
export const useThemeStore = defineStore('theme', () => {
  const theme = ref<ThemeName>('light')

  function apply() {
    document.documentElement.dataset.theme = theme.value
  }

  function toggle() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    apply()
  }

  // 让 DOM 属性以 store 为准(index.html 的 data-theme 仅作首帧防闪烁兜底);
  // #13 接入持久化后,初始化值改为读取设置
  apply()

  return { theme, toggle }
})
