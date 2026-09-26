//! 目录探测与日志提取(#04,D1):纯函数核心(discovery/logscan,fixture 单测)
//! + Windows 系统探测(winprobe,`#[cfg(windows)]`)。
//! macOS 上系统探测源为空,探测编排与日志管线照常可跑;Windows 真机验证集中在 #14。

mod discovery;
mod logscan;
mod winprobe;

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// 失败诊断代码(与前端 src/domain/probe.ts 的 ProbeDiagnosisCode 对齐,文案在前端)
pub const DIAG_NO_GAME_DIR: &str = "no-game-dir";
pub const DIAG_NO_LINK: &str = "no-link";
pub const DIAG_LOG_DISABLED: &str = "log-disabled";
pub const DIAG_LOG_DENIED: &str = "log-denied";

/// 探测来源(序列化为 kebab-case;优先级即 issue #04 顺序,manual 为记住的手动指定)。
/// 非 Windows 平台仅构造 Manual,系统来源变体由 Windows 真机路径使用
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
#[cfg_attr(not(windows), allow(dead_code))]
pub enum DirSource {
    RegistryUninstall,
    MuiCache,
    Firewall,
    XboxGamingRoot,
    CommonScan,
    Manual,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirCandidate {
    pub path: String,
    pub source: DirSource,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirProbeReport {
    pub candidates: Vec<DirCandidate>,
    pub diagnosis: Option<&'static str>,
}

/// 单个日志文件的读取结果
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum LogOutcome {
    #[serde(rename_all = "camelCase")]
    Ok {
        url_count: usize,
        /// "plain"=原文命中,"xor"=XOR 解码后命中,"none"=两路径都无命中(url_count=0)
        decode: &'static str,
    },
    Missing,
    Denied,
    /// 非缺失/非权限的 IO 错误;tag 的 camelCase 会产出 "ioError",须显式改名
    /// 与前端 src/domain/probe.ts 的 'io-error' 对齐(kebab-case,与 no-game-dir 风格一致)
    #[serde(rename = "io-error")]
    IoError,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogFileInfo {
    /// "client"=Client.log,"krsdk"=KRSDKWebView debug.log
    pub kind: &'static str,
    pub path: String,
    pub outcome: LogOutcome,
}

/// 一条唤取链接及其所属 UID(一份日志可能含多个 UID,research §5)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedLink {
    pub player_id: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogProbeResult {
    pub files: Vec<LogFileInfo>,
    /// 按 player_id 去重、按最后出现排序(末位 = 最新);多 UID 选择 UI 在 #05
    pub links: Vec<ExtractedLink>,
    pub diagnosis: Option<&'static str>,
}

/// 收集候选:仅保留像游戏根的目录,按小写路径去重(手动指定不做 OneDrive 过滤)
fn push_candidate(
    candidates: &mut Vec<DirCandidate>,
    seen: &mut HashSet<String>,
    path: PathBuf,
    source: DirSource,
    skip_onedrive: bool,
) {
    if skip_onedrive && discovery::is_onedrive_path(&path) {
        return;
    }
    if !discovery::looks_like_game_dir(&path) {
        return;
    }
    let text = path.to_string_lossy().into_owned();
    if !seen.insert(text.to_lowercase()) {
        return;
    }
    candidates.push(DirCandidate { path: text, source });
}

/// 合并候选:手动指定(记住的选择)若有效排最前——用户显式选择优先于自动源(验收反馈 #5 处置);
/// 自动源按 system_candidates 给出的优先级顺序(注册表 Uninstall → MuiCache → 防火墙 →
/// Xbox .GamingRoot → 常见路径扫描);按小写路径去重,先到先得
fn merge_candidates(manual_dir: Option<String>, system: Vec<(PathBuf, DirSource)>) -> Vec<DirCandidate> {
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();
    if let Some(manual) = manual_dir.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        push_candidate(
            &mut candidates,
            &mut seen,
            PathBuf::from(manual),
            DirSource::Manual,
            false,
        );
    }
    for (path, source) in system {
        push_candidate(&mut candidates, &mut seen, path, source, true);
    }
    candidates
}

/// 目录探测:记住的手动目录若有效排最前(用户显式选择优先),全部无效时给 no-game-dir 诊断
#[tauri::command(async)]
pub fn probe_game_dir(manual_dir: Option<String>) -> DirProbeReport {
    let candidates = merge_candidates(manual_dir, winprobe::system_candidates());
    let diagnosis = (candidates.is_empty()).then_some(DIAG_NO_GAME_DIR);
    DirProbeReport { candidates, diagnosis }
}

/// 读单份日志并提取链接:先原文匹配,失败再 XOR 解码重试(research §1.2 双路径)。
/// std::fs 在 Windows 上以共享模式打开(允许读写删除共享),游戏运行中不锁死;
/// 读取失败按分类返回(缺失/拒绝/IO 错误),不中断另一份日志的读取。
fn read_log(path: &Path) -> (LogOutcome, Vec<String>) {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => {
            let outcome = match error.kind() {
                std::io::ErrorKind::NotFound => LogOutcome::Missing,
                std::io::ErrorKind::PermissionDenied => LogOutcome::Denied,
                _ => LogOutcome::IoError,
            };
            return (outcome, Vec::new());
        }
    };
    let plain_urls = logscan::extract_gacha_urls(&String::from_utf8_lossy(&bytes));
    if !plain_urls.is_empty() {
        return (
            LogOutcome::Ok {
                url_count: plain_urls.len(),
                decode: "plain",
            },
            plain_urls,
        );
    }
    let xor_bytes = logscan::xor_decode(&bytes);
    let decoded = String::from_utf8_lossy(&xor_bytes);
    let xor_urls = logscan::extract_gacha_urls(&decoded);
    // 原文与解码都没命中时 decode="none":未发生任何命中,不得标 "plain" 误导诊断展示
    let decode = if xor_urls.is_empty() { "none" } else { "xor" };
    (
        LogOutcome::Ok {
            url_count: xor_urls.len(),
            decode,
        },
        xor_urls,
    )
}

/// 日志提取:同时读 Client.log 与 KRSDK debug.log 两处(research §1.1),
/// 合并去重为 player_id → 最新链接;失败诊断具体化(无链接/被 Engine.ini 关闭/只读 ACL)
#[tauri::command(async)]
pub fn extract_gacha_links(game_dir: String) -> LogProbeResult {
    let root = PathBuf::from(game_dir.trim());
    let client_path = discovery::client_log_path(&root);
    let krsdk_path = discovery::krsdk_log_path(&root);

    let (client_outcome, client_urls) = read_log(&client_path);
    let (krsdk_outcome, krsdk_urls) = read_log(&krsdk_path);

    // 多 UID 归并取首选来源(research §1.1:Client.log 首选):Client.log 有链接时以它为准,
    // 否则退回 KRSDK debug.log——两份文件各自内部按日志时间序取最新,不做跨文件的时序假设
    let preferred_urls = if client_urls.is_empty() { &krsdk_urls } else { &client_urls };
    let links = logscan::latest_links_by_player(preferred_urls);

    // 日志缺失且 Engine.ini 关闭日志时,给出可操作的关闭诊断(research §1.2)
    let engine_ini_off = std::fs::read(discovery::engine_ini_path(&root))
        .map(|bytes| logscan::engine_ini_disables_logging(&String::from_utf8_lossy(&bytes)))
        .unwrap_or(false);

    let attempts = [
        logscan::FileAttempt {
            found_any_url: !client_urls.is_empty(),
            denied: matches!(client_outcome, LogOutcome::Denied),
        },
        logscan::FileAttempt {
            found_any_url: !krsdk_urls.is_empty(),
            denied: matches!(krsdk_outcome, LogOutcome::Denied),
        },
    ];
    let diagnosis = match logscan::classify_log_diagnosis(&attempts, engine_ini_off) {
        None => None,
        Some(logscan::LogDiagnosis::NoLink) => Some(DIAG_NO_LINK),
        Some(logscan::LogDiagnosis::LogDisabled) => Some(DIAG_LOG_DISABLED),
        Some(logscan::LogDiagnosis::LogDenied) => Some(DIAG_LOG_DENIED),
    };

    let files = vec![
        LogFileInfo {
            kind: "client",
            path: client_path.to_string_lossy().into_owned(),
            outcome: client_outcome,
        },
        LogFileInfo {
            kind: "krsdk",
            path: krsdk_path.to_string_lossy().into_owned(),
            outcome: krsdk_outcome,
        },
    ];

    LogProbeResult {
        files,
        links,
        diagnosis,
    }
}

/// 用户手动选择的单份日志文件的解析结果(手动粘贴的补充入口):
/// 任意路径、不要求游戏目录布局;outcome 供前端给具体指引,links 已按 player_id 归并
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileLinkResult {
    pub path: String,
    pub outcome: LogOutcome,
    pub links: Vec<ExtractedLink>,
}

/// 解析用户选择的单份日志文件(拷贝出来的 Client.log / KRSDK debug.log 等):
/// 与 extract_gacha_links 共用 read_log 的双路径(原文匹配→XOR 解码)与多 UID 归并;
/// 失败诊断不在此分类(没有游戏目录上下文,Engine.ini 检查无从谈起),由前端按 outcome 给指引
#[tauri::command(async)]
pub fn extract_links_from_file(path: String) -> FileLinkResult {
    let file = PathBuf::from(path.trim());
    let (outcome, urls) = read_log(&file);
    let links = logscan::latest_links_by_player(&urls);
    FileLinkResult {
        path: file.to_string_lossy().into_owned(),
        outcome,
        links,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::probe::DirSource;

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("wuwatool_probe_cmd_{}_{tag}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("应能创建临时目录");
        dir
    }

    fn make_game_dir(tag: &str) -> PathBuf {
        let dir = temp_root(tag);
        std::fs::create_dir_all(dir.join("Client/Saved/Logs")).expect("应能建日志目录");
        dir
    }

    #[test]
    #[cfg(not(windows))]
    fn probe_without_sources_yields_no_game_dir_diagnosis() {
        let report = probe_game_dir(None);
        assert!(report.candidates.is_empty());
        assert_eq!(report.diagnosis, Some(DIAG_NO_GAME_DIR));
    }

    #[test]
    #[cfg(not(windows))]
    fn probe_keeps_valid_manual_dir_as_first_priority_source() {
        let dir = make_game_dir("manual");
        let report = probe_game_dir(Some(dir.to_string_lossy().into_owned()));
        assert_eq!(report.diagnosis, None);
        assert_eq!(report.candidates.len(), 1);
        assert_eq!(report.candidates[0].source, DirSource::Manual);
        assert_eq!(report.candidates[0].path, dir.to_string_lossy());
    }

    #[test]
    fn merged_candidates_put_valid_manual_before_system_sources() {
        // 验收反馈 #5:记住的手动目录若有效,探测时排最前(用户显式选择优先于自动源)
        let manual = make_game_dir("manual_first");
        let system = make_game_dir("system_source");
        let candidates = merge_candidates(
            Some(manual.to_string_lossy().into_owned()),
            vec![(system.clone(), DirSource::RegistryUninstall)],
        );
        assert_eq!(candidates.len(), 2);
        assert_eq!(candidates[0].source, DirSource::Manual);
        assert_eq!(candidates[0].path, manual.to_string_lossy());
        assert_eq!(candidates[1].source, DirSource::RegistryUninstall);
        assert_eq!(candidates[1].path, system.to_string_lossy());

        // 手动目录无效(不像游戏根)时回落到自动源
        let gone = temp_root("gone");
        let candidates = merge_candidates(
            Some(gone.to_string_lossy().into_owned()),
            vec![(system, DirSource::RegistryUninstall)],
        );
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].source, DirSource::RegistryUninstall);
    }

