//! 日志扫描纯函数:XOR 解码、唤取链接提取、多 UID 归并、失败诊断分类。
//! 输入一律为字节/字符串,以 fixtures/ 下的样本日志驱动单测(research §1.2/§1.4)。

use super::ExtractedLink;

/// 唤取链接公共前缀(国服/国际服一致,research §1.4)
pub const GACHA_URL_PREFIX: &str = "https://aki-gm-resources";

/// 新版 Client.log 的 XOR 混淆解码:奇数字节 ^0xA5、偶数字节 ^0xEF
/// (research §1.2,多工具逐字节一致;该变换非自逆,只能用于解码混淆内容)
pub fn xor_decode(bytes: &[u8]) -> Vec<u8> {
    bytes
        .iter()
        .map(|&b| if b & 1 == 1 { b ^ 0xA5 } else { b ^ 0xEF })
        .collect()
}

/// 链接终结字符:引号/空白/控制字符/HTML 括号(与社区正则 `[^"\s]*` 同界,
/// 额外排除 `'<>`;`\u0026` 转义的反斜杠是链接内部字符,不终结)
fn is_url_terminator(c: char) -> bool {
    matches!(c, '"' | '\'' | '<' | '>' | '`') || c.is_whitespace() || c.is_control()
}

/// 提取日志全文中的全部唤取链接(research §1.4 正则的手工扫描实现,免 regex 依赖;
/// 出现顺序即日志时间顺序,后者更新)
pub fn extract_gacha_urls(text: &str) -> Vec<String> {
    let mut urls = Vec::new();
    let mut from = 0;
    while let Some(offset) = text[from..].find(GACHA_URL_PREFIX) {
        let start = from + offset;
        let rest = &text[start..];
        // 须为真实域名分段(.aki-game.com/.net,或 -oversea 变体,research §1.4),
        // 排除恰好同前缀的无关文本
        let domain_segment = &rest[GACHA_URL_PREFIX.len()..];
        let is_game_domain = domain_segment.starts_with(".aki-game.")
            || domain_segment.starts_with("-oversea.aki-game.");
        if !is_game_domain {
            from = start + GACHA_URL_PREFIX.len();
            continue;
        }
        let len: usize = rest
            .chars()
            .take_while(|c| !is_url_terminator(*c))
            .map(char::len_utf8)
            .sum();
        urls.push(rest[..len].to_string());
        from = start + len;
    }
    urls
}

/// 从链接中取 player_id 参数值(遇 `&`、`\u0026` 的反斜杠、引号或空白即止)
pub fn player_id_from_url(url: &str) -> Option<String> {
    let rest = &url[url.find("player_id=")? + "player_id=".len()..];
    let end = rest.find(|c: char| matches!(c, '&' | '\\' | '"' | '\'') || c.is_whitespace());
    let value = match end {
        Some(index) => &rest[..index],
        None => rest,
    };
    (!value.is_empty()).then(|| value.to_string())
}

/// 单个日志文件的尝试摘要(诊断分类的输入;缺失与否由 mod 层的 LogOutcome::Missing
/// 直接序列化展示,不再参与分类)
pub struct FileAttempt {
    pub found_any_url: bool,
    pub denied: bool,
}

/// 日志失败诊断(纯分类,与 UI 文案解耦;前端按 code 给下一步指引)
#[derive(Debug, PartialEq, Eq)]
pub enum LogDiagnosis {
    /// 日志可读但没有任何链接:未在游戏内打开过唤取记录页
    NoLink,
    /// 日志被 Engine.ini 的 [Core.Log] Global=off 关闭
    LogDisabled,
    /// 日志只读 ACL,拒绝读取
    LogDenied,
}

/// 失败诊断分类(research §1.2 故障模式):任一文件有链接即成功;
/// 拒绝读取优先(此时无从判断内容);其次 Engine.ini 关日志——Global=off 的典型症状正是
/// "日志文件在但没有任何链接"(UE 仍会创建/截断 Client.log),若归为无链接会让用户
/// 反复打开唤取记录页陷入死循环;其余归为无链接
pub fn classify_log_diagnosis(attempts: &[FileAttempt], engine_ini_off: bool) -> Option<LogDiagnosis> {
    if attempts.iter().any(|a| a.found_any_url) {
        return None;
    }
    if attempts.iter().any(|a| a.denied) {
        return Some(LogDiagnosis::LogDenied);
    }
    if engine_ini_off {
        return Some(LogDiagnosis::LogDisabled);
    }
    Some(LogDiagnosis::NoLink)
}

