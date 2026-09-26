//! 本地 SQLite 档案存储(D2):表 `pull_records`,唯一索引即去重键,只增不删。
//! 业务合并去重在前端 domain/merge 完成,`INSERT OR IGNORE` 是第二道幂等保险;
//! count 升级(#15 同键取较大值)经 `update_record_counts` 单调 UPDATE。

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
    \"count\"         INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pull_records_dedupe
    ON pull_records (player_id, time, name, quality_level, card_pool_type);
";

/// 单条唤取记录:JSON 字段名与官方 API 返回对齐(D2)。
/// `card_pool_type` 是数字池 code(取本池请求时的 code,与返回体中文池名无关)。
/// `count` = 同秒多抽合并条数(#15),一条 = count 抽;缺省按 1(旧数据/旧备份兼容)。
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
    #[serde(default = "default_count")]
    pub count: i64,
}

fn default_count() -> i64 {
    1
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
    migrate_add_count_column(conn)
}

/// 既有库无损迁移(#15):补 count 列,旧行按默认 1;CREATE TABLE IF NOT EXISTS
/// 不会改既有表,故按列存在性判断后 ALTER(SQLite ≥3.16 支持 pragma_table_info)。
/// 「查列-改表」非原子:极端并发下另一连接可能恰好完成迁移,重复加列按幂等容忍
fn migrate_add_count_column(conn: &Connection) -> rusqlite::Result<()> {
    let has_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('pull_records') WHERE name = 'count'",
        [],
        |row| row.get(0),
    )?;
    if has_count == 0 {
        if let Err(err) = conn.execute_batch(
            "ALTER TABLE pull_records ADD COLUMN \"count\" INTEGER NOT NULL DEFAULT 1;",
        ) {
            if !err.to_string().contains("duplicate column") {
                return Err(err);
            }
        }
    }
    Ok(())
}

/// 单事务批量 INSERT OR IGNORE(D2:崩溃不留半写);返回实际新增行数。
/// count 入库前钳为 ≥1,防止非法数据混入(前端已归一化,此处兜底)
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
             (player_id, card_pool_type, card_pool_id, time, name, quality_level, resource_id, resource_type, \"count\")
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
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
                record.count.max(1),
            ])?;
        }
    }
    tx.commit()?;
    Ok(inserted)
}

/// 单事务按去重键升级 count(只增不减:新值 ≤ 既有为无操作,#15);返回实际升级行数。
/// 与 INSERT OR IGNORE 同为幂等保险:merge 层已取 max,此处 WHERE count < ? 再兜一层
pub fn update_record_counts(
    conn: &Connection,
    player_id: &str,
    records: &[PullRecord],
) -> rusqlite::Result<usize> {
    let tx = conn.unchecked_transaction()?;
    let mut updated = 0;
    {
        let mut stmt = tx.prepare(
            "UPDATE pull_records SET \"count\" = ?1
             WHERE player_id = ?2 AND time = ?3 AND name = ?4
               AND quality_level = ?5 AND card_pool_type = ?6 AND \"count\" < ?1",
        )?;
        for record in records {
            updated += stmt.execute(params![
                record.count.max(1),
                player_id,
                record.time,
                record.name,
                record.quality_level,
                record.card_pool_type,
            ])?;
        }
    }
    tx.commit()?;
    Ok(updated)
}

