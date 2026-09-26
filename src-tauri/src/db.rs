//! 本地 SQLite 档案存储(D2):表 `pull_records`,每行 = 独立的一抽(#15 实测:官方逐抽返回,
//! count 恒 1,同一次十连抽到同名同星物品是同键多行,禁止合并/丢弃)。
//! 业务合并去重在前端 domain/merge 完成(同键按出现份数只增不减),
//! `seq` 列区分同键各行并作为唯一索引的一部分,是第二道幂等保险。

use std::collections::HashMap;
use std::time::Duration;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

pub const DB_FILE_NAME: &str = "wuwatool.sqlite3";

/// 连接忙等上限:写入口并发时不立即报 SQLITE_BUSY,而是等待持锁方释放
const DB_BUSY_TIMEOUT: Duration = Duration::from_secs(3);

pub const SCHEMA_SQL: &str = "
CREATE TABLE IF NOT EXISTS pull_records (
    player_id      TEXT NOT NULL,
    card_pool_type INTEGER NOT NULL,
    card_pool_id   INTEGER,
    time           TEXT NOT NULL,
    name           TEXT NOT NULL,
    quality_level  INTEGER NOT NULL,
    resource_id    TEXT,
    resource_type  TEXT,
    seq            INTEGER NOT NULL DEFAULT 0
);
";

/// 单条唤取记录:JSON 字段名与官方 API 返回对齐(D2)。
/// `card_pool_type` 是数字池 code(取本池请求时的 code,与返回体中文池名无关)。
/// `seq` 不由前端传入:写入时按「该键在库内的既有份数 + 批内序号」计算。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRecord {
    pub card_pool_type: i64,
    /// 链接 gacha_id 解析出的数字,无法解析时为 null
    pub card_pool_id: Option<i64>,
    pub time: String,
    pub name: String,
    pub quality_level: i64,
    #[serde(default)]
    pub resource_id: String,
    #[serde(default)]
    pub resource_type: String,
}

/// 档案摘要(一个 UID 一份档案)
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveSummary {
    pub player_id: String,
    pub count: i64,
    pub first_time: Option<String>,
    pub last_time: Option<String>,
}

pub fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(SCHEMA_SQL)?;
    migrate_to_seq(conn)
}

/// 既有库迁移(#15):补 seq 列(旧行默认 0)并重建唯一索引。
/// 「count 聚合」实验(曾短暂存在)的库一并移除该列。
/// 注意:旧版行为曾把同键同名多抽丢行,迁移只保证结构正确——被丢的份数需清档后
/// 重新全量同步(或从原始数据重建)才能补回;新档案从首次同步起即精确。
fn migrate_to_seq(conn: &Connection) -> rusqlite::Result<()> {
    let has_column = |name: &str| -> rusqlite::Result<bool> {
        conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('pull_records') WHERE name = ?1",
            params![name],
            |row| row.get::<_, i64>(0),
        )
        .map(|n| n > 0)
    };
    let mut touched = false;
    if !has_column("seq")? {
        conn.execute_batch(
            "ALTER TABLE pull_records ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;",
        )?;
        touched = true;
    }
    if has_column("count")? {
        conn.execute_batch(
            "DROP INDEX IF EXISTS idx_pull_records_dedupe;
             ALTER TABLE pull_records DROP COLUMN \"count\";",
        )?;
        touched = true;
    }
    if touched {
        // 旧索引定义不含 seq(或引用已删列)
        conn.execute_batch("DROP INDEX IF EXISTS idx_pull_records_dedupe;")?;
    }
    // 唯一索引(含 seq)每次启动幂等重建,保证新库/迁移后的库都是新定义
    conn.execute_batch(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_pull_records_dedupe
             ON pull_records (player_id, time, name, quality_level, card_pool_type, seq);",
    )?;
    Ok(())
}

