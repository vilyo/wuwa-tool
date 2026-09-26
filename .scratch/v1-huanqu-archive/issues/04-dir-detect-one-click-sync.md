# 04: 目录探测与一键同步

**What to build:** 玩家不再需要粘贴链接：点一下「一键同步」，应用自动探测游戏安装目录、从本地日志提取含鉴权参数的抽卡链接，直接走 #03 的管线完成导入。探测失败时可以手动指定目录并被记住；每种失败都有具体诊断与下一步指引，而不是一句「失败」。

**Blocked by:** 03 全池同步编排与进度。

**Status:** ready-for-agent

- [ ] 目录探测按优先级：注册表 Uninstall 项 → MuiCache → 防火墙规则 → Xbox `.GamingRoot` → 常见路径扫描（官方启动器 / WeGame / Steam / Epic）→ 手动指定（记住选择）；设置中可重新探测（入口在 #13 开放）
- [ ] 同时读取 `Client\Logs\Client.log` 与 KRSDK WebView `debug.log` 两处日志；游戏运行中以共享读成功读取（处理只读 ACL）
- [ ] 新版 XOR 混淆日志：**先原文匹配、失败再按奇字节 ^0xA5 / 偶字节 ^0xEF 解码**的双路径；新旧版本客户端都能提取
- [ ] 提取最新一条唤取 URL 并解析参数，直接交给 #03 管线；顶栏「一键同步」入口可用
- [ ] 失败诊断具体化并各配下一步指引：找不到安装目录 / 日志里没有链接（未打开过唤取记录页）/ 日志被 Engine.ini 关闭 / 日志只读 ACL
- [ ] Rust 提取模块以 fixture 日志文件驱动单元测试：明文旧版、XOR 混淆、多 UID、无 URL、损坏文件
- [ ] macOS 开发环境下探测逻辑以抽象 + fixture 验证；Windows 真机验证集中在 #14

---

来源：spec「User Stories 1–6/9」「Implementation Decisions · 获取管线」；docs/research-2026-09-25-gacha-api.md；ADR-0001（Rust 面最小化）。
