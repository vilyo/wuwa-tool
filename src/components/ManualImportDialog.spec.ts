import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryPool: vi.fn(),
  loadRecords: vi.fn(),
  insertRecords: vi.fn(),
  listArchives: vi.fn(),
  probeGameDir: vi.fn(),
  extractLinks: vi.fn(),
  extractLinksFromFile: vi.fn(),
  pickGameDirectory: vi.fn(),
  pickLogFile: vi.fn(),
  clearArchive: vi.fn(),
  writeTextFile: vi.fn(),
  readTextFile: vi.fn(),
  pickBackupSavePath: vi.fn(),
  pickBackupOpenPath: vi.fn(),
}))

vi.mock('@/services/tauriPorts', () => ({
  tauriGachaApi: { queryPool: mocks.queryPool },
  tauriStorage: { loadRecords: mocks.loadRecords, insertRecords: mocks.insertRecords },
  realClock: { now: () => 0, sleep: vi.fn() },
  listArchives: mocks.listArchives,
  tauriDirProbe: {
    probeGameDir: mocks.probeGameDir,
    extractLinks: mocks.extractLinks,
    extractLinksFromFile: mocks.extractLinksFromFile,
  },
  pickGameDirectory: mocks.pickGameDirectory,
  pickLogFile: mocks.pickLogFile,
  clearArchive: mocks.clearArchive,
  tauriBackupFile: { writeTextFile: mocks.writeTextFile, readTextFile: mocks.readTextFile },
  pickBackupSavePath: mocks.pickBackupSavePath,
  pickBackupOpenPath: mocks.pickBackupOpenPath,
}))

import ManualImportDialog from './ManualImportDialog.vue'
import { useRecordsStore } from '@/stores/records'

const CN_LINK =
  'https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?svr_id=76402e5b&player_id=106485288&lang=zh-Hans&gacha_id=100074&gacha_type=1&svr_area=cn&record_id=acdf99a1&resources_id=c9fbcd24&platform=PC'

function mountDialog() {
  // 同一个 pinia 实例既激活又挂载,需要时测试里可直接取 store 造状态
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(ManualImportDialog, {
    global: { plugins: [pinia] },
    props: { open: true },
  })
}

async function submit(wrapper: ReturnType<typeof mountDialog>, link: string) {
  await wrapper.find('textarea').setValue(link)
  await wrapper.find('button.manual-submit').trigger('click')
  await vi.waitFor(() => {
    expect(wrapper.find('.manual-message').exists()).toBe(true)
  })
}