/// 单事务批量写入(#15:每行=一抽;同键多抽按出现序号 seq 区分,只增不减)。
/// seq = 该键在库内的既有份数 + 本批内的出现序号;返回实际新增行数。
pub fn insert_records(
    conn: &Connection,
    player_id: &str,
    records: &[PullRecord],
) -> rusqlite::Result<usize> {
    let tx = conn.unchecked_transaction()?;
    let mut inserted = 0;
    {
        let mut stmt_count = tx.prepare(
            "SELECT COUNT(*) FROM pull_records
             WHERE player_id=?1 AND card_pool_type=?2 AND time=?3 AND name=?4 AND quality_level=?5",
        )?;
        let mut stmt_ins = tx.prepare(
            "INSERT OR IGNORE INTO pull_records
             (player_id, card_pool_type, card_pool_id, time, name, quality_level, resource_id, resource_type, seq)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        )?;
        let mut batch_mult: HashMap<(i64, String, String, i64), i64> = HashMap::new();
        for record in records {
            let key = (
                record.card_pool_type,
                record.time.clone(),
                record.name.clone(),
                record.quality_level,
            );
            let seen = batch_mult.entry(key).or_insert_with(|| {
                stmt_count
                    .query_row(
                        params![
                            player_id,
                            record.card_pool_type,
                            record.time,
                            record.name,
                            record.quality_level
                        ],
                        |row| row.get::<_, i64>(0),
                    )
                    .unwrap_or(0)
            });
            let seq = *seen;
            *seen += 1;
            inserted += stmt_ins.execute(params![
                player_id,
                record.card_pool_type,
                record.card_pool_id,
                record.time,
                record.name,
                record.quality_level,
                record.resource_id,
                record.resource_type,
                seq,
            ])?;
        }
    }
    tx.commit()?;
    Ok(inserted)
}

pub fn load_records(conn: &Connection, player_id: &str) -> rusqlite::Result<Vec<PullRecord>> {
    let mut stmt = conn.prepare(
        "SELECT card_pool_type, card_pool_id, time, name, quality_level, resource_id, resource_type
         FROM pull_records
         WHERE player_id = ?1
         ORDER BY time DESC, rowid DESC",
    )?;
    let rows = stmt.query_map(params![player_id], |row| {
        Ok(PullRecord {
            card_pool_type: row.get(0)?,
            card_pool_id: row.get(1)?,
            time: row.get(2)?,
            name: row.get(3)?,
            quality_level: row.get(4)?,
            resource_id: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
            resource_type: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
        })
    })?;
    rows.collect()
}

pub fn list_archives(conn: &Connection) -> rusqlite::Result<Vec<ArchiveSummary>> {
    let mut stmt = conn.prepare(
        "SELECT player_id, COUNT(*) AS count, MIN(time) AS first_time, MAX(time) AS last_time
         FROM pull_records
         GROUP BY player_id
         ORDER BY last_time DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ArchiveSummary {
            player_id: row.get(0)?,
            count: row.get(1)?,
            first_time: row.get(2)?,
            last_time: row.get(3)?,
        })
    })?;
    rows.collect()
}

/// 清空指定 UID 档案的全部记录(#12),返回删除条数;其他档案不受影响
pub fn clear_archive(conn: &Connection, player_id: &str) -> rusqlite::Result<usize> {
    conn.execute("DELETE FROM pull_records WHERE player_id = ?1", params![player_id])
}

/// 备份文件大小上限:正常档案 JSON 远小于此值,防御误选大文件整读进内存
const MAX_BACKUP_FILE_BYTES: u64 = 64 * 1024 * 1024;

/// 把前端序列化好的备份 JSON 文本写入所选路径(#12 导出);格式与合并在前端 domain
pub fn export_to_file(path: &str, contents: &str) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|e| format!("写入备份文件失败:{e}"))
}

/// 读取备份 JSON 文本(#12 导入),超限拒绝以防误选大文件
pub fn import_from_file(path: &str) -> Result<String, String> {
    import_from_file_with_limit(path, MAX_BACKUP_FILE_BYTES)
}

fn import_from_file_with_limit(path: &str, max_bytes: u64) -> Result<String, String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("读取备份文件失败:{e}"))?;
    if meta.len() > max_bytes {
        return Err(format!(
            "备份文件过大({} 字节,上限 {} MB),请确认选择的是唤取记录备份文件",
            meta.len(),
            MAX_BACKUP_FILE_BYTES / (1024 * 1024)
        ));
    }
    std::fs::read_to_string(path).map_err(|e| format!("读取备份文件失败:{e}"))
}

/// 连接级配置:WAL(同步中途进程崩溃不留半写)+ busy_timeout(并发写忙等而非立即失败)
pub fn configure_connection(conn: &Connection) -> rusqlite::Result<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.busy_timeout(DB_BUSY_TIMEOUT)
}

/// 打开(必要时创建)数据目录下的库文件并确保 schema 存在
fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("定位应用数据目录失败:{e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建应用数据目录失败:{e}"))?;
    let conn =
        Connection::open(dir.join(DB_FILE_NAME)).map_err(|e| format!("打开本地数据库失败:{e}"))?;
    configure_connection(&conn).map_err(|e| format!("配置本地数据库失败:{e}"))?;
    init_schema(&conn).map_err(|e| format!("初始化本地数据库失败:{e}"))?;
    Ok(conn)
}

