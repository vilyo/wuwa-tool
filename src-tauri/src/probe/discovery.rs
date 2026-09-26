//! 目录候选生成与路径推理(纯函数核心,跨平台可测)。
//! Windows 专属的系统调用在 winprobe;本文件只做路径拼接、候选筛选与文件系统存在性判断。

use std::path::{Path, PathBuf};

/// Epic 固定安装父目录(目录名带渠道哈希后缀,如 WutheringWavesj3oFh...,按名称匹配子目录)
#[cfg_attr(not(windows), allow(dead_code))]
pub const EPIC_PARENT: &str = "Program Files\\Epic Games";
/// WeGame 安装父目录(社区无固定前缀结论,research §1.3,按子目录名匹配兜底)
#[cfg_attr(not(windows), allow(dead_code))]
pub const WEGAME_PARENTS: &[&str] = &["WeGame\\games", "WeGame"];

/// 游戏安装根判定:含 Client\Binaries\Win64(PC 端结构)或 Client\Saved\Logs(运行过即有)
pub fn looks_like_game_dir(dir: &Path) -> bool {
    dir.join("Client").join("Binaries").join("Win64").is_dir()
        || dir.join("Client").join("Saved").join("Logs").is_dir()
}

/// UE 主日志(research §1.1 首选来源)
pub fn client_log_path(root: &Path) -> PathBuf {
    root.join("Client").join("Saved").join("Logs").join("Client.log")
}

/// KRSDK WebView 调试日志(目录名虽含 Global,国服/国际服安装中均存在,research §1.1)
pub fn krsdk_log_path(root: &Path) -> PathBuf {
    root.join("Client")
        .join("Binaries")
        .join("Win64")
        .join("ThirdParty")
        .join("KrPcSdk_Global")
        .join("KRSDKRes")
        .join("KRSDKWebView")
        .join("debug.log")
}

/// 引擎配置(日志可能被 [Core.Log] Global=off 关闭,research §1.2)
pub fn engine_ini_path(root: &Path) -> PathBuf {
    root.join("Client")
        .join("Saved")
        .join("Config")
        .join("WindowsNoEditor")
        .join("Engine.ini")
}

/// 名称匹配:官方英文/中文名,大小写不敏感(注册表 DisplayName、目录名、防火墙路径通用)
pub fn name_matches_game(text: &str) -> bool {
    text.to_lowercase().contains("wuthering") || text.contains("鸣潮")
}

/// 常见路径扫描候选(research §1.3):官方启动器与 Steam 固定布局,传入存在的盘符
#[cfg_attr(not(windows), allow(dead_code))]
pub fn common_path_candidates(drives: &[char]) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for drive in drives {
        let root = format!("{drive}:\\");
        // 官方启动器
        out.push(PathBuf::from(format!("{root}Wuthering Waves Game")));
        out.push(PathBuf::from(format!(
            "{root}Wuthering Waves\\Wuthering Waves Game"
        )));
        // Steam(含常见库目录变体)
        for steam in ["Steam", "SteamLibrary", "Program Files (x86)\\Steam"] {
            out.push(PathBuf::from(format!(
                "{root}{steam}\\steamapps\\common\\Wuthering Waves"
            )));
        }
    }
    out
}

/// 父目录下按名称匹配游戏子目录(Epic 带哈希后缀、WeGame/steamapps\common 变体通用)
#[cfg_attr(not(windows), allow(dead_code))]
pub fn matching_children(parent: &Path, children: &[String]) -> Vec<PathBuf> {
    children
        .iter()
        .filter(|name| name_matches_game(name))
        .map(|name| parent.join(name))
        .collect()
}

/// 含 OneDrive 的路径跳过(research §1.3:同步目录会造成误报)
pub fn is_onedrive_path(path: &Path) -> bool {
    path.to_string_lossy().to_lowercase().contains("onedrive")
}

/// 从可执行文件完整路径推导游戏根(MuiCache/防火墙记录形如
/// ...\Client\Binaries\Win64\client-win64-shipping.exe,research §1.3 第 2/3 条)。
/// 匹配用 ASCII 大小写无关的窗口比较,返回原串切片:不能按 to_lowercase 的索引切原串——
/// to_lowercase 是全 Unicode 映射,个别字符(如 İ U+0130)小写化改变字节长度,索引错位会切错或 panic
#[cfg_attr(not(windows), allow(dead_code))]
pub fn game_root_from_exe_path(exe: &str) -> Option<String> {
    const MARKER: &[u8] = b"\\client\\binaries\\win64";
    exe.as_bytes()
        .windows(MARKER.len())
        .position(|window| window.eq_ignore_ascii_case(MARKER))
        .map(|index| exe[..index].to_string())
}

