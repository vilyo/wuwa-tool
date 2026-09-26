import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRecordsStore } from '@/stores/records'
import SettingsDialog from './SettingsDialog.vue'

const mocks = vi.hoisted(() => ({
  queryPool: vi.fn(),
  loadRecords: vi.fn(),
  insertRecords: vi.fn(),
  listArchives: vi.fn(),
  probeGameDir: vi.fn(),
  extractLinks: vi.fn(),
  pickGameDirectory: vi.fn(),
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
  tauriDirProbe: { probeGameDir: mocks.probeGameDir, extractLinks: mocks.extractLinks },
  pickGameDirectory: mocks.pickGameDirectory,
  clearArchive: mocks.clearArchive,
  tauriBackupFile: { writeTextFile: mocks.writeTextFile, readTextFile: mocks.readTextFile },
  pickBackupSavePath: mocks.pickBackupSavePath,
  pickBackupOpenPath: mocks.pickBackupOpenPath,
}))

function mountDialog(open = true) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useRecordsStore()
  store.playerId = '106485288'
  store.records = [
    {
      cardPoolType: 1,
      cardPoolId: 100074,
      time: '2025-05-01 10:00:00',
      name: '长离',
      qualityLevel: 5,
      resourceId: '21010043',
      resourceType: '角色',
    },
  ]
  const wrapper = mount(SettingsDialog, {
    props: { open },
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
  return { wrapper, store }
}

afterEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  document.body.innerHTML = ''
})

describe('设置弹窗(#12):壳与无障碍', () => {
  it('open=false 时不渲染任何内容', () => {
    const { wrapper } = mountDialog(false)

    expect(wrapper.find('.settings-modal').exists()).toBe(false)
    expect(wrapper.find('.settings-backdrop').exists()).toBe(false)
  })

  it('open 时渲染设置弹窗:role=dialog、标题「设置」、关闭按钮', () => {
    const { wrapper } = mountDialog()

    const modal = wrapper.find('.settings-modal')
    expect(modal.attributes('role')).toBe('dialog')
    expect(modal.attributes('aria-modal')).toBe('true')
    expect(modal.attributes('aria-label')).toBe('设置')
    expect(wrapper.find('.settings-title').text()).toBe('设置')
    expect(wrapper.find('.settings-close').attributes('aria-label')).toBe('关闭设置')
  })

  it('数据区三入口上屏:导出备份 / 导入恢复 / 清空数据(偏好区留给 #13)', () => {
    const { wrapper } = mountDialog()

    const texts = wrapper.findAll('button').map((b) => b.text())
    expect(texts).toContain('导出备份')
    expect(texts).toContain('导入恢复')
    expect(texts).toContain('清空数据')
    expect(wrapper.text()).toContain('仅保存在你这台电脑上')
  })

  it('点击 backdrop 或关闭按钮触发 close', async () => {
    const { wrapper } = mountDialog()

    await wrapper.find('.settings-backdrop').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)

    await wrapper.find('.settings-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)
  })

  it('open 时按 ESC 触发 close;close 后监听移除不再触发', async () => {
    const { wrapper } = mountDialog()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)

    await wrapper.setProps({ open: false })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1) // 不增加
  })

  it('焦点往返:打开时焦点进入弹窗(关闭按钮),关闭后回到触发元素', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = '设置'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const { wrapper } = mountDialog()
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(wrapper.find('.settings-close').element)
    })

    await wrapper.setProps({ open: false })
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })
    wrapper.unmount()
  })
})

describe('设置弹窗(#12):导出与导入', () => {
  it('导出备份:走保存对话框并把当前档案写入所选路径', async () => {
    const { wrapper } = mountDialog()
    mocks.pickBackupSavePath.mockResolvedValue('D:\\backup\\wuwatool.json')
    mocks.writeTextFile.mockResolvedValue(undefined)

    await wrapper.findAll('button').find((b) => b.text() === '导出备份')!.trigger('click')
    await vi.waitFor(() => {
      expect(mocks.writeTextFile).toHaveBeenCalledTimes(1)
    })

    expect(mocks.pickBackupSavePath).toHaveBeenCalledWith('106485288')
    const [path, contents] = mocks.writeTextFile.mock.calls[0] as [string, string]
    expect(path).toBe('D:\\backup\\wuwatool.json')
    expect(JSON.parse(contents)).toMatchObject({ playerId: '106485288' })
  })

  it('导入恢复:走打开对话框并按备份内容合并入库', async () => {
    const { wrapper, store } = mountDialog()
    mocks.pickBackupOpenPath.mockResolvedValue('D:\\backup\\old.json')
    mocks.readTextFile.mockResolvedValue(
      JSON.stringify({
        app: 'wuwatool',
        version: 1,
        playerId: '106485288',
        exportedAt: '2026-09-26T08:00:00.000Z',
        records: [
          {
            cardPoolType: 1,
            cardPoolId: 100074,
            time: '2025-05-02 10:00:00',
            name: '折枝',
            qualityLevel: 5,
            resourceId: '21010044',
            resourceType: '角色',
          },
        ],
      }),
    )
    mocks.loadRecords.mockResolvedValue(store.records)

    await wrapper.findAll('button').find((b) => b.text() === '导入恢复')!.trigger('click')
    await vi.waitFor(() => {
      expect(mocks.insertRecords).toHaveBeenCalledTimes(1)
    })

    expect(mocks.insertRecords).toHaveBeenCalledWith('106485288', [
      expect.objectContaining({ name: '折枝' }),
    ])
    await vi.waitFor(() => {
      expect(store.message?.kind).toBe('success')
    })
  })
})

