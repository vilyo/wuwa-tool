import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useRecordsStore } from '@/stores/records'
import AppStatusBar from './AppStatusBar.vue'

function mountBar() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(AppStatusBar, { global: { plugins: [pinia] } })
  return { wrapper, store: useRecordsStore() }
}

describe('状态栏(#13):自动同步静默失败的温和提示', () => {
  it('常态:常驻延迟/留存提示与版本号,无自动同步提示', () => {
    const { wrapper } = mountBar()

    expect(wrapper.text()).toContain('30 分钟后可同步')
    expect(wrapper.text()).toContain('近 6 个月记录')
    expect(wrapper.text()).not.toContain('自动同步失败')
  })

  it('自动同步静默失败:温和提示以 role=status 上屏,替代常驻提示位,不打扰', async () => {
    const { wrapper, store } = mountBar()
    store.autoSyncNote = '启动自动同步失败:链接可能已失效或网络不可用,可重新获取链接后重试。'
    await wrapper.vm.$nextTick()

    const note = wrapper.find('[role="status"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('自动同步失败')
    expect(wrapper.text()).not.toContain('30 分钟后可同步')
    // 右侧隐私与版本声明保持
    expect(wrapper.text()).toContain('所有数据仅保存在本机')
  })
})