    #[test]
    fn probe_rejects_directory_without_client_layout() {
        let dir = temp_root("notgame");
        let report = probe_game_dir(Some(dir.to_string_lossy().into_owned()));
        assert!(report.candidates.is_empty());
        assert_eq!(report.diagnosis, Some(DIAG_NO_GAME_DIR));

        // 空白与带引号的手动输入按无效处理
        let report = probe_game_dir(Some("   ".to_string()));
        assert!(report.candidates.is_empty());
    }

    #[test]
    fn log_outcome_serialization_matches_frontend_contract() {
        // 验收反馈 #2:tag 与前端 src/domain/probe.ts 的 LogReadOutcome 逐字对齐
        // (camelCase 的 tag 会把 IoError 产出为 "ioError",须显式改名 kebab-case)
        assert_eq!(
            serde_json::to_value(LogOutcome::IoError).unwrap(),
            serde_json::json!({ "type": "io-error" })
        );
        assert_eq!(
            serde_json::to_value(LogOutcome::Missing).unwrap(),
            serde_json::json!({ "type": "missing" })
        );
        assert_eq!(
            serde_json::to_value(LogOutcome::Ok { url_count: 2, decode: "xor" }).unwrap(),
            serde_json::json!({ "type": "ok", "urlCount": 2, "decode": "xor" })
        );
    }