describe('设置弹窗(#13):偏好区', () => {
  const GAME_DIR = 'C:\\Wuthering Waves Game'
  const NEW_DIR = 'D:\\Games\\Wuthering Waves'

  it('偏好区三行上屏:主题分段(明色默认)、自动同步开关(默认开)、目录展示+重新探测', () => {
    const { wrapper } = mountDialog()

    const segActive = wrapper.find('.seg button.is-active')
    expect(segActive.text()).toBe('明色')

    const toggle = wrapper.find('button.toggle')
    expect(toggle.attributes('aria-label')).toBe('启动时自动同步')
    expect(toggle.attributes('aria-pressed')).toBe('true')

    expect(wrapper.find('.path-view').text()).toBe('未探测')
    expect(wrapper.findAll('button').map((b) => b.text())).toContain('重新探测')
  })

  it('主题切换:点暗色立即应用并持久化,激活态随选移动', async () => {
    const { wrapper } = mountDialog()

    await wrapper.findAll('.seg button').find((b) => b.text() === '暗色')!.trigger('click')

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('wuwatool.theme')).toBe('dark')
    expect(wrapper.findAll('.seg button').find((b) => b.text() === '暗色')!.classes()).toContain(
      'is-active',
    )
    expect(wrapper.findAll('.seg button').find((b) => b.text() === '明色')!.classes()).not.toContain(
      'is-active',
    )

    await wrapper.findAll('.seg button').find((b) => b.text() === '明色')!.trigger('click')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('自动同步开关:点击立即翻转并持久化', async () => {
    const { wrapper } = mountDialog()
    const toggle = () => wrapper.find('button.toggle')

    await toggle().trigger('click')
    expect(toggle().attributes('aria-pressed')).toBe('false')
    expect(localStorage.getItem('wuwatool.autoSync')).toBe('false')

    await toggle().trigger('click')
    expect(toggle().attributes('aria-pressed')).toBe('true')
    expect(localStorage.getItem('wuwatool.autoSync')).toBe('true')
  })

  it('记忆的游戏目录上屏;重新探测成功后显示更新且不触发同步', async () => {
    localStorage.setItem('wuwatool.gameDir', GAME_DIR)
    const { wrapper, store } = mountDialog()
    expect(wrapper.find('.path-view').text()).toBe(GAME_DIR)

    mocks.probeGameDir.mockResolvedValue({
      candidates: [{ path: NEW_DIR, source: 'registry-uninstall' }],
      diagnosis: null,
    })
    await wrapper.findAll('button').find((b) => b.text() === '重新探测')!.trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.find('.path-view').text()).toBe(NEW_DIR)
    })

    expect(mocks.probeGameDir).toHaveBeenCalledWith(GAME_DIR)
    expect(mocks.extractLinks).not.toHaveBeenCalled()
    expect(mocks.queryPool).not.toHaveBeenCalled()
    expect(store.probedGameDir).toBe(NEW_DIR)
    expect(store.message?.kind).toBe('success')
  })

  it('重新探测失败(用户取消手动指定):给出指引消息', async () => {
    const { wrapper, store } = mountDialog()
    mocks.probeGameDir.mockResolvedValue({ candidates: [], diagnosis: 'no-game-dir' })
    mocks.pickGameDirectory.mockResolvedValue(null)

    await wrapper.findAll('button').find((b) => b.text() === '重新探测')!.trigger('click')
    await vi.waitFor(() => {
      expect(store.message?.kind).toBe('error')
    })

    expect(store.message?.text).toContain('未找到游戏安装目录')
    expect(wrapper.find('.path-view').text()).toBe('未探测')
  })
})

describe('设置弹窗(#12):清空数据二次确认', () => {
  it('点「清空数据」先弹确认层:写明将删除的 UID 与不可恢复,此时不删库', async () => {
    const { wrapper } = mountDialog()

    await wrapper.findAll('button').find((b) => b.text() === '清空数据')!.trigger('click')

    const confirm = wrapper.find('.confirm-modal')
    expect(confirm.exists()).toBe(true)
    expect(confirm.text()).toContain('106485288')
    expect(confirm.text()).toContain('不可恢复')
    expect(mocks.clearArchive).not.toHaveBeenCalled()
  })

  it('确认层取消:关闭确认层,不清空', async () => {
    const { wrapper } = mountDialog()
    await wrapper.findAll('button').find((b) => b.text() === '清空数据')!.trigger('click')

    await wrapper.findAll('button').find((b) => b.text() === '取消')!.trigger('click')

    expect(wrapper.find('.confirm-modal').exists()).toBe(false)
    expect(mocks.clearArchive).not.toHaveBeenCalled()
  })

  it('确认清空:删除当前档案记录,展示置空,确认层关闭', async () => {
    const { wrapper, store } = mountDialog()
    mocks.clearArchive.mockResolvedValue(1)
    await wrapper.findAll('button').find((b) => b.text() === '清空数据')!.trigger('click')

    await wrapper.findAll('button').find((b) => b.text() === '确认清空')!.trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.find('.confirm-modal').exists()).toBe(false)
    })

    expect(mocks.clearArchive).toHaveBeenCalledWith('106485288')
    expect(store.records).toHaveLength(0)
    expect(store.message?.kind).toBe('success')
  })

  it('确认层打开时按 ESC 只关确认层,不关设置弹窗', async () => {
    const { wrapper } = mountDialog()
    await wrapper.findAll('button').find((b) => b.text() === '清空数据')!.trigger('click')
    expect(wrapper.find('.confirm-modal').exists()).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await vi.waitFor(() => {
      expect(wrapper.find('.confirm-modal').exists()).toBe(false)
    })
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.find('.settings-modal').exists()).toBe(true)
  })
})