/// Engine.ini 是否关闭日志:仅识别 [Core.Log] 节内的 Global=off(大小写与空格不敏感)
pub fn engine_ini_disables_logging(content: &str) -> bool {
    let mut in_core_log = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_core_log =
                trimmed.eq_ignore_ascii_case("[Core.Log]") || trimmed.eq_ignore_ascii_case("[CoreLog]");
            continue;
        }
        if in_core_log {
            let compact: String = trimmed.chars().filter(|c| !c.is_whitespace()).collect();
            if compact.to_lowercase().starts_with("global=off") {
                return true;
            }
        }
    }
    false
}

/// 多 UID 归并:一份日志可能含多个 UID 的链接(research §5),按 player_id 建映射,
/// 同一 UID 取最后一次出现的链接(日志按时间追加,后者更新),
/// 结果按最后一次出现顺序排列——末位即全局最新一条(research §1.4 取最后一条)
pub fn latest_links_by_player(urls: &[String]) -> Vec<ExtractedLink> {
    use std::collections::HashMap;

    let mut latest: HashMap<String, (usize, &str)> = HashMap::new();
    for (index, url) in urls.iter().enumerate() {
        if let Some(player_id) = player_id_from_url(url) {
            latest.insert(player_id, (index, url.as_str()));
        }
    }
    let mut entries: Vec<(usize, String, &str)> = latest
        .into_iter()
        .map(|(player_id, (index, url))| (index, player_id, url))
        .collect();
    entries.sort_by_key(|(index, _, _)| *index);
    entries
        .into_iter()
        .map(|(_, player_id, url)| ExtractedLink {
            player_id,
            url: url.to_string(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xor_decode_follows_parity_key() {
        // 'h'=0x68(偶)→ ^0xEF=0x87;'1'=0x31(奇)→ ^0xA5=0x94
        assert_eq!(xor_decode(&[0x68, 0x31]), vec![0x87, 0x94]);
    }

    #[test]
    fn plain_log_yields_url_and_player_id() {
        let text = include_str!("fixtures/client_plain.log");
        let urls = extract_gacha_urls(text);
        assert_eq!(urls.len(), 1);
        assert!(urls[0].starts_with("https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?"));
        assert!(urls[0].contains("record_id=acdf99a1"));
        assert_eq!(player_id_from_url(&urls[0]).as_deref(), Some("106485288"));

        let links = latest_links_by_player(&urls);
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].player_id, "106485288");
        assert_eq!(links[0].url, urls[0]);
    }

    #[test]
    fn xor_log_is_matched_only_after_decode() {
        let bytes = include_bytes!("fixtures/client_xor.log");
        // 原文直读不命中(混淆生效)
        assert!(extract_gacha_urls(&String::from_utf8_lossy(bytes)).is_empty());
        // 解码后命中(research §1.2 双路径的第二条)
        let xor_bytes = xor_decode(bytes);
        let decoded = String::from_utf8_lossy(&xor_bytes);
        let urls = extract_gacha_urls(&decoded);
        assert_eq!(urls.len(), 1);
        assert!(urls[0].contains("player_id=106485288"));
        assert!(urls[0].contains("record_id=9f2c77aa"));
    }

    #[test]
    fn multi_uid_log_merges_to_latest_per_player_in_last_seen_order() {
        let text = include_str!("fixtures/multi_uid.log");
        let urls = extract_gacha_urls(text);
        assert_eq!(urls.len(), 3);

        let links = latest_links_by_player(&urls);
        assert_eq!(links.len(), 2);
        // 按最后一次出现排序:882210234(第 2 条)在前,106485288(第 3 条,最新)在后
        assert_eq!(links[0].player_id, "882210234");
        assert!(links[0].url.contains("record_id=bb771234"));
        assert_eq!(links[1].player_id, "106485288");
        assert!(links[1].url.contains("record_id=new222222"));
        // 末位即全局最新,一键获取取这一条
        assert_eq!(links.last().map(|l| l.player_id.as_str()), Some("106485288"));
    }

    #[test]
    fn escaped_ampersand_terminates_param_values() {
        let url = r"https://aki-gm-resources-oversea.aki-game.net/aki/gacha/index.html#/record?svr_id=ee5066f9\u0026player_id=882210234\u0026lang=en-US";
        assert_eq!(player_id_from_url(url).as_deref(), Some("882210234"));
    }

    #[test]
    fn player_id_at_url_end_has_no_terminator() {
        let url = "https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?a=1&player_id=999";
        assert_eq!(player_id_from_url(url).as_deref(), Some("999"));
    }

    #[test]
    fn log_without_urls_yields_empty() {
        let text = include_str!("fixtures/no_url.log");
        assert!(extract_gacha_urls(text).is_empty());
        assert!(latest_links_by_player(&[]).is_empty());
    }

    #[test]
    fn corrupted_file_yields_empty_without_panic() {
        let bytes = include_bytes!("fixtures/corrupted.bin");
        // 原文与解码双路径都不应命中,也不应 panic
        assert!(extract_gacha_urls(&String::from_utf8_lossy(bytes)).is_empty());
        let xor_bytes = xor_decode(bytes);
        let decoded = String::from_utf8_lossy(&xor_bytes);
        assert!(extract_gacha_urls(&decoded).is_empty());
    }

    #[test]
    fn krsdk_debug_log_url_is_extracted() {
        let text = include_str!("fixtures/debug_krsdk.log");
        let urls = extract_gacha_urls(text);
        assert_eq!(urls.len(), 1);
        assert!(urls[0].contains("aki-gm-resources-oversea.aki-game.net"));
        assert_eq!(player_id_from_url(&urls[0]).as_deref(), Some("882210234"));
    }

    #[test]
    fn prefix_without_domain_segment_is_ignored() {
        let text = r"see https://aki-gm-resources.example.org/other and https://aki-gm-resources-oversea.aki-game.net/aki/gacha/index.html#/record?player_id=1";
        let urls = extract_gacha_urls(text);
        assert_eq!(urls.len(), 1);
        assert!(urls[0].contains("oversea"));
    }

    #[test]
    fn engine_ini_global_off_is_detected() {
        let off = "[Core.Log]\nGlobal=off\n";
        assert!(engine_ini_disables_logging(off));
        // 空格与大小写不敏感
        assert!(engine_ini_disables_logging("[core.log]\r\nglobal = off\r\n"));
        let off_with_other_keys = "[Core.Log]\nLogConsole=1\nGlobal=off\n";
        assert!(engine_ini_disables_logging(off_with_other_keys));
        // 其他节的 Global=off 不算
        assert!(!engine_ini_disables_logging("[Rendering]\nGlobal=off\n[Core.Log]\nGlobal=Verify\n"));
        assert!(!engine_ini_disables_logging(""));
    }

    fn attempt(found: bool, denied: bool) -> FileAttempt {
        FileAttempt { found_any_url: found, denied }
    }

    #[test]
    fn diagnosis_success_when_any_file_has_urls() {
        let attempts = [attempt(false, false), attempt(true, false)];
        assert_eq!(classify_log_diagnosis(&attempts, true), None);
    }

    #[test]
    fn diagnosis_denied_takes_priority_over_disabled() {
        let attempts = [attempt(false, true), attempt(false, false)];
        assert_eq!(classify_log_diagnosis(&attempts, true), Some(LogDiagnosis::LogDenied));
    }

    #[test]
    fn diagnosis_disabled_when_all_missing_and_engine_ini_off() {
        let attempts = [attempt(false, false), attempt(false, false)];
        assert_eq!(classify_log_diagnosis(&attempts, true), Some(LogDiagnosis::LogDisabled));
        // Engine.ini 未关日志时,缺失归为无链接
        assert_eq!(classify_log_diagnosis(&attempts, false), Some(LogDiagnosis::NoLink));
    }

    #[test]
    fn diagnosis_disabled_takes_priority_over_no_link_when_engine_ini_off() {
        // Global=off 的典型症状:日志文件在但没有链接(UE 仍会创建/截断 Client.log),
        // 须判关闭而非无链接,否则"打开唤取记录页后重试"的指引会让用户陷入死循环
        let readable_without_urls = [attempt(false, false)];
        assert_eq!(
            classify_log_diagnosis(&readable_without_urls, true),
            Some(LogDiagnosis::LogDisabled)
        );
        // 缺失与可读无链接混合,同样判关闭
        let mixed = [attempt(false, false), attempt(false, false)];
        assert_eq!(classify_log_diagnosis(&mixed, true), Some(LogDiagnosis::LogDisabled));
    }

    #[test]
    fn diagnosis_no_link_for_readable_logs_without_urls() {
        let attempts = [attempt(false, false), attempt(false, false)];
        assert_eq!(classify_log_diagnosis(&attempts, false), Some(LogDiagnosis::NoLink));
    }
}
