# 桌面壳选型：Tauri 2

安装包体积被列为硬性优先级（Electron ~100MB 不可接受），且开发/调试必须在 macOS 上完成、仅发布构建在 Windows 机上进行。Tauri 2（Rust 壳 + Web 前端）满足全部约束：macOS 上开发调试、Windows 上 `tauri build` 发布，安装包 ~10MB。

决定：Tauri 2 + TypeScript 前端，Rust 面最小化（日志目录扫描/文件读取 + 官方 HTTP、SQLite 插件装配），业务逻辑全部放在前端。

## Considered Options

- **Electron + Node**：开发最快、生态最熟，但包体 ~100MB 且内存占用高，被体积要求一票否决。
- **WPF/WinUI（C#）**：无法在 macOS 上开发调试，否决。

## Consequences

- 团队首次使用 Tauri，存在学习成本；Rust 侧代码保持薄，复杂逻辑不进 Rust。
- 若未来确需大量 Node 原生生态能力，再评估迁移 Electron（成本高，非到不得已不做）。
