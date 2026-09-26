import { invoke } from '@tauri-apps/api/core'
import type { ArchiveSummary } from '@/domain/archives'
import type { BackupFilePort } from '@/domain/backup'
import { DomainError, NetworkError } from '@/domain/errors'
import type { DirProbePort, DirProbeReport, FileLinkResult, LogProbeResult } from '@/domain/probe'
import type { ClockPort, GachaApiPort, PoolQueryRequest, StoragePort } from '@/domain/ports'
import type { GachaRecord } from '@/domain/records'

/** Rust db_list_archives 的行结构(类型定义在 domain/archives,此处再导出保持旧引用可用) */
export type { ArchiveSummary }

/**
 * gacha_query 的拒绝值:Rust GachaCommandError 序列化结果 {kind, message}。
 * kind 决定 domain 的重试分类:network=可重试,fatal/未知形状=确定性失败不重试。
 */
export function toGachaError(raw: unknown): Error {
  if (raw !== null && typeof raw === 'object' && 'kind' in raw) {
    const payload = raw as { kind?: unknown; message?: unknown }
    const message = typeof payload.message === 'string' ? payload.message : undefined
    if (payload.kind === 'network') return new NetworkError(message)
    if (payload.kind === 'fatal') return new DomainError(message ?? '获取唤取记录失败')
  }
  return new DomainError('获取唤取记录失败')
}

/** 经 Rust gacha_query 发起单池官方请求(Rust 只发一次,限速与重试在前端 domain) */
export const tauriGachaApi: GachaApiPort = {
  async queryPool(request: PoolQueryRequest): Promise<string> {
    try {
      return await invoke<string>('gacha_query', { request })
    } catch (raw) {
      throw toGachaError(raw)
    }
  },
}

/** 经 Rust db_* 命令读写本地 SQLite(写入侧单事务 INSERT OR IGNORE) */
export const tauriStorage: StoragePort = {
  loadRecords(playerId: string): Promise<GachaRecord[]> {
    return invoke<GachaRecord[]>('db_load_records', { playerId })
  },
  insertRecords(playerId: string, records: readonly GachaRecord[]): Promise<number> {
    return invoke<number>('db_insert_records', { playerId, records: [...records] })
  },
}

/** 真实时钟:重试/限速间隔用 */
export const realClock: ClockPort = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/** 经 Rust probe 命令做目录探测与日志提取(共享读、XOR 双路径、多 UID 归并在 Rust) */
export const tauriDirProbe: DirProbePort = {
  probeGameDir(manualDir: string | null): Promise<DirProbeReport> {
    return invoke<DirProbeReport>('probe_game_dir', { manualDir })
  },
  extractLinks(gameDir: string): Promise<LogProbeResult> {
    return invoke<LogProbeResult>('extract_gacha_links', { gameDir })
  },
  extractLinksFromFile(path: string): Promise<FileLinkResult> {
    return invoke<FileLinkResult>('extract_links_from_file', { path })
  },
}

/** 手动指定游戏目录:系统文件夹选择器(tauri-plugin-dialog),取消返回 null */
export async function pickGameDirectory(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({
    directory: true,
    multiple: false,
    title: '选择游戏安装目录(含 Client 文件夹)',
  })
  return typeof selected === 'string' ? selected : null
}

/** 手动选择日志文件(Client.log / KRSDK debug.log 及其拷贝):系统打开对话框,取消返回 null */
export async function pickLogFile(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({
    directory: false,
    multiple: false,
    title: '选择包含唤取链接的日志文件(Client.log / debug.log)',
    filters: [
      { name: '日志文件', extensions: ['log', 'txt'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  })
  return typeof selected === 'string' ? selected : null
}

/** 档案列表(按最近更新倒序),用于启动时恢复最近档案 */
export function listArchives(): Promise<ArchiveSummary[]> {
  return invoke<ArchiveSummary[]>('db_list_archives')
}

/** 清空指定 UID 档案的全部记录(设置弹窗二次确认后调用),返回删除条数 */
export function clearArchive(playerId: string): Promise<number> {
  return invoke<number>('db_clear_archive', { playerId })
}

/** 备份文件读写:经 Rust db_export_to_file / db_import_from_file 落盘(#12) */
export const tauriBackupFile: BackupFilePort = {
  async writeTextFile(path: string, contents: string): Promise<void> {
    await invoke('db_export_to_file', { path, contents })
  },
  readTextFile(path: string): Promise<string> {
    return invoke<string>('db_import_from_file', { path })
  },
}

/** 导出备份:系统保存对话框选路径,取消返回 null */
export async function pickBackupSavePath(playerId: string): Promise<string | null> {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const selected = await save({
    title: '导出唤取记录备份',
    defaultPath: `wuwatool-backup-${playerId}.json`,
    filters: [{ name: 'JSON 备份', extensions: ['json'] }],
  })
  return typeof selected === 'string' ? selected : null
}

/** 导入备份:系统打开对话框选 JSON 备份文件,取消返回 null */
export async function pickBackupOpenPath(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({
    directory: false,
    multiple: false,
    title: '选择唤取记录备份文件',
    filters: [{ name: 'JSON 备份', extensions: ['json'] }],
  })
  return typeof selected === 'string' ? selected : null
}