/// 批量写入唤取记录(单事务;同键多抽按 seq 区分,每行=一抽),返回实际新增行数
#[tauri::command(async)]
pub fn db_insert_records(
    app: AppHandle,
    player_id: String,
    records: Vec<PullRecord>,
) -> Result<usize, String> {
    let conn = open_db(&app)?;
    insert_records(&conn, &player_id, &records).map_err(|e| format!("写入唤取记录失败:{e}"))
}

/// 读取指定 UID 的全部唤取记录(时间倒序)
#[tauri::command(async)]
pub fn db_load_records(app: AppHandle, player_id: String) -> Result<Vec<PullRecord>, String> {
    let conn = open_db(&app)?;
    load_records(&conn, &player_id).map_err(|e| format!("读取唤取记录失败:{e}"))
}

/// 档案列表(按最近更新倒序);用于重启后恢复最近档案
#[tauri::command(async)]
pub fn db_list_archives(app: AppHandle) -> Result<Vec<ArchiveSummary>, String> {
    let conn = open_db(&app)?;
    list_archives(&conn).map_err(|e| format!("读取档案列表失败:{e}"))
}

/// 清空指定 UID 档案的全部记录,返回删除条数(设置弹窗二次确认后调用,#12)
#[tauri::command(async)]
pub fn db_clear_archive(app: AppHandle, player_id: String) -> Result<usize, String> {
    let conn = open_db(&app)?;
    clear_archive(&conn, &player_id).map_err(|e| format!("清空档案失败:{e}"))
}

/// 导出备份:把前端序列化的备份 JSON 写入用户所选路径(#12)
#[tauri::command(async)]
pub fn db_export_to_file(path: String, contents: String) -> Result<(), String> {
    export_to_file(&path, &contents)
}

