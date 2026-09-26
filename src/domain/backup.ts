/** 备份与恢复(#12):JSON 格式模型 + 导入合并编排。
 *  去重键与库内一致:time + name + qualityLevel + cardPoolType(D2),复用 mergeRecords;
 *  外部世界经端口注入(文件读写、档案读写),全部可伪造单测,零 Tauri/Vue 依赖。 */
import { DomainError } from './errors'
import { mergeRecords, type GachaRecord } from './records'

/** 备份文件格式版本:结构变更时递增;导入仅接受 ≤ 当前版本 */
export const BACKUP_FORMAT_VERSION = 1

/** 备份文件顶层结构:UID + 全字段记录 + 导出时间 + 版本号 */
export interface BackupFile {
  /** 应用标记:防止拿任意 JSON 误导入 */
  app: 'wuwatool'
  version: number
  /** 备份所属档案(导入即合并入该 player_id) */
  playerId: string
  /** 导出时间(ISO 8601) */
  exportedAt: string
  /** 全字段记录(D2 口径,字段名与官方返回对齐) */
  records: GachaRecord[]
}

/** 备份文件读写端口:路径由系统对话框选择,内容经 Rust 命令落盘 */
export interface BackupFilePort {
  writeTextFile(path: string, contents: string): Promise<void>
  readTextFile(path: string): Promise<string>
}

/** 备份导入用档案端口:与 StoragePort 的读写两侧同形(tauriStorage 直接满足) */
export interface BackupStoragePort {
  loadRecords(playerId: string): Promise<GachaRecord[]>
  insertRecords(playerId: string, records: readonly GachaRecord[]): Promise<number>
}

/** 组装备份文件对象(不改写入参) */
export function buildBackup(
  playerId: string,
  records: readonly GachaRecord[],
  exportedAt: string,
): BackupFile {
  return {
    app: 'wuwatool',
    version: BACKUP_FORMAT_VERSION,
    playerId,
    exportedAt,
    records: records.map((item) => ({ ...item })),
  }
}

/** 序列化为落盘 JSON 文本 */
export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 2)
}

/** 解析备份文本:结构不符一律以领域错误拒绝,不静默吞掉坏记录 */
export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new DomainError('备份文件不是有效的 JSON,请确认选择的是导出的备份文件')
  }
  if (raw === null || typeof raw !== 'object') {
    throw new DomainError('不是鸣潮工具箱的备份文件')
  }
  const file = raw as Record<string, unknown>
  if (file['app'] !== 'wuwatool') {
    throw new DomainError('不是鸣潮工具箱的备份文件')
  }
  if (typeof file['version'] !== 'number' || file['version'] > BACKUP_FORMAT_VERSION) {
    throw new DomainError(
      `备份文件版本过新(当前支持到 v${BACKUP_FORMAT_VERSION}),请先升级应用再导入`,
    )
  }
  if (typeof file['playerId'] !== 'string' || file['playerId'] === '') {
    throw new DomainError('备份文件缺少档案 UID,无法确定恢复目标')
  }
  if (!Array.isArray(file['records'])) {
    throw new DomainError('备份文件的记录列表格式不正确')
  }
  const records = (file['records'] as unknown[]).map(parseBackupRecord)
  return {
    app: 'wuwatool',
    version: file['version'],
    playerId: file['playerId'],
    exportedAt: typeof file['exportedAt'] === 'string' ? file['exportedAt'] : '',
    records,
  }
}

/** 单条记录解析:去重键四字段必须齐全(自家导出必写),可选字段兜底(D2 口径) */
function parseBackupRecord(raw: unknown): GachaRecord {
  if (raw === null || typeof raw !== 'object') {
    throw new DomainError('备份文件的记录格式不正确')
  }
  const item = raw as Record<string, unknown>
  const time = item['time']
  const name = item['name']
  const qualityLevel = item['qualityLevel']
  const cardPoolType = item['cardPoolType']
  if (
    typeof time !== 'string' ||
    typeof name !== 'string' ||
    typeof qualityLevel !== 'number' ||
    typeof cardPoolType !== 'number'
  ) {
    throw new DomainError('备份文件的记录格式不正确(缺时间去重键字段),无法恢复')
  }
  return {
    cardPoolType,
    cardPoolId: typeof item['cardPoolId'] === 'number' ? item['cardPoolId'] : null,
    time,
    name,
    qualityLevel,
    resourceId: typeof item['resourceId'] === 'string' ? item['resourceId'] : '',
    resourceType: typeof item['resourceType'] === 'string' ? item['resourceType'] : '',
  }
}

export interface ExportBackupResult {
  path: string
  /** 导出的记录条数 */
  count: number
}

/** 导出:把当前档案序列化写入所选路径(取消选路径时上层不会调用到这里) */
export async function exportBackup(
  deps: { file: BackupFilePort },
  path: string,
  playerId: string,
  records: readonly GachaRecord[],
  exportedAt: string,
): Promise<ExportBackupResult> {
  const text = serializeBackup(buildBackup(playerId, records, exportedAt))
  await deps.file.writeTextFile(path, text)
  return { path, count: records.length }
}

export interface ImportBackupResult {
  /** 备份所属档案:合并目标 */
  playerId: string
  /** 本次真正新增的记录 */
  added: GachaRecord[]
  /** 合并后该档案总条数 */
  total: number
}

/** 导入:读文件 → 解析 → 与目标档案既有记录按去重键合并 → 只写新增部分(单事务由存储层保证)。
 *  与库内 INSERT OR IGNORE 两层语义一致,重复导入幂等 */
export async function importBackup(
  deps: { file: BackupFilePort; storage: BackupStoragePort },
  path: string,
): Promise<ImportBackupResult> {
  const backup = parseBackup(await deps.file.readTextFile(path))
  const existing = await deps.storage.loadRecords(backup.playerId)
  const { added } = mergeRecords(existing, backup.records)
  if (added.length > 0) {
    await deps.storage.insertRecords(backup.playerId, added)
  }
  return { playerId: backup.playerId, added, total: existing.length + added.length }
}