    #[test]
    fn extract_reads_both_logs_and_merges_multi_uid_links() {
        let dir = make_game_dir("multi");
        let client_log = dir.join("Client/Saved/Logs/Client.log");
        std::fs::write(&client_log, include_str!("fixtures/multi_uid.log")).unwrap();
        let krsdk_log = discovery::krsdk_log_path(&dir);
        std::fs::create_dir_all(krsdk_log.parent().unwrap()).unwrap();
        std::fs::write(&krsdk_log, include_str!("fixtures/debug_krsdk.log")).unwrap();

        let result = extract_gacha_links(dir.to_string_lossy().into_owned());
        assert_eq!(result.diagnosis, None);
        assert_eq!(result.files.len(), 2);
        assert_eq!(result.files[0].kind, "client");
        assert_eq!(result.files[1].kind, "krsdk");
        // 两处日志共 4 条 URL,归并后 2 个 UID;末位为最新(客户端日志最后一条)
        assert_eq!(result.links.len(), 2);
        assert_eq!(result.links[0].player_id, "882210234");
        assert_eq!(result.links[1].player_id, "106485288");
        assert!(result.links[1].url.contains("record_id=new222222"));
    }

    #[test]
    fn extract_decodes_xor_client_log() {
        let dir = make_game_dir("xor");
        std::fs::write(
            dir.join("Client/Saved/Logs/Client.log"),
            include_bytes!("fixtures/client_xor.log"),
        )
        .unwrap();

        let result = extract_gacha_links(dir.to_string_lossy().into_owned());
        assert_eq!(result.diagnosis, None);
        assert_eq!(result.links.len(), 1);
        assert!(result.links[0].url.contains("record_id=9f2c77aa"));
        match &result.files[0].outcome {
            LogOutcome::Ok { url_count, decode } => {
                assert_eq!(*url_count, 1);
                assert_eq!(*decode, "xor");
            }
            other => panic!("应命中 XOR 解码路径,实际 {other:?}"),
        }
    }

