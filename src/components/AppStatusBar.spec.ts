import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import type { SyncAllProgress } from '@/domain/syncAll'
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

  it('同步中:状态栏承接「正在获取 卡池 x/13」进度(弹窗关闭后仍有出口)', async () => {
    const { wrapper, store } = mountBar()
    store.syncing = true
    store.syncProgress = { index: 8, total: 13 } as SyncAllProgress
    await wrapper.vm.$nextTick()

    const note = wrapper.find('[role="status"]')
    expect(note.text()).toBe('正在获取 卡池 8/13')
    expect(wrapper.text()).not.toContain('30 分钟后可同步')
  })

  it('结果消息优先于进度与自动同步提示,失败着色;手动导入弹窗关闭后结果仍有出口', async () => {
    const { wrapper, store } = mountBar()
    store.syncing = true
    store.syncProgress = { index: 1, total: 13 } as SyncAllProgress
    store.autoSyncNote = '启动自动同步失败:链接可能已失效或网络不可用,可重新获取链接后重试。'
    store.message = { kind: 'error', text: '链接已失效,请重新打开游戏内唤取记录页后复制。' }
    await wrapper.vm.$nextTick()

    const msg = wrapper.find('.msg')
    expect(msg.text()).toContain('链接已失效')
    expect(msg.classes()).toContain('is-error')
    expect(wrapper.text()).not.toContain('正在获取 卡池')
    expect(wrapper.text()).not.toContain('自动同步失败')
  })

  it('成功消息着绿色', async () => {
    const { wrapper, store } = mountBar()
    store.message = { kind: 'success', text: '同步完成:13 个卡池拉取 13 条,新增 13 条。' }
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.msg').classes()).toContain('is-success')
  })
})