/// 导入备份:读取用户所选备份 JSON 的文本;解析、校验与合并在前端 domain(#12)
#[tauri::command(async)]
pub fn db_import_from_file(path: String) -> Result<String, String> {
    import_from_file(&path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().expect("内存库应可打开");
        init_schema(&conn).expect("schema 应可初始化");
        conn
    }

    fn record(time: &str, name: &str, pool: i64) -> PullRecord {
        PullRecord {
            card_pool_type: pool,
            card_pool_id: Some(100074),
            time: time.into(),
            name: name.into(),
            quality_level: 5,
            resource_id: "21010043".into(),
            resource_type: "角色".into(),
        }
    }

    #[test]
    fn insert_assigns_per_key_occurrence_seq() {
        let conn = memory_db();
        // 同键多抽:每行=一抽,seq 按键内出现序号递增;不同键互不影响
        let ten_pull = vec![
            record("2025-05-01 10:00:00", "鉴心", 1),
            record("2025-05-01 10:00:00", "远行者臂铠·破障", 1),
            record("2025-05-01 10:00:00", "远行者臂铠·破障", 1),
            record("2025-05-01 10:00:00", "暗夜迅刀·黑闪", 1),
        ];
        assert_eq!(insert_records(&conn, "106485288", &ten_pull).unwrap(), 4);

        let seq_of = |name: &str| -> Vec<i64> {
            let mut stmt = conn
                .prepare(
                    "SELECT seq FROM pull_records WHERE player_id='106485288' AND name=?1 ORDER BY seq",
                )
                .unwrap();
            stmt.query_map(params![name], |row| row.get(0))
                .unwrap()
                .map(|s| s.unwrap())
                .collect()
        };
        assert_eq!(seq_of("远行者臂铠·破障"), [0, 1]); // 同键两行以 seq 0/1 区分
        assert_eq!(seq_of("鉴心"), [0]);
        assert_eq!(seq_of("暗夜迅刀·黑闪"), [0]);
        assert_eq!(load_records(&conn, "106485288").unwrap().len(), 4);
    }

    #[test]
    fn growing_multiplicity_appends_missing_copies_with_dense_seq() {
        // 旧库只有 1 份(seq 0,历史丢行);merge 层过滤出缺失的 2 份送入 → seq 1/2 补齐
        let conn = memory_db();
        insert_records(&conn, "106485288", &[record("2025-05-01 10:00:00", "远行者臂铠·破障", 1)]).unwrap();

        let missing = vec![
            record("2025-05-01 10:00:00", "远行者臂铠·破障", 1),
            record("2025-05-01 10:00:00", "远行者臂铠·破障", 1),
        ];
        assert_eq!(insert_records(&conn, "106485288", &missing).unwrap(), 2);
        let seqs: Vec<i64> = {
            let mut stmt = conn
                .prepare(
                    "SELECT seq FROM pull_records WHERE player_id='106485288' AND name='远行者臂铠·破障' ORDER BY seq",
                )
                .unwrap();
            stmt.query_map([], |row| row.get(0)).unwrap().map(|s| s.unwrap()).collect()
        };
        assert_eq!(seqs, [0, 1, 2]);
    }

    // 注:本层不做按键去重——同键多行是合法数据(#15),新增份数由前端 merge 层过滤后送入,
    // 重复调用本层会按调用内容继续追加(seq 继续递增)。

    #[test]
    fn migration_adds_seq_column_to_legacy_table() {
        let conn = Connection::open_in_memory().unwrap();
        // 旧版 schema(#15 之前):无 seq 列,已含历史数据
        conn.execute_batch(
            "CREATE TABLE pull_records (
                player_id      TEXT NOT NULL,
                card_pool_type INTEGER NOT NULL,
                card_pool_id   INTEGER,
                time           TEXT NOT NULL,
                name           TEXT NOT NULL,
                quality_level  INTEGER NOT NULL,
                resource_id    TEXT,
                resource_type  TEXT
            );
            INSERT INTO pull_records (player_id, card_pool_type, card_pool_id, time, name, quality_level, resource_id, resource_type)
            VALUES ('106485288', 1, 100074, '2025-05-01 10:00:00', '长离', 5, '21010043', '角色');",
        )
        .unwrap();

        init_schema(&conn).unwrap();
        let loaded = load_records(&conn, "106485288").unwrap();
        assert_eq!(loaded.len(), 1);
        // 迁移后同键第二份可正常写入(旧行为会丢行)
        insert_records(&conn, "106485288", &[record("2025-05-01 10:00:00", "长离", 1)]).unwrap();
        assert_eq!(load_records(&conn, "106485288").unwrap().len(), 2);
    }

    #[test]
    fn migration_removes_count_column_from_count_experiment_databases() {
        // 「count 聚合」实验版的库:含 count 列,迁移后删除并换成 seq
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE pull_records (
                player_id      TEXT NOT NULL,
                card_pool_type INTEGER NOT NULL,
                card_pool_id   INTEGER,
                time           TEXT NOT NULL,
                name           TEXT NOT NULL,
                quality_level  INTEGER NOT NULL,
                resource_id    TEXT,
                resource_type  TEXT,
                \"count\"       INTEGER NOT NULL DEFAULT 1
            );
            CREATE UNIQUE INDEX idx_pull_records_dedupe ON pull_records (player_id, time, name, quality_level, card_pool_type);
            INSERT INTO pull_records (player_id, card_pool_type, card_pool_id, time, name, quality_level, resource_id, resource_type, \"count\")
            VALUES ('106485288', 1, 100074, '2025-05-01 10:00:00', '长离', 5, '21010043', '角色', 3);",
        )
        .unwrap();

        init_schema(&conn).unwrap();
        let cols: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(pull_records)").unwrap();
            stmt.query_map([], |row| row.get::<_, String>(1)).unwrap().map(|c| c.unwrap()).collect()
        };
        assert!(!cols.iter().any(|c| c == "count"));
        assert!(cols.iter().any(|c| c == "seq"));
        // count=3 的聚合行回到「1 行」语义;同键第二份可写入
        assert_eq!(load_records(&conn, "106485288").unwrap().len(), 1);
        insert_records(&conn, "106485288", &[record("2025-05-01 10:00:00", "长离", 1)]).unwrap();
        assert_eq!(load_records(&conn, "106485288").unwrap().len(), 2);
    }

    #[test]
    fn migration_is_idempotent_when_column_already_exists() {
        let conn = memory_db();
        init_schema(&conn).unwrap();
        init_schema(&conn).unwrap(); // 新库重复初始化不报错
        insert_records(&conn, "106485288", &[record("2025-05-01 10:00:00", "长离", 1)]).unwrap();
        assert_eq!(load_records(&conn, "106485288").unwrap().len(), 1);
    }

    #[test]
    fn dedupe_key_scopes_by_player_and_pool_code() {
        let conn = memory_db();
        insert_records(&conn, "106485288", &[record("2025-05-01 10:00:00", "长离", 1)]).unwrap();

        // 同键不同 gacha_id 仍是同键的另一份(由 merge 层决定是否新增),pool code 不入键值本身
        let mut same_key = record("2025-05-01 10:00:00", "长离", 1);
        same_key.card_pool_id = Some(999999);
        assert_eq!(insert_records(&conn, "106485288", &[same_key]).unwrap(), 1);

        // 不同池 code 独立计数
        assert_eq!(
            insert_records(&conn, "106485288", &[record("2025-05-01 10:00:00", "长离", 8)]).unwrap(),
            1
        );
        // 不同玩家互不冲突
        assert_eq!(
            insert_records(&conn, "42", &[record("2025-05-01 10:00:00", "长离", 1)]).unwrap(),
            1
        );
    }

    #[test]
    fn load_scopes_to_player_and_orders_time_desc() {
        let conn = memory_db();
        insert_records(
            &conn,
            "106485288",
            &[
                record("2025-05-01 10:00:00", "较早", 1),
                record("2025-05-03 09:00:00", "最新", 1),
                record("2025-05-02 08:00:00", "居中", 1),
            ],
        )
        .unwrap();
        insert_records(&conn, "42", &[record("2025-05-04 09:00:00", "他人", 1)]).unwrap();

        let loaded = load_records(&conn, "106485288").unwrap();
        let names: Vec<&str> = loaded.iter().map(|r| r.name.as_str()).collect();
        assert_eq!(names, ["最新", "居中", "较早"]);
    }

    #[test]
    fn list_archives_aggregates_by_player_latest_first() {
        let conn = memory_db();
        insert_records(&conn, "106485288", &[record("2025-05-01 10:00:00", "甲", 1)]).unwrap();
        insert_records(
            &conn,
            "42",
            &[
                record("2025-05-02 10:00:00", "乙", 1),
                record("2025-05-05 10:00:00", "丙", 1),
            ],
        )
        .unwrap();

        let archives = list_archives(&conn).unwrap();
        assert_eq!(archives.len(), 2);
        assert_eq!(archives[0].player_id, "42");
        assert_eq!(archives[0].count, 2);
        assert_eq!(archives[0].first_time.as_deref(), Some("2025-05-02 10:00:00"));
        assert_eq!(archives[0].last_time.as_deref(), Some("2025-05-05 10:00:00"));
        assert_eq!(archives[1].player_id, "106485288");
        assert_eq!(archives[1].count, 1);
    }

    #[test]
    fn record_json_roundtrip_uses_camel_case() {
        let original = record("2025-05-01 10:00:00", "长离", 1);
        let json = serde_json::to_string(&original).unwrap();
        assert!(json.contains("\"cardPoolType\":1"));
        assert!(json.contains("\"qualityLevel\":5"));
        assert!(json.contains("\"cardPoolId\":100074"));

        let parsed: PullRecord = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, original);
    }

    #[test]
    fn clear_archive_deletes_only_target_player_and_reports_count() {
        let conn = memory_db();
        insert_records(
            &conn,
            "106485288",
            &[
                record("2025-05-01 10:00:00", "长离", 1),
                record("2025-05-02 10:00:00", "折枝", 1),
            ],
        )
        .unwrap();
        insert_records(&conn, "42", &[record("2025-05-03 10:00:00", "他人", 1)]).unwrap();

        assert_eq!(clear_archive(&conn, "106485288").unwrap(), 2);
        assert!(load_records(&conn, "106485288").unwrap().is_empty());
        // 其他档案不受影响
        assert_eq!(load_records(&conn, "42").unwrap().len(), 1);
        // 再清一次:0 条(幂等)
        assert_eq!(clear_archive(&conn, "106485288").unwrap(), 0);
    }

    #[test]
    fn backup_file_roundtrip_writes_and_reads_same_text() {
        let path = std::env::temp_dir().join(format!("wuwatool-backup-test-{}.json", std::process::id()));
        let contents = r#"{"app":"wuwatool","version":1,"records":[]}"#;
        export_to_file(path.to_str().unwrap(), contents).unwrap();
        assert_eq!(import_from_file(path.to_str().unwrap()).unwrap(), contents);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn import_rejects_file_over_size_limit() {
        let path = std::env::temp_dir().join(format!("wuwatool-backup-test-big-{}.json", std::process::id()));
        std::fs::write(&path, "x").unwrap();
        // 正常小文件在合理上限下可读
        assert_eq!(
            import_from_file_with_limit(path.to_str().unwrap(), 1024).unwrap(),
            "x"
        );
        // 超限拒绝:不把大文件读进内存
        let err = import_from_file_with_limit(path.to_str().unwrap(), 0).unwrap_err();
        assert!(err.contains("过大"));
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn configure_connection_sets_busy_timeout() {
        let conn = Connection::open_in_memory().expect("内存库应可打开");
        configure_connection(&conn).expect("连接配置应成功");

        let timeout_ms: i64 = conn
            .query_row("PRAGMA busy_timeout", [], |row| row.get(0))
            .unwrap();
        assert_eq!(timeout_ms, DB_BUSY_TIMEOUT.as_millis() as i64);
    }
}