    #[test]
    fn extract_diagnoses_missing_logs_and_disabled_logging() {
        let dir = make_game_dir("nolink");
        std::fs::write(
            dir.join("Client/Saved/Logs/Client.log"),
            include_str!("fixtures/no_url.log"),
        )
        .unwrap();

        // 日志可读但无链接:引导打开唤取记录页
        let result = extract_gacha_links(dir.to_string_lossy().into_owned());
        assert!(result.links.is_empty());
        assert_eq!(result.diagnosis, Some(DIAG_NO_LINK));

        // 日志在但无链接 + Engine.ini 关闭:关闭诊断优先于无链接
        // (Global=off 时 UE 仍会创建/截断 Client.log,归为无链接会让用户陷入死循环)
        std::fs::create_dir_all(discovery::engine_ini_path(&dir).parent().unwrap()).unwrap();
        std::fs::write(discovery::engine_ini_path(&dir), "[Core.Log]\nGlobal=off\n").unwrap();
        let result = extract_gacha_links(dir.to_string_lossy().into_owned());
        assert!(result.links.is_empty());
        assert_eq!(result.diagnosis, Some(DIAG_LOG_DISABLED));
        match &result.files[0].outcome {
            LogOutcome::Ok { url_count, decode } => {
                assert_eq!(*url_count, 0);
                assert_eq!(*decode, "none");
            }
            other => panic!("可读但无链接应为 Ok(0, none),实际 {other:?}"),
        }

        // Client.log 缺失 + Engine.ini 关闭:同样给关闭诊断
        std::fs::remove_file(dir.join("Client/Saved/Logs/Client.log")).unwrap();
        let result = extract_gacha_links(dir.to_string_lossy().into_owned());
        assert!(result.links.is_empty());
        assert_eq!(result.diagnosis, Some(DIAG_LOG_DISABLED));
        match &result.files[0].outcome {
            LogOutcome::Missing => {}
            other => panic!("Client.log 应为缺失,实际 {other:?}"),
        }
    }

