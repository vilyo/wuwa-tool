/** 目录探测与日志提取的类型与诊断文案(#04)。
 *  返回契约与 Rust probe 模块对齐:src-tauri/src/probe/mod.rs */

export type DirSource =
  | 'registry-uninstall'
  | 'mui-cache'
  | 'firewall'
  | 'xbox-gaming-root'
  | 'common-scan'
  | 'manual'

export interface DirCandidate {
  path: string
  source: DirSource
}

export interface DirProbeReport {
  /** 按探测优先级排序、已验证的游戏目录;空列表表示全部来源未命中 */
  candidates: DirCandidate[]
  diagnosis: 'no-game-dir' | null
}

export type LogFileKind = 'client' | 'krsdk'

export type LogReadOutcome =
  | { type: 'ok'; urlCount: number; decode: 'plain' | 'xor' | 'none' }
  | { type: 'missing' }
  | { type: 'denied' }
  | { type: 'io-error' }

export interface LogFileInfo {
  kind: LogFileKind
  path: string
  outcome: LogReadOutcome
}

/** 一条唤取链接及其所属 UID(一份日志可能含多个 UID,research §5) */
export interface ExtractedLink {
  playerId: string
  url: string
}

export type LogDiagnosisCode = 'no-link' | 'log-disabled' | 'log-denied'

export interface LogProbeResult {
  files: LogFileInfo[]
  /** 按 player_id 去重、按最后出现排序(末位 = 最新);多 UID 选择 UI 在 #05 */
  links: ExtractedLink[]
  diagnosis: LogDiagnosisCode | null
}

export type ProbeDiagnosisCode = 'no-game-dir' | LogDiagnosisCode

/** 目录探测端口:实现见 services/tauriPorts.ts(Rust probe 命令) */
export interface DirProbePort {
  probeGameDir(manualDir: string | null): Promise<DirProbeReport>
  extractLinks(gameDir: string): Promise<LogProbeResult>
}

/** 最新一条唤取链接 = 列表末位(research §1.4 取最后一条);空列表返回 null */
export function pickLatestLink(links: readonly ExtractedLink[]): ExtractedLink | null {
  return links.length > 0 ? (links[links.length - 1] ?? null) : null
}

/** 失败诊断的具体指引(官方用语「唤取」),每种失败配下一步动作 */
const DIAGNOSIS_GUIDANCE: Record<ProbeDiagnosisCode, string> = {
  'no-game-dir':
    '未找到游戏安装目录。请在弹出的窗口中选择游戏安装根目录(含 Client 文件夹),选择会被记住,下次无需重复。',
  'no-link':
    '日志中还没有唤取链接:请启动游戏并打开一次「唤取记录」页,然后重新点击「一键获取」。',
  'log-disabled':
    '客户端日志已被关闭(Engine.ini 中 [Core.Log] Global=off)。请删除游戏目录下 Client\\Saved\\Config\\WindowsNoEditor\\Engine.ini 中的该设置,进入游戏打开「唤取记录」页后重试。',
  'log-denied':
    '客户端日志被设为只读、拒绝读取(ACL)。请以管理员身份取消日志文件的只读属性后重试。',
}

export function diagnosisGuidance(code: ProbeDiagnosisCode): string {
  return DIAGNOSIS_GUIDANCE[code]
}
