import { defineStore } from 'pinia'
import { ref } from 'vue'
import { buildUidChoices, type ArchiveSummary, type UidChoice } from '@/domain/archives'
import {
  exportBackup as exportBackupToFile,
  importBackup as importBackupFromFile,
} from '@/domain/backup'
import { parseGachaLink, type ParsedGachaLink } from '@/domain/link'
import { diagnosisGuidance } from '@/domain/probe'
import type { GachaRecord } from '@/domain/records'
import type { SyncDeps } from '@/domain/syncPool'
import { syncAll, type SyncAllProgress } from '@/domain/syncAll'
import {
  clearArchive,
  listArchives,
  pickBackupOpenPath,
  pickBackupSavePath,
  pickGameDirectory,
  realClock,
  tauriBackupFile,
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

/** 待确认的档案切换:解析出的 UID 与当前档案不同(CONTEXT「切换档案」) */
interface PendingSwitch {
  playerId: string
  link: ParsedGachaLink
}

/**
 * 档案 store:持有当前 UID 的流水与同步状态,编排 domain(全池串行管线,手动粘贴与一键获取共用)。
 * 档案以 player_id 为键:多 UID 选择、切换确认与档案列表的流转状态也在这里(#05)。
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
  /** 一键获取检测出多个 UID:暂停流程,等用户选择要导入的档案(不静默取其一) */
  const pendingUids = ref<UidChoice[] | null>(null)
  /** 检测到与当前档案不同的 UID:等用户确认切换(取消则中止本次导入) */
  const pendingSwitch = ref<PendingSwitch | null>(null)
  /** 档案列表弹窗(#05 最小切换入口):库内档案摘要与打开状态 */
  const archives = ref<ArchiveSummary[]>([])
  const archiveListOpen = ref(false)
  const message = ref<StoreMessage | null>(null)

  async function loadPlayer(playerIdToLoad: string): Promise<void> {
    records.value = await tauriStorage.loadRecords(playerIdToLoad)
    playerId.value = playerIdToLoad
  }

  /** 应用启动时恢复最近更新的档案(重启后数据完整可读) */
  async function init(): Promise<void> {
    if (playerId.value !== null) return
    try {
      const archiveSummaries = await listArchives()
      if (archiveSummaries.length > 0) await loadPlayer(archiveSummaries[0]!.playerId)
    } catch (error) {
      message.value = { kind: 'error', text: `读取本地档案失败:${errorText(error)}` }
    }
  }

  /** 全池管线的执行段:parse 之后的拉取 → 合并入库 → 刷新展示(各入口共用) */
  async function runSync(parsed: ParsedGachaLink): Promise<boolean> {
    syncing.value = true
    message.value = null
    syncProgress.value = null
    let ok = false
    try {
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
      try {
        await loadPlayer(parsed.playerId)
      } catch {
        // 忽略
      }
    } finally {
      syncing.value = false
      syncProgress.value = null
    }
    return ok
  }

  /** 导入入口:解析 → (UID 与当前档案不同则弹切换确认) → 全池串行管线 */
  async function importLink(raw: string): Promise<boolean> {
    if (syncing.value) return false
    let parsed: ParsedGachaLink
    try {
      parsed = parseGachaLink(raw)
    } catch (error) {
      message.value = { kind: 'error', text: errorText(error) }
      return false
    }
    // 检测到与当前档案不同的 UID:暂停,弹切换确认;确认前不发起任何拉取
    if (playerId.value !== null && parsed.playerId !== playerId.value) {
      pendingSwitch.value = { playerId: parsed.playerId, link: parsed }
      return false
    }
    return await runSync(parsed)
  }

  /** 从 UID 选择列表选定要导入的档案(用户显式选择即确认,无需再弹切换确认) */
  async function chooseUid(uid: string): Promise<void> {
    const choice = pendingUids.value?.find((candidate) => candidate.playerId === uid)
    pendingUids.value = null
    if (!choice) return
    try {
      await runSync(parseGachaLink(choice.url))
    } catch (error) {
      message.value = { kind: 'error', text: errorText(error) }
    }
  }

  /** 取消 UID 选择:中止本次一键获取 */
  function cancelUidSelection(): void {
    pendingUids.value = null
  }

  /** 确认切换:替换当前档案并导入新 UID(旧档案数据在库中按 player_id 隔离保留) */
  async function confirmSwitch(): Promise<void> {
    const pending = pendingSwitch.value
    pendingSwitch.value = null
    if (!pending) return
    await runSync(pending.link)
  }

  /** 取消切换:中止本次导入,档案保持不变 */
  function cancelSwitch(): void {
    pendingSwitch.value = null
  }

  /** 打开档案列表(最小切换入口):先刷新库内档案摘要 */
  async function openArchiveList(): Promise<void> {
    try {
      archives.value = await listArchives()
    } catch (error) {
      message.value = { kind: 'error', text: `读取档案列表失败:${errorText(error)}` }
      return
    }
    archiveListOpen.value = true
  }

  function closeArchiveList(): void {
    archiveListOpen.value = false
  }

  /** 切换到已有档案:records/playerId 整体替换(名册、统计、流水随之切换) */
  async function switchArchive(targetPlayerId: string): Promise<void> {
    // 同步期间不切换,避免与管线的展示刷新互相踩踏(与入口的 busy 门闩一致)
    if (syncing.value) return
    if (targetPlayerId === playerId.value) {
      closeArchiveList()
      return
    }
    try {
      await loadPlayer(targetPlayerId)
      closeArchiveList()
    } catch (error) {
      message.value = { kind: 'error', text: `读取档案失败:${errorText(error)}` }
    }
  }

  /** 导出当前档案为 JSON 备份文件(#12):dialog save 选路径,取消则静默返回 */
  async function exportBackup(): Promise<boolean> {
    if (playerId.value === null) {
      message.value = { kind: 'error', text: '尚无唤取档案,先完成一次导入再导出备份。' }
      return false
    }
    try {
      const path = await pickBackupSavePath(playerId.value)
      if (path === null) return false
      const result = await exportBackupToFile(
        { file: tauriBackupFile },
        path,
        playerId.value,
        records.value,
        new Date().toISOString(),
      )
      message.value = { kind: 'success', text: `已导出 ${result.count} 条唤取记录到 ${result.path}。` }
      return true
    } catch (error) {
      message.value = { kind: 'error', text: `导出备份失败:${errorText(error)}` }
      return false
    }
  }

  /** 导入备份 JSON(#12):按去重键合并入备份所属 UID 的档案,取消选文件则静默返回。
   *  导入档案 = 当前档案时刷新展示;导入其他 UID 不切换当前档案(可从档案列表切回) */
  async function importBackup(): Promise<boolean> {
    try {
      const path = await pickBackupOpenPath()
      if (path === null) return false
      const result = await importBackupFromFile({ file: tauriBackupFile, storage: tauriStorage }, path)
      if (result.playerId === playerId.value) await loadPlayer(result.playerId)
      message.value = {
        kind: 'success',
        text: `导入完成:UID ${result.playerId} 新增 ${result.added.length} 条,档案共 ${result.total} 条。`,
      }
      return true
    } catch (error) {
      message.value = { kind: 'error', text: `导入备份失败:${errorText(error)}` }
      return false
    }
  }

  /** 清空当前档案全部记录(#12,设置弹窗二次确认后调用):删除后当前档案置为空档,
   *  保守不自动切换到其他档案;档案列表缓存一并刷新 */
  async function clearCurrentArchive(): Promise<boolean> {
    const target = playerId.value
    if (target === null) return false
    try {
      const removed = await clearArchive(target)
      records.value = []
      try {
        archives.value = await listArchives()
      } catch {
        // 列表刷新失败不掩盖清空结果
      }
      message.value = { kind: 'success', text: `已清空 UID ${target} 的 ${removed} 条唤取记录。` }
      return true
    } catch (error) {
      message.value = { kind: 'error', text: `清空数据失败:${errorText(error)}` }
      return false
    }
  }

  /** 从已确认的游戏目录提取链接:单 UID 直接走管线;多 UID 暂停,交 UID 选择列表 */
  async function syncFromGameDir(gameDir: string): Promise<boolean> {
    const result = await tauriDirProbe.extractLinks(gameDir)
    const links = result.links
    if (links.length === 0) {
      message.value = { kind: 'error', text: diagnosisGuidance(result.diagnosis ?? 'no-link') }
      return false
    }
    if (links.length === 1) {
      const link = links[0]!
      const ok = await importLink(link.url)
      if (ok) {
        const base = message.value
        if (base) message.value = { kind: 'success', text: `${base.text}检测到 UID ${link.playerId}。` }
      }
      return ok
    }
    // 一份日志含多个 UID:展示选择列表,由用户决定导入哪个档案(#05)
    let archiveSummaries: ArchiveSummary[]
    try {
      archiveSummaries = await listArchives()
    } catch (error) {
      message.value = { kind: 'error', text: `读取档案列表失败:${errorText(error)}` }
      return false
    }
    pendingUids.value = buildUidChoices(links, archiveSummaries)
    return false
  }

  /** 一键获取:目录探测 → 日志提取 → 进入 importLink 全池管线。
   *  探测不到目录时弹文件夹选择器手动指定并记住(选择无效则给出具体指引) */
  async function oneClickSync(): Promise<boolean> {
    if (syncing.value || probing.value) return false
    probing.value = true
    message.value = null
    pendingUids.value = null
    pendingSwitch.value = null
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
    pendingUids,
    pendingSwitch,
    archives,
    archiveListOpen,
    message,
    init,
    importLink,
    oneClickSync,
    chooseUid,
    cancelUidSelection,
    confirmSwitch,
    cancelSwitch,
    openArchiveList,
    closeArchiveList,
    switchArchive,
    exportBackup,
    importBackup,
    clearCurrentArchive,
  }
})