    #[test]
    #[cfg(unix)]
    fn extract_diagnoses_read_denied_log_as_acl() {
        use std::os::unix::fs::PermissionsExt;

        let dir = make_game_dir("denied");
        let client_log = dir.join("Client/Saved/Logs/Client.log");
        std::fs::write(&client_log, include_str!("fixtures/client_plain.log")).unwrap();
        std::fs::set_permissions(&client_log, std::fs::Permissions::from_mode(0o000)).unwrap();

        let result = extract_gacha_links(dir.to_string_lossy().into_owned());
        assert!(result.links.is_empty());
        assert_eq!(result.diagnosis, Some(DIAG_LOG_DENIED));
        std::fs::set_permissions(&client_log, std::fs::Permissions::from_mode(0o644)).unwrap();
    }

    #[test]
    fn extract_on_directory_without_logs_reports_missing() {
        let dir = make_game_dir("missing");
        let result = extract_gacha_links(dir.to_string_lossy().into_owned());
        assert!(result.links.is_empty());
        assert_eq!(result.diagnosis, Some(DIAG_NO_LINK));
        assert!(matches!(result.files[0].outcome, LogOutcome::Missing));
        assert!(matches!(result.files[1].outcome, LogOutcome::Missing));
    }

    #[test]
    fn parse_picked_file_extracts_plain_log_without_game_layout() {
        // 任意路径的日志拷贝:不要求 Client/Saved/Logs 布局,多 UID 照常归并
        let dir = temp_root("picked_plain");
        let file = dir.join("copied-Client.log");
        std::fs::write(&file, include_str!("fixtures/multi_uid.log")).unwrap();

        let result = extract_links_from_file(file.to_string_lossy().into_owned());
        assert_eq!(result.path, file.to_string_lossy());
        assert_eq!(result.links.len(), 2);
        assert_eq!(result.links[0].player_id, "882210234");
        assert_eq!(result.links[1].player_id, "106485288");
        match &result.outcome {
            LogOutcome::Ok { url_count, decode } => {
                assert_eq!(*url_count, 3);
                assert_eq!(*decode, "plain");
            }
            other => panic!("应命中原文直读路径,实际 {other:?}"),
        }
    }

    #[test]
    fn parse_picked_xor_file_decodes_without_game_layout() {
        let dir = temp_root("picked_xor");
        let file = dir.join("debug.log");
        std::fs::write(&file, include_bytes!("fixtures/client_xor.log")).unwrap();

        let result = extract_links_from_file(file.to_string_lossy().into_owned());
        assert_eq!(result.links.len(), 1);
        assert!(result.links[0].url.contains("record_id=9f2c77aa"));
        match &result.outcome {
            LogOutcome::Ok { url_count, decode } => {
                assert_eq!(*url_count, 1);
                assert_eq!(*decode, "xor");
            }
            other => panic!("应命中 XOR 解码路径,实际 {other:?}"),
        }
    }

    #[test]
    fn parse_picked_file_reports_missing_and_io_error_outcomes() {
        let dir = temp_root("picked_fail");
        // 不存在的路径:缺失而不是诊断分类(指引由前端按 outcome 给)
        let result = extract_links_from_file(dir.join("gone.log").to_string_lossy().into_owned());
        assert!(result.links.is_empty());
        assert!(matches!(result.outcome, LogOutcome::Missing));

        // 目录路径当文件读:落入非缺失/非权限的 IO 错误分支
        let result = extract_links_from_file(dir.to_string_lossy().into_owned());
        assert!(matches!(result.outcome, LogOutcome::IoError));
    }

    #[test]
    fn parse_picked_file_without_urls_yields_ok_zero_links() {
        let dir = temp_root("picked_nolink");
        let file = dir.join("Client.log");
        std::fs::write(&file, include_str!("fixtures/no_url.log")).unwrap();

        let result = extract_links_from_file(file.to_string_lossy().into_owned());
        assert!(result.links.is_empty());
        match &result.outcome {
            LogOutcome::Ok { url_count, decode } => {
                assert_eq!(*url_count, 0);
                assert_eq!(*decode, "none");
            }
            other => panic!("可读但无链接应为 Ok(0, none),实际 {other:?}"),
        }
    }
}