/// 防火墙规则值中提取 App= 路径(值形如 v2.30|Action=Allow|...|App=C:\...\x.exe|...)
#[cfg_attr(not(windows), allow(dead_code))]
pub fn app_path_from_firewall_value(value: &str) -> Option<String> {
    value
        .split('|')
        .find_map(|segment| segment.strip_prefix("App="))
        .map(str::trim)
        .filter(|app| !app.is_empty())
        .map(str::to_string)
}

/// Xbox .GamingRoot 文件内容解析:4 字节头 + NUL 结尾的相对路径(如 "\Wuthering Waves")
#[cfg_attr(not(windows), allow(dead_code))]
pub fn gaming_root_relative_path(bytes: &[u8]) -> Option<String> {
    let body = bytes.get(4..)?;
    let end = body.iter().position(|&b| b == 0).unwrap_or(body.len());
    let text = String::from_utf8_lossy(&body[..end]).trim().to_string();
    (!text.is_empty()).then_some(text)
}

/// .GamingRoot → 候选根:Xbox 版游戏在 <盘>\<相对路径>\Content 下(research §1.3 第 4 条)。
/// drive_root 形如 "D:\"(自带结尾反斜杠),relative 形如 "\Wuthering Waves"
#[cfg_attr(not(windows), allow(dead_code))]
pub fn xbox_candidate(drive_root: &str, relative: &str) -> PathBuf {
    let rel = relative.trim_start_matches('\\').trim_end_matches('\\');
    PathBuf::from(format!("{drive_root}{rel}\\Content"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("wuwatool_probe_disc_{}_{tag}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("应能创建临时目录");
        dir
    }

    #[test]
    fn game_dir_detected_by_binaries_or_logs_layout() {
        let with_logs = temp_root("logs");
        std::fs::create_dir_all(with_logs.join("Client/Saved/Logs")).unwrap();
        assert!(looks_like_game_dir(&with_logs));

        let with_binaries = temp_root("bin");
        std::fs::create_dir_all(with_binaries.join("Client/Binaries/Win64")).unwrap();
        assert!(looks_like_game_dir(&with_binaries));

        // Xbox 版:Client 在 Content 之下,根指向 Content 时同样命中
        let xbox = temp_root("xbox");
        std::fs::create_dir_all(xbox.join("Wuthering Waves/Content/Client/Binaries/Win64")).unwrap();
        assert!(looks_like_game_dir(&xbox.join("Wuthering Waves").join("Content")));

        let empty = temp_root("empty");
        assert!(!looks_like_game_dir(&empty));
    }

    #[test]
    fn log_paths_match_research_layout() {
        // 断言相对结构而非分隔符(Path::join 在 macOS 用 /、Windows 用 \)
        let root = Path::new(r"C:\Wuthering Waves Game");
        assert!(client_log_path(root).ends_with("Client/Saved/Logs/Client.log"));
        assert!(krsdk_log_path(root).ends_with(
            "Client/Binaries/Win64/ThirdParty/KrPcSdk_Global/KRSDKRes/KRSDKWebView/debug.log"
        ));
        assert!(engine_ini_path(root).ends_with("Client/Saved/Config/WindowsNoEditor/Engine.ini"));
    }

    #[test]
    fn name_matches_english_chinese_and_case_insensitive() {
        assert!(name_matches_game("Wuthering Waves"));
        assert!(name_matches_game("wuthering waves game"));
        assert!(name_matches_game("鸣潮"));
        assert!(name_matches_game("Epic Games\\WutheringWavesj3oFh"));
        assert!(!name_matches_game("Genshin Impact"));
        assert!(!name_matches_game(""));
    }

    #[test]
    fn common_candidates_cover_official_and_steam_layouts() {
        let candidates = common_path_candidates(&['C', 'D']);
        let paths: Vec<String> = candidates.iter().map(|p| p.to_string_lossy().into_owned()).collect();
        assert_eq!(candidates.len(), 10);
        assert!(paths.contains(&r"C:\Wuthering Waves Game".to_string()));
        assert!(paths.contains(&r"C:\Wuthering Waves\Wuthering Waves Game".to_string()));
        assert!(paths.contains(&r"D:\Steam\steamapps\common\Wuthering Waves".to_string()));
        assert!(paths.contains(&r"D:\SteamLibrary\steamapps\common\Wuthering Waves".to_string()));
        assert!(paths.contains(&r"C:\Program Files (x86)\Steam\steamapps\common\Wuthering Waves".to_string()));
    }

    #[test]
    fn matching_children_filters_by_game_name() {
        let parent = PathBuf::from(r"D:\Program Files\Epic Games");
        let children = vec![
            "WutheringWavesj3oFh".to_string(),
            "Fortnite".to_string(),
            "鸣潮".to_string(),
        ];
        let matched = matching_children(&parent, &children);
        assert_eq!(matched.len(), 2);
        assert_eq!(matched[0], parent.join("WutheringWavesj3oFh"));
        assert_eq!(matched[1], parent.join("鸣潮"));
    }

    #[test]
    fn onedrive_paths_are_flagged() {
        assert!(is_onedrive_path(Path::new(r"C:\Users\a\OneDrive\Wuthering Waves Game")));
        assert!(!is_onedrive_path(Path::new(r"D:\Wuthering Waves Game")));
    }

    #[test]
    fn exe_path_reduces_to_game_root_case_insensitive() {
        let exe = r"C:\Wuthering Waves Game\Client\Binaries\Win64\client-win64-shipping.exe.FriendlyAppName";
        assert_eq!(
            game_root_from_exe_path(exe).as_deref(),
            Some(r"C:\Wuthering Waves Game")
        );
        // 大小写混合的 Client 路径同样可推导
        assert_eq!(
            game_root_from_exe_path(r"D:\Game\client\binaries\win64\client-win64-shipping.exe").as_deref(),
            Some(r"D:\Game")
        );
        assert!(game_root_from_exe_path(r"C:\Tools\editor.exe").is_none());
    }

    #[test]
    fn exe_path_with_multibyte_directory_does_not_misalign() {
        // İ(U+0130)小写化后字节变长(2→3),按小写索引切原串会切进多字节字符内部(panic/切错);
        // ASCII 窗口比较不受影响,且返回原串大小写
        let exe = "D:\\İ鸣潮\\Client\\Binaries\\Win64\\client-win64-shipping.exe";
        assert_eq!(game_root_from_exe_path(exe).as_deref(), Some("D:\\İ鸣潮"));
    }

    #[test]
    fn firewall_value_extracts_app_segment() {
        let value = r"v2.30|Action=Allow|Active=TRUE|Dir=In|App=C:\Wuthering Waves Game\Client\Binaries\Win64\client-win64-shipping.exe|Name=Wuthering Waves|";
        assert_eq!(
            app_path_from_firewall_value(value).as_deref(),
            Some(r"C:\Wuthering Waves Game\Client\Binaries\Win64\client-win64-shipping.exe")
        );
        assert!(app_path_from_firewall_value("v2.30|Action=Allow|Name=x").is_none());
        assert!(app_path_from_firewall_value("App=|Name=x").is_none());
    }

    #[test]
    fn gaming_root_content_parses_relative_path() {
        // 4 字节头 + "\Wuthering Waves\0"
        let mut bytes = vec![0x01, 0x00, 0x00, 0x00];
        bytes.extend_from_slice("\\Wuthering Waves\0".as_bytes());
        assert_eq!(gaming_root_relative_path(&bytes).as_deref(), Some("\\Wuthering Waves"));
        assert!(gaming_root_relative_path(&[0x01, 0x00, 0x00]).is_none());
        assert!(gaming_root_relative_path(&[0x01, 0x00, 0x00, 0x00, 0x00]).is_none());
    }

    #[test]
    fn xbox_candidate_points_at_content_root() {
        let candidate = xbox_candidate("D:\\", "\\Wuthering Waves");
        assert_eq!(candidate, PathBuf::from(r"D:\Wuthering Waves\Content"));
        // 该断言仅验证路径拼接;目录不存在的存在性判定在 game_dir_detected_* 中覆盖
        assert!(!looks_like_game_dir(&candidate));
    }
}
