import { invoke } from '@tauri-apps/api/core'
import { DomainError, NetworkError } from '@/domain/errors'
import type { DirProbePort, DirProbeReport, LogProbeResult } from '@/domain/probe'
import type { ClockPort, GachaApiPort, PoolQueryRequest, StoragePort } from '@/domain/ports'
import type { GachaRecord } from '@/domain/records'

/** Rust db_list_archives 的行结构 */
export interface ArchiveSummary {
  playerId: string
  count: number
  firstTime: string | null
  lastTime: string | null
}

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

/** 档案列表(按最近更新倒序),用于启动时恢复最近档案 */
export function listArchives(): Promise<ArchiveSummary[]> {
  return invoke<ArchiveSummary[]>('db_list_archives')
}
