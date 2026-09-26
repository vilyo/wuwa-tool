import { defineStore } from 'pinia'
import { ref } from 'vue'
import { parseGachaLink, type ParsedGachaLink } from '@/domain/link'
import { diagnosisGuidance, pickLatestLink, type ExtractedLink } from '@/domain/probe'
import type { GachaRecord } from '@/domain/records'
import type { SyncDeps } from '@/domain/syncPool'
import { syncAll, type SyncAllProgress } from '@/domain/syncAll'
import {
  listArchives,
  pickGameDirectory,
  realClock,
  tauriDirProbe,
  tauriGachaApi,
  tauriStorage,
} from '@/services/tauriPorts'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 手动指定的游戏目录记在本地存储(#13 会统一管理偏好,V1 先行假设) */
const GAME_DIR_STORAGE_KEY = 'wuwatool.gameDir'

function rememberedGameDir(): string | null {
  try {
    return localStorage.getItem(GAME_DIR_STORAGE_KEY)
  } catch {
    return null
  }
}

function rememberGameDir(dir: string): void {
  try {
    localStorage.setItem(GAME_DIR_STORAGE_KEY, dir)
  } catch {
    // 存储不可用时跳过记忆,不影响本次同步
  }
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
  /** 一键获取的探测/提取阶段(读日志与目录探测,先于全池拉取) */
  const probing = ref(false)
  /** 本次一键获取检测到的全部 UID(多 UID 选择 UI 在 #05) */
  const detectedUids = ref<ExtractedLink['playerId'][]>([])
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

  /** 从已确认的游戏目录提取链接并进入全池管线;成功后在结果中注明检测到的 UID 列表 */
  async function syncFromGameDir(gameDir: string): Promise<boolean> {
    const result = await tauriDirProbe.extractLinks(gameDir)
    if (result.links.length === 0) {
      message.value = { kind: 'error', text: diagnosisGuidance(result.diagnosis ?? 'no-link') }
      return false
    }
    const latest = pickLatestLink(result.links)
    if (latest === null) return false
    detectedUids.value = result.links.map((link) => link.playerId)
    const ok = await importLink(latest.url)
    if (ok) {
      const base = message.value
      const uids = detectedUids.value
      const note =
        uids.length > 1
          ? `检测到 ${uids.length} 个 UID(${uids.join('、')}),已导入最新链接所属的 UID ${latest.playerId}。`
          : `检测到 UID ${uids[0]}。`
      if (base) message.value = { kind: 'success', text: `${base.text}${note}` }
    }
    return ok
  }

  /** 一键获取:目录探测 → 日志提取 → 最新链接直接走 importLink 全池管线。
   *  探测不到目录时弹文件夹选择器手动指定并记住(选择无效则给出具体指引) */
  async function oneClickSync(): Promise<boolean> {
    if (syncing.value || probing.value) return false
    probing.value = true
    message.value = null
    detectedUids.value = []
    try {
      let report = await tauriDirProbe.probeGameDir(rememberedGameDir())
      if (report.candidates.length === 0) {
        message.value = { kind: 'error', text: diagnosisGuidance('no-game-dir') }
        const picked = await pickGameDirectory()
        if (picked === null) return false
        report = await tauriDirProbe.probeGameDir(picked)
        const manual = report.candidates.find((candidate) => candidate.source === 'manual')
        if (!manual) {
          message.value = {
            kind: 'error',
            text: '所选目录未找到 Client 文件夹,请选择游戏安装根目录(含 Client 文件夹)后重试。',
          }
          return false
        }
        rememberGameDir(picked)
        return await syncFromGameDir(manual.path)
      }
      return await syncFromGameDir(report.candidates[0]!.path)
    } catch (error) {
      message.value = { kind: 'error', text: `一键获取失败:${errorText(error)}` }
      return false
    } finally {
      probing.value = false
    }
  }

  return {
    records,
    playerId,
    syncing,
    syncProgress,
    probing,
    detectedUids,
    message,
    init,
    importLink,
    oneClickSync,
  }
})