pub fn load_records(conn: &Connection, player_id: &str) -> rusqlite::Result<Vec<PullRecord>> {
    let mut stmt = conn.prepare(
        "SELECT card_pool_type, card_pool_id, time, name, quality_level, resource_id, resource_type, \"count\"
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
            count: row.get(7)?,
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

/// 按去重键升级既有记录 count(单事务、只增不减),返回实际升级行数(#15)
#[tauri::command(async)]
pub fn db_update_record_counts(
    app: AppHandle,
    player_id: String,
    records: Vec<PullRecord>,
) -> Result<usize, String> {
    let conn = open_db(&app)?;
    update_record_counts(&conn, &player_id, &records)
        .map_err(|e| format!("升级唤取记录抽数失败:{e}"))
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
            count: 1,
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
    fn count_roundtrips_through_insert_and_load() {
        let conn = memory_db();
        let mut merged = record("2025-05-01 10:00:00", "湮灭杖", 2);
        merged.quality_level = 3;
        merged.count = 4; // 同秒多抽合并:一条 = 4 抽
        insert_records(&conn, "106485288", &[merged]).unwrap();

        let loaded = load_records(&conn, "106485288").unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].count, 4);
    }

    #[test]
    fn insert_clamps_non_positive_count_to_one() {
        let conn = memory_db();
        let mut bad = record("2025-05-01 10:00:00", "长离", 1);
        bad.count = 0;
        insert_records(&conn, "106485288", &[bad]).unwrap();
        assert_eq!(load_records(&conn, "106485288").unwrap()[0].count, 1);
    }

    #[test]
    fn update_record_counts_upgrades_monotonically_by_dedupe_key() {
        let conn = memory_db();
        insert_records(&conn, "106485288", &[record("2025-05-01 10:00:00", "湮灭杖", 2)]).unwrap();

        let mut upgrade = record("2025-05-01 10:00:00", "湮灭杖", 2);
        upgrade.count = 3;
        assert_eq!(update_record_counts(&conn, "106485288", &[upgrade.clone()]).unwrap(), 1);
        assert_eq!(load_records(&conn, "106485288").unwrap()[0].count, 3);

        // 新值 ≤ 既有:只增不减,无操作(幂等)
        assert_eq!(update_record_counts(&conn, "106485288", &[upgrade]).unwrap(), 0);
        let mut smaller = record("2025-05-01 10:00:00", "湮灭杖", 2);
        smaller.count = 2;
        assert_eq!(update_record_counts(&conn, "106485288", &[smaller]).unwrap(), 0);
        assert_eq!(load_records(&conn, "106485288").unwrap()[0].count, 3);

        // 键不存在的记录与其他玩家档案不受影响
        assert_eq!(
            update_record_counts(&conn, "106485288", &[record("2024-01-01 00:00:00", "不存在", 1)]).unwrap(),
            0
        );
        assert_eq!(
            update_record_counts(&conn, "42", &[record("2025-05-01 10:00:00", "湮灭杖", 2)]).unwrap(),
            0
        );
    }

    #[test]
    fn migration_adds_count_column_to_legacy_table_with_default_one() {
        let conn = Connection::open_in_memory().unwrap();
        // 旧版 schema(#15 之前):无 count 列,已含历史数据
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
        assert_eq!(loaded[0].count, 1); // 旧行默认 1,无损迁移
        // 迁移后新写入携带 count 正常
        let mut merged = record("2025-05-02 10:00:00", "折枝", 1);
        merged.count = 5;
        insert_records(&conn, "106485288", &[merged]).unwrap();
        assert_eq!(load_records(&conn, "106485288").unwrap()[0].count, 5);
    }

    #[test]
    fn migration_is_idempotent_when_column_already_exists() {
        let conn = memory_db();
        init_schema(&conn).unwrap();
        init_schema(&conn).unwrap(); // 新库重复初始化不报「duplicate column」
        insert_records(&conn, "106485288", &[record("2025-05-01 10:00:00", "长离", 1)]).unwrap();
        assert_eq!(load_records(&conn, "106485288").unwrap()[0].count, 1);
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
        let mut original = record("2025-05-01 10:00:00", "长离", 1);
        original.count = 3;
        let json = serde_json::to_string(&original).unwrap();
        assert!(json.contains("\"cardPoolType\":1"));
        assert!(json.contains("\"qualityLevel\":5"));
        assert!(json.contains("\"cardPoolId\":100074"));
        assert!(json.contains("\"count\":3"));

        let parsed: PullRecord = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, original);
    }

    #[test]
    fn record_json_without_count_defaults_to_one() {
        // 旧前端/旧备份的记录无 count 字段:缺省按 1(#15 兼容)
        let legacy = r#"{"cardPoolType":1,"cardPoolId":100074,"time":"2025-05-01 10:00:00","name":"长离","qualityLevel":5,"resourceId":"21010043","resourceType":"角色"}"#;
        let parsed: PullRecord = serde_json::from_str(legacy).unwrap();
        assert_eq!(parsed.count, 1);
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
