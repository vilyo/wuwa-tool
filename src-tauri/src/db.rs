//! 本地 SQLite 档案存储(D2):表 `pull_records`,唯一索引即去重键,只增不删。
//! 业务合并去重在前端 domain/merge 完成,`INSERT OR IGNORE` 是第二道幂等保险。

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
    resource_type  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pull_records_dedupe
    ON pull_records (player_id, time, name, quality_level, card_pool_type);
";

/// 单条唤取记录:JSON 字段名与官方 API 返回对齐(D2)。
/// `card_pool_type` 是数字池 code(取本池请求时的 code,与返回体中文池名无关)。
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
    conn.execute_batch(SCHEMA_SQL)
}

/// 单事务批量 INSERT OR IGNORE(D2:崩溃不留半写);返回实际新增行数
pub fn insert_records(
    conn: &Connection,
    player_id: &str,
    records: &[PullRecord],
) -> rusqlite::Result<usize> {
    let tx = conn.unchecked_transaction()?;
    let mut inserted = 0;
    {
        let mut stmt = tx.prepare(
            "INSERT OR IGNORE INTO pull_records
             (player_id, card_pool_type, card_pool_id, time, name, quality_level, resource_id, resource_type)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )?;
        for record in records {
            inserted += stmt.execute(params![
                player_id,
                record.card_pool_type,
                record.card_pool_id,
                record.time,
                record.name,
                record.quality_level,
                record.resource_id,
                record.resource_type,
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

/// 批量写入唤取记录(单事务 INSERT OR IGNORE),返回实际新增行数
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
    fn insert_is_idempotent_and_counts_added_rows() {
        let conn = memory_db();
        let records = vec![
            record("2025-05-01 10:00:00", "长离", 1),
            record("2025-05-02 11:30:00", "折枝", 1),
        ];

        assert_eq!(insert_records(&conn, "106485288", &records).unwrap(), 2);
        // 同一批再写:全部被唯一索引忽略,只增不减
        assert_eq!(insert_records(&conn, "106485288", &records).unwrap(), 0);
        let loaded = load_records(&conn, "106485288").unwrap();
        assert_eq!(loaded.len(), 2);
    }

    #[test]
    fn dedupe_key_ignores_card_pool_id_but_respects_pool_code_and_player() {
        let conn = memory_db();
        insert_records(&conn, "106485288", &[record("2025-05-01 10:00:00", "长离", 1)]).unwrap();

        // 唯一索引不含 card_pool_id:同键不同 gacha_id 仍判重复
        let mut same_key = record("2025-05-01 10:00:00", "长离", 1);
        same_key.card_pool_id = Some(999999);
        assert_eq!(insert_records(&conn, "106485288", &[same_key]).unwrap(), 0);

        // 不同池 code 不算重复
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
    fn configure_connection_sets_busy_timeout() {
        let conn = Connection::open_in_memory().expect("内存库应可打开");
        configure_connection(&conn).expect("连接配置应成功");

        let timeout_ms: i64 = conn
            .query_row("PRAGMA busy_timeout", [], |row| row.get(0))
            .unwrap();
        assert_eq!(timeout_ms, DB_BUSY_TIMEOUT.as_millis() as i64);
    }
}
