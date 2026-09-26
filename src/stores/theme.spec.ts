import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore } from './theme'

describe('theme store(#13 持久化:明色默认、重启保持)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    document.documentElement.dataset.theme = 'light'
  })

  it('无存储时默认明色并应用到 DOM', () => {
    const theme = useThemeStore()

    expect(theme.theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('存储为暗色时初始化即恢复暗色(覆盖 index.html 的明色兜底)', () => {
    localStorage.setItem('wuwatool.theme', 'dark')

    const theme = useThemeStore()

    expect(theme.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('toggle 切换并持久化,重启(重建 store)后保持', () => {
    const theme = useThemeStore()
    theme.toggle()

    expect(theme.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('wuwatool.theme')).toBe('dark')

    const restored = useThemeStore()
    expect(restored.theme).toBe('dark')
  })

  it('set 明确指定主题并持久化', () => {
    const theme = useThemeStore()
    theme.set('dark')
    expect(theme.theme).toBe('dark')
    expect(localStorage.getItem('wuwatool.theme')).toBe('dark')

    theme.set('light')
    expect(theme.theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('wuwatool.theme')).toBe('light')
  })
})
