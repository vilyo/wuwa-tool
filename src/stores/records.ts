import { defineStore } from 'pinia'
import { ref } from 'vue'
import { parseGachaLink, type ParsedGachaLink } from '@/domain/link'
import type { GachaRecord } from '@/domain/records'
import type { SyncDeps } from '@/domain/syncPool'
import { syncAll, type SyncAllProgress } from '@/domain/syncAll'
import { listArchives, realClock, tauriGachaApi, tauriStorage } from '@/services/tauriPorts'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface StoreMessage {
  kind: 'success' | 'error'
  text: string
}

/**
 * 档案 store:持有当前 UID 的流水与同步状态,编排 domain(全池串行管线,手动粘贴与一键获取共用)。
 * 外部世界一律经 services 注入的端口访问(Tauri 命令/真实时钟)。
 */
export const useRecordsStore = defineStore('records', () => {
  /** 当前档案的全部流水(展示顺序由列表组件排序) */
  const records = ref<GachaRecord[]>([])
  /** 当前档案 UID;null 表示尚未有档案 */
  const playerId = ref<string | null>(null)
  const syncing = ref(false)
  /** 全池同步进度(「正在获取 卡池 x/13」),非同步期为 null */
  const syncProgress = ref<SyncAllProgress | null>(null)
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

  /** 导入入口:解析 → 全池串行拉取 → 合并入库 → 刷新展示(#04 一键获取复用同一条管线) */
  async function importLink(raw: string): Promise<boolean> {
    if (syncing.value) return false
    syncing.value = true
    message.value = null
    syncProgress.value = null
    let parsed: ParsedGachaLink | null = null
    let ok = false
    try {
      parsed = parseGachaLink(raw)
      const deps: SyncDeps = { api: tauriGachaApi, storage: tauriStorage, clock: realClock }
      const result = await syncAll(parsed, deps, (progress) => {
        syncProgress.value = progress
      })
      await loadPlayer(parsed.playerId)
      message.value = {
        kind: 'success',
        text: `同步完成:${result.pools.length} 个卡池拉取 ${result.fetched} 条,新增 ${result.added} 条,档案共 ${result.total} 条。新记录约 30 分钟延迟,刚抽完查不到是预期行为。`,
      }
      ok = true
    } catch (error) {
      message.value = { kind: 'error', text: errorText(error) }
      // 中止前已入库的池数据照常保留并刷新展示;刷新失败不掩盖原始错误
      if (parsed !== null) {
        try {
          await loadPlayer(parsed.playerId)
        } catch {
          // 忽略
        }
      }
    } finally {
      syncing.value = false
      syncProgress.value = null
    }
    return ok
  }

  return { records, playerId, syncing, syncProgress, message, init, importLink }
})
