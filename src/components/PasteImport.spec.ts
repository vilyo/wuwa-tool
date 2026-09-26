import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryPool: vi.fn(),
  loadRecords: vi.fn(),
  insertRecords: vi.fn(),
  listArchives: vi.fn(),
}))

vi.mock('@/services/tauriPorts', () => ({
  tauriGachaApi: { queryPool: mocks.queryPool },
  tauriStorage: { loadRecords: mocks.loadRecords, insertRecords: mocks.insertRecords },
  realClock: { now: () => 0, sleep: vi.fn() },
  listArchives: mocks.listArchives,
}))

import PasteImport from './PasteImport.vue'

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
    mocks.loadRecords.mockResolvedValue([])
  })

  it('粘贴链接点击导入后,显示同步成功消息', async () => {
    mocks.queryPool.mockResolvedValue(
      JSON.stringify({
        code: 0,
        data: [
          { cardPoolType: '角色精准调谐', resourceId: 1, qualityLevel: 5, resourceType: '角色', name: '长离', count: 1, time: '2025-05-01 10:00:00' },
        ],
      }),
    )
    mocks.insertRecords.mockResolvedValue(1)

    const wrapper = mountCard()
    await submit(wrapper, CN_LINK)

    expect(wrapper.find('.paste-message').text()).toContain('新增 1 条')
    expect(mocks.insertRecords).toHaveBeenCalledTimes(1)
    // 成功后清空输入
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('')
  })

  it('链接失效时,消息引导重新打开游戏内唤取记录页', async () => {
    mocks.queryPool.mockResolvedValue(JSON.stringify({ code: -1, message: 'expired' }))

    const wrapper = mountCard()
    await submit(wrapper, CN_LINK)

    const message = wrapper.find('.paste-message').text()
    expect(wrapper.find('.paste-message').classes()).toContain('is-error')
    expect(message).toContain('重新打开')
    expect(message).toContain('唤取记录')
  })

  it('输入为空时导入按钮禁用', () => {
    const wrapper = mountCard()

    expect((wrapper.find('button.paste-btn').element as HTMLButtonElement).disabled).toBe(true)
  })
})