describe('手动导入弹窗', () => {
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

  it('open=false 不渲染;open=true 渲染弹窗并聚焦粘贴框', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    // 聚焦断言需要真实挂到 document 上(默认游离节点无法聚焦)
    const wrapper = mount(ManualImportDialog, {
      global: { plugins: [pinia] },
      props: { open: false },
      attachTo: document.body,
    })
    expect(wrapper.find('.manual-modal').exists()).toBe(false)

    await wrapper.setProps({ open: true })

    expect(wrapper.find('.manual-modal').exists()).toBe(true)
    expect(wrapper.find('.manual-modal').attributes('role')).toBe('dialog')
    // 打开即聚焦粘贴框(异步聚焦,等 watcher 内的 nextTick 完成)
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(wrapper.find('textarea').element)
    })
  })

  it('ESC 关闭:向 App 发出 close', async () => {
    const wrapper = mountDialog()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('粘贴链接点击导入后,全池串行拉取,成功后关闭弹窗并清空输入', async () => {
    mocks.queryPool.mockResolvedValue(okOnePool)
    mocks.insertRecords.mockResolvedValue(1)

    const wrapper = mountDialog()
    await submit(wrapper, CN_LINK)

    expect(wrapper.emitted('close')).toHaveLength(1)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('')
    expect(mocks.queryPool).toHaveBeenCalledTimes(13)
    expect(mocks.insertRecords).toHaveBeenCalledTimes(13)
  })

  it('同步中显示「正在获取 卡池 x/13」进度行,完成后显示结果反馈', async () => {
    let resolveFirst!: (value: string) => void
    mocks.queryPool.mockImplementation(
      () => new Promise<string>((resolve) => { resolveFirst = resolve }),
    )
    mocks.insertRecords.mockResolvedValue(1)

    const wrapper = mountDialog()
    await wrapper.find('textarea').setValue(CN_LINK)
    await wrapper.find('button.manual-submit').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.find('.manual-progress').text()).toBe('正在获取 卡池 1/13')
    })

    resolveFirst(okOnePool)
    mocks.queryPool.mockResolvedValue(okOnePool)
    await vi.waitFor(() => {
      expect(wrapper.find('.manual-progress').exists()).toBe(false)
      expect(wrapper.find('.manual-message').text()).toContain('新增 13 条')
    })
  })

  it('链接失效时,错误消息在弹窗内引导重新打开唤取记录页,弹窗保持打开', async () => {
    mocks.queryPool.mockResolvedValue(JSON.stringify({ code: -1, message: 'expired' }))

    const wrapper = mountDialog()
    await submit(wrapper, CN_LINK)

    const message = wrapper.find('.manual-message')
    expect(message.classes()).toContain('is-error')
    expect(message.text()).toContain('重新打开')
    expect(message.text()).toContain('唤取记录')
    expect(wrapper.emitted('close')).toBeUndefined()
    // 首池即失效:停止后续池请求
    expect(mocks.queryPool).toHaveBeenCalledTimes(1)
    // 失败不清空输入,便于修改重试
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe(CN_LINK)
  })

  it('输入为空时导入按钮禁用', () => {
    const wrapper = mountDialog()

    expect((wrapper.find('button.manual-submit').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('一键获取探测期间(probing)导入禁用并显示「获取中」,点击不触发导入', async () => {
    // 一键获取探测/弹选择器期间 probing=true、syncing=false,此时粘贴导入须被门闩拦下
    const wrapper = mountDialog()
    useRecordsStore().probing = true
    await nextTick()
    await wrapper.find('textarea').setValue(CN_LINK)
    await wrapper.find('button.manual-submit').trigger('click')

    expect((wrapper.find('button.manual-submit').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('button.manual-submit').text()).toContain('获取中')
    expect(mocks.queryPool).not.toHaveBeenCalled()
    // 失败不清空输入,便于门闩解除后重试
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe(CN_LINK)
  })

  it('点击「从日志文件导入」:选文件解析出链接后自动开始全池导入,成功后关闭弹窗', async () => {
    mocks.pickLogFile.mockResolvedValue('C:\\Logs\\Client.log')
    mocks.extractLinksFromFile.mockResolvedValue({
      path: 'C:\\Logs\\Client.log',
      outcome: { type: 'ok', urlCount: 1, decode: 'plain' },
      links: [{ playerId: '106485288', url: CN_LINK }],
    })
    mocks.queryPool.mockResolvedValue(okOnePool)
    mocks.insertRecords.mockResolvedValue(1)

    const wrapper = mountDialog()
    await wrapper.find('button.manual-file-btn').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.emitted('close')).toHaveLength(1)
    })
    expect(mocks.pickLogFile).toHaveBeenCalledTimes(1)
    expect(mocks.extractLinksFromFile).toHaveBeenCalledWith('C:\\Logs\\Client.log')
    expect(mocks.queryPool).toHaveBeenCalledTimes(13)
  })

  it('文件里解析不出链接时,错误指引在弹窗内且不发起拉取、不关闭', async () => {
    mocks.pickLogFile.mockResolvedValue('C:\\Logs\\Client.log')
    mocks.extractLinksFromFile.mockResolvedValue({
      path: 'C:\\Logs\\Client.log',
      outcome: { type: 'ok', urlCount: 0, decode: 'none' },
      links: [],
    })

    const wrapper = mountDialog()
    await wrapper.find('button.manual-file-btn').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.find('.manual-message').exists()).toBe(true)
    })
    expect(wrapper.find('.manual-message').classes()).toContain('is-error')
    expect(wrapper.find('.manual-message').text()).toContain('没有找到唤取链接')
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(mocks.queryPool).not.toHaveBeenCalled()
  })

  it('文件解析出多个 UID:弹窗让位关闭,流转到 UID 选择列表', async () => {
    mocks.pickLogFile.mockResolvedValue('C:\\Logs\\Client.log')
    mocks.extractLinksFromFile.mockResolvedValue({
      path: 'C:\\Logs\\Client.log',
      outcome: { type: 'ok', urlCount: 2, decode: 'plain' },
      links: [
        { playerId: '106485288', url: CN_LINK },
        { playerId: '106485289', url: CN_LINK.replace('106485288', '106485289') },
      ],
    })
    mocks.listArchives.mockResolvedValue([])

    const wrapper = mountDialog()
    await wrapper.find('button.manual-file-btn').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.emitted('close')).toHaveLength(1)
    })
    expect(useRecordsStore().pendingUids).not.toBeNull()
    expect(mocks.queryPool).not.toHaveBeenCalled()
  })

  it('粘贴的链接指向其他档案:弹窗让位关闭,流转到切换确认', async () => {
    const wrapper = mountDialog()
    useRecordsStore().playerId = '106485289'
    await nextTick()
    await wrapper.find('textarea').setValue(CN_LINK)
    await wrapper.find('button.manual-submit').trigger('click')
    await nextTick()

    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(useRecordsStore().pendingSwitch).not.toBeNull()
    expect(mocks.queryPool).not.toHaveBeenCalled()
  })
})
