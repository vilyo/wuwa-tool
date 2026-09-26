import { defineStore } from 'pinia'
import { ref } from 'vue'
import { parseGachaLink } from '@/domain/link'
import type { GachaRecord } from '@/domain/records'
import type { SyncDeps } from '@/domain/syncPool'
import { syncPool } from '@/domain/syncPool'
import { listArchives, realClock, tauriGachaApi, tauriStorage } from '@/services/tauriPorts'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface StoreMessage {
  kind: 'success' | 'error'
  text: string
}

/**
 * 档案 store:持有当前 UID 的流水与同步状态,编排 domain(单池曳光弹)。
 * 外部世界一律经 services 注入的端口访问(Tauri 命令/真实时钟)。
 */
export const useRecordsStore = defineStore('records', () => {
  /** 当前档案的全部流水(展示顺序由列表组件排序) */
  const records = ref<GachaRecord[]>([])
  /** 当前档案 UID;null 表示尚未有档案 */
  const playerId = ref<string | null>(null)
  const syncing = ref(false)
  const message = ref<StoreMessage | null>(null)

  async function loadPlayer(playerIdToLoad: string): Promise<void> {
    records.value = await tauriStorage.loadRecords(playerIdToLoad)
    playerId.value = playerIdToLoad
  }

  /** 应用启动时恢复最近更新的档案(重启后数据完整可读) */
  async function init(): Promise<void> {
    if (playerId.value !== null) return
    try {
      const archives = await listArchives()
      if (archives.length > 0) await loadPlayer(archives[0]!.playerId)
    } catch (error) {
      message.value = { kind: 'error', text: `读取本地档案失败:${errorText(error)}` }
    }
  }

  /** 手动粘贴入口:解析 → 单池拉取 → 合并入库 → 刷新展示 */
  async function importLink(raw: string): Promise<boolean> {
    if (syncing.value) return false
    syncing.value = true
    message.value = null
    try {
      const link = parseGachaLink(raw)
      const deps: SyncDeps = { api: tauriGachaApi, storage: tauriStorage, clock: realClock }
      const result = await syncPool(link, deps)
      await loadPlayer(link.playerId)
      message.value = {
        kind: 'success',
        text: `同步完成:本池拉取 ${result.fetched} 条,新增 ${result.added} 条,档案共 ${result.total} 条。`,
      }
      return true
    } catch (error) {
      message.value = { kind: 'error', text: errorText(error) }
      return false
    } finally {
      syncing.value = false
    }
  }

  return { records, playerId, syncing, message, init, importLink }
})
