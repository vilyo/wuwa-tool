/** 档案领域逻辑(#05):档案以 player_id 为键(CONTEXT「档案」),
 *  库内摘要行结构与 Rust db_list_archives 返回对齐:src-tauri/src/db.rs */

/** 库内一个档案的摘要(按最近更新倒序) */
export interface ArchiveSummary {
  playerId: string
  count: number
  firstTime: string | null
  lastTime: string | null
}

/** UID 选择列表的一行:日志提取出的链接 + 该 UID 的库内档案(无 = 新档案) */
export interface UidChoice {
  playerId: string
  url: string
  archive: ArchiveSummary | null
}

/** 把日志检测出的链接与库内档案对上,生成 UID 选择列表(顺序保持检测顺序) */
export function buildUidChoices(
  links: readonly { playerId: string; url: string }[],
  archives: readonly ArchiveSummary[],
): UidChoice[] {
  const byPlayerId = new Map(archives.map((archive) => [archive.playerId, archive]))
  return links.map((link) => ({
    playerId: link.playerId,
    url: link.url,
    archive: byPlayerId.get(link.playerId) ?? null,
  }))
}
