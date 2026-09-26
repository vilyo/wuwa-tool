import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryPool: vi.fn(),
  loadRecords: vi.fn(),
  insertRecords: vi.fn(),
  listArchives: vi.fn(),
  probeGameDir: vi.fn(),
  extractLinks: vi.fn(),
  pickGameDirectory: vi.fn(),
}))

vi.mock('@/services/tauriPorts', () => ({
  tauriGachaApi: { queryPool: mocks.queryPool },
  tauriStorage: { loadRecords: mocks.loadRecords, insertRecords: mocks.insertRecords },
  realClock: { now: () => 0, sleep: vi.fn() },
  listArchives: mocks.listArchives,
  tauriDirProbe: { probeGameDir: mocks.probeGameDir, extractLinks: mocks.extractLinks },
  pickGameDirectory: mocks.pickGameDirectory,
}))

import PasteImport from './PasteImport.vue'
import { useRecordsStore } from '@/stores/records'

const CN_LINK =
  'https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?svr_id=76402e5b&player_id=106485288&lang=zh-Hans&gacha_id=100074&gacha_type=1&svr_area=cn&record_id=acdf99a1&resources_id=c9fbcd24&platform=PC'

function mountCard() {
  return mount(PasteImport, { global: { plugins: [createPinia()] } })
}

async function submit(wrapper: ReturnType<typeof mountCard>, link: string) {
  await wrapper.find('textarea').setValue(link)
  await wrapper.find('button.paste-btn').trigger('click')
  await vi.waitFor(() => {
    expect(wrapper.find('.paste-message').exists()).toBe(true)
  })
}

describe('手动粘贴入口', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mocks.loadRecords.mockResolvedValue([])
  })

  const okOnePool = JSON.stringify({
    code: 0,
    data: [
      { cardPoolType: '角色精准调谐', resourceId: 1, qualityLevel: 5, resourceType: '角色', name: '长离', count: 1, time: '2025-05-01 10:00:00' },
    ],
  })

  it('粘贴链接点击导入后,全池串行拉取并显示同步成功消息', async () => {
    mocks.queryPool.mockResolvedValue(okOnePool)
    mocks.insertRecords.mockResolvedValue(1)

    const wrapper = mountCard()
    await submit(wrapper, CN_LINK)

    expect(wrapper.find('.paste-message').text()).toContain('新增 13 条')
    expect(mocks.queryPool).toHaveBeenCalledTimes(13)
    expect(mocks.insertRecords).toHaveBeenCalledTimes(13)
    // 成功后清空输入
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('')
  })

  it('同步中显示「正在获取 卡池 x/13」进度行,完成后隐藏并显示结果反馈', async () => {
    let resolveFirst!: (value: string) => void
    mocks.queryPool.mockImplementation(
      () => new Promise<string>((resolve) => { resolveFirst = resolve }),
    )
    mocks.insertRecords.mockResolvedValue(1)

    const wrapper = mountCard()
    await wrapper.find('textarea').setValue(CN_LINK)
    await wrapper.find('button.paste-btn').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.find('.paste-progress').text()).toBe('正在获取 卡池 1/13')
    })

    resolveFirst(okOnePool)
    mocks.queryPool.mockResolvedValue(okOnePool)
    await vi.waitFor(() => {
      expect(wrapper.find('.paste-progress').exists()).toBe(false)
      expect(wrapper.find('.paste-message').text()).toContain('新增 13 条')
    })
  })

  it('链接失效时,消息引导重新打开游戏内唤取记录页', async () => {
    mocks.queryPool.mockResolvedValue(JSON.stringify({ code: -1, message: 'expired' }))

    const wrapper = mountCard()
    await submit(wrapper, CN_LINK)

    const message = wrapper.find('.paste-message').text()
    expect(wrapper.find('.paste-message').classes()).toContain('is-error')
    expect(message).toContain('重新打开')
    expect(message).toContain('唤取记录')
    // 首池即失效:停止后续池请求
    expect(mocks.queryPool).toHaveBeenCalledTimes(1)
  })

  it('输入为空时导入按钮禁用', () => {
    const wrapper = mountCard()

    expect((wrapper.find('button.paste-btn').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('一键获取探测期间(probing)导入禁用并显示「获取中」,点击不触发导入', async () => {
    // 一键获取探测/弹选择器期间 probing=true、syncing=false,此时粘贴导入须被门闩拦下
    const pinia = createPinia()
    setActivePinia(pinia)
    useRecordsStore().probing = true

    const wrapper = mount(PasteImport, { global: { plugins: [pinia] } })
    await wrapper.find('textarea').setValue(CN_LINK)
    await wrapper.find('button.paste-btn').trigger('click')

    expect((wrapper.find('button.paste-btn').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('button.paste-btn').text()).toContain('获取中')
    expect(mocks.queryPool).not.toHaveBeenCalled()
    // 失败不清空输入,便于门闩解除后重试
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe(CN_LINK)
  })
})
