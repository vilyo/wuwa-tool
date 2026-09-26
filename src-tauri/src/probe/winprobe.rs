//! Windows 专属系统探测源:#04 优先级链的自动部分——注册表 Uninstall → MuiCache →
//! 防火墙规则 → Xbox .GamingRoot → 常见路径扫描(research §1.3)。
//! 系统调用全部收进本文件的 `#[cfg(windows)]`;非 Windows(开发机 macOS)一律返回空,
//! 候选生成与筛选逻辑本身在 discovery 以纯函数验证,Windows 真机验证集中在 #14。

use std::path::PathBuf;

use super::DirSource;

#[cfg(windows)]
pub fn system_candidates() -> Vec<(PathBuf, DirSource)> {
    win::system_candidates()
}

#[cfg(not(windows))]
pub fn system_candidates() -> Vec<(PathBuf, DirSource)> {
    // macOS 开发环境:Windows 系统探测源不可用,探测仅剩手动指定路径
    Vec::new()
}

#[cfg(windows)]
mod win {
    use std::fs;
    use std::path::{Path, PathBuf};

    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    use super::super::discovery::{
        app_path_from_firewall_value, common_path_candidates, game_root_from_exe_path,
        gaming_root_relative_path, matching_children, name_matches_game, xbox_candidate,
        EPIC_PARENT, WEGAME_PARENTS,
    };
    use super::super::DirSource;

    const UNINSTALL_PATHS: &[&str] = &[
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    ];
    const MUI_CACHE_PATH: &str =
        r"Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache";
    const FIREWALL_PATH: &str =
        r"SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\FirewallRules";
    /// 防火墙/MuiCache 记录的客户端可执行名(research §1.3 第 2/3 条)
    const SHIPPING_EXE: &str = "client-win64-shipping.exe";
    /// steamapps\common 及其他按子目录名匹配的父目录
    const SCAN_PARENTS: &[&str] = &[
        EPIC_PARENT,
        "Steam\\steamapps\\common",
        "SteamLibrary\\steamapps\\common",
    ];

    pub fn system_candidates() -> Vec<(PathBuf, DirSource)> {
        let mut out = Vec::new();
        out.extend(registry_uninstall_candidates());
        out.extend(mui_cache_candidates());
        out.extend(firewall_candidates());
        // 盘符枚举一次,Xbox .GamingRoot 与常见路径扫描共用(逐盘符 is_dir 的开销不付双倍)
        let drive_roots = drive_roots();
        out.extend(xbox_gaming_root_candidates(&drive_roots));
        out.extend(common_scan_candidates(&drive_roots));
        out
    }

    /// 注册表 Uninstall 项:DisplayName 含 Wuthering/鸣潮的 InstallPath(research §1.3 第 1 条)
    fn registry_uninstall_candidates() -> Vec<(PathBuf, DirSource)> {
        let mut out = Vec::new();
        for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
            for path in UNINSTALL_PATHS {
                let Ok(uninstall) = RegKey::predef(hive).open_subkey_with_flags(path, KEY_READ)
                else {
                    continue;
                };
                for subkey in uninstall.enum_keys().flatten() {
                    let Ok(sub) = uninstall.open_subkey_with_flags(&subkey, KEY_READ) else {
                        continue;
                    };
                    let display: String = sub.get_value("DisplayName").unwrap_or_default();
                    if !name_matches_game(&display) {
                        continue;
                    }
                    let install: String = sub.get_value("InstallPath").unwrap_or_default();
                    let install = install.trim_matches('"').trim_end_matches('\\');
                    if !install.is_empty() {
                        out.push((PathBuf::from(install), DirSource::RegistryUninstall));
                    }
                }
            }
        }
        out
    }

    /// HKCU MuiCache 中 client-win64-shipping.exe 的记录(research §1.3 第 2 条)
    fn mui_cache_candidates() -> Vec<(PathBuf, DirSource)> {
        let mut out = Vec::new();
        let Ok(mui) =
            RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(MUI_CACHE_PATH, KEY_READ)
        else {
            return out;
        };
        for (name, _) in mui.enum_values().flatten() {
            if !name.to_lowercase().contains(SHIPPING_EXE) {
                continue;
            }
            if let Some(root) = game_root_from_exe_path(&name) {
                out.push((PathBuf::from(root), DirSource::MuiCache));
            }
        }
        out
    }

    /// 防火墙规则值中的 App= 路径(research §1.3 第 3 条)
    fn firewall_candidates() -> Vec<(PathBuf, DirSource)> {
        let mut out = Vec::new();
        let Ok(rules) =
            RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey_with_flags(FIREWALL_PATH, KEY_READ)
        else {
            return out;
        };
        for (name, _) in rules.enum_values().flatten() {
            let Ok(raw) = rules.get_value::<String, _>(&name) else {
                continue;
            };
            let Some(app) = app_path_from_firewall_value(&raw) else {
                continue;
            };
            if !name_matches_game(&app) {
                continue;
            }
            if let Some(root) = game_root_from_exe_path(&app) {
                out.push((PathBuf::from(root), DirSource::Firewall));
            }
        }
        out
    }

    /// 盘符枚举:免 API 依赖,逐盘符探测根目录存在性
    fn drive_roots() -> Vec<String> {
        (b'A'..=b'Z')
            .map(|letter| format!("{}:\\", letter as char))
            .filter(|root| Path::new(root).is_dir())
            .collect()
    }

    /// Xbox .GamingRoot 文件(research §1.3 第 4 条);drive_roots 由调用方枚举一次传入
    fn xbox_gaming_root_candidates(drive_roots: &[String]) -> Vec<(PathBuf, DirSource)> {
        let mut out = Vec::new();
        for root in drive_roots {
            let Ok(bytes) = fs::read(Path::new(root).join(".GamingRoot")) else {
                continue;
            };
            let Some(relative) = gaming_root_relative_path(&bytes) else {
                continue;
            };
            if !name_matches_game(&relative) {
                continue;
            }
            out.push((xbox_candidate(root, &relative), DirSource::XboxGamingRoot));
        }
        out
    }

    /// 常见路径扫描:官方启动器/Steam 固定布局 + Epic/WeGame/steamapps\common 父目录
    /// 下按名称匹配子目录(research §1.3 第 5 条;WeGame 无固定前缀结论,按子目录名兜底);
    /// drive_roots 由调用方枚举一次传入
    fn common_scan_candidates(drive_roots: &[String]) -> Vec<(PathBuf, DirSource)> {
        let drives: Vec<char> = drive_roots.iter().filter_map(|root| root.chars().next()).collect();
        let mut out: Vec<(PathBuf, DirSource)> = common_path_candidates(&drives)
            .into_iter()
            .map(|path| (path, DirSource::CommonScan))
            .collect();
        for root in drive_roots {
            let mut parents: Vec<&str> = SCAN_PARENTS.to_vec();
            parents.extend_from_slice(WEGAME_PARENTS);
            for parent_rel in parents {
                let parent = PathBuf::from(format!("{root}{parent_rel}"));
                let Ok(entries) = fs::read_dir(&parent) else {
                    continue;
                };
                let children: Vec<String> = entries
                    .flatten()
                    .filter(|entry| entry.path().is_dir())
                    .map(|entry| entry.file_name().to_string_lossy().into_owned())
                    .collect();
                out.extend(
                    matching_children(&parent, &children)
                        .into_iter()
                        .map(|path| (path, DirSource::CommonScan)),
                );
            }
        }
        out
    }
}
