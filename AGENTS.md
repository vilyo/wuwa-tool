# AGENTS.md

## 项目简介

鸣潮（Wuthering Waves）抽卡统计助手，PC 桌面版。核心功能：

1. 自动通过官方抽卡链接获取用户抽卡记录（从 PC 客户端本地日志中提取含鉴权参数的抽卡 URL，再按卡池拉取记录）。
2. 基于记录生成统计与总结，展示用户的欧非情况（保底进度、歪/不歪、五星平均出货抽数等）。

## 当前状态

- 项目刚起步，工作区暂无任何代码；技术选型已定：Tauri 2 + TypeScript 前端（见 docs/adr/0001）。
- 设计已定稿：交互与视觉以 docs/prototype/index.html（定稿原型）与 docs/design/DESIGN-SYSTEM.md（v11）为准；编年史为五星卡片网格名册（见 docs/adr/0007）。
- 正式 Spec 已发布：`.scratch/v1-huanqu-archive/spec.md`（Status: ready-for-agent）；需求全文见 docs/PRD.md（V1.0 定稿）。
- 尚未初始化 git。

## Agent skills

### Issue tracker

本地 markdown 跟踪器：spec 与 ticket 以文件形式存放在 `.scratch/<feature-slug>/` 下。See `docs/agents/issue-tracker.md`.

### Triage labels

沿用五个默认 triage 角色（`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`），本地跟踪器中对应文件顶部 `Status:` 行。See `docs/agents/triage-labels.md`.

### Domain docs

单上下文布局：根目录 CONTEXT.md（术语表）+ docs/adr/。See `docs/agents/domain.md`.

## 领域要点（2026-09 已按开源工具源码核实，详见 docs/research-2026-09-25-gacha-api.md）

- 官方用词为「唤取」「调谐」（不是「抽卡」「调频」），UI 文案与任何按池名匹配的逻辑须用官方词。
- 卡池 card_pool_type 是开放式枚举，社区已确认 1–13：1/2 精准调谐（角色/武器限定）、3/4 常驻调谐、5 新手调谐、6 新手自选调谐、7 感恩定向调谐、8/9 新旅、10/11 联动、12/13 忆旅；对未知 code 必须容错兜底，禁止按中文字符串匹配池名。
- 角色系限定池（1/8/10/12）五星有 50/50、歪后必中；武器系限定池（2/9/11/13）五星必中 UP。
- 保底：五星硬保底 80 抽（新手调谐池 5 为 50 抽，存在软保底）、四星 10 抽。
- 抽卡 URL 从客户端日志提取：`Client\Saved\Logs\Client.log`（新版有 XOR 混淆，奇字节 ^0xA5、偶字节 ^0xEF，须「先原文匹配、失败再解码」双路径；游戏运行时需共享读，可能遇只读 ACL）与 KRSDK WebView `debug.log` 两处；前置条件是玩家在游戏内打开过唤取记录页。
- API：国服 `POST https://gmserver-api.aki-game2.com/gacha/record/query`，国际服仅域名不同（.net）；请求体 {playerId, recordId, cardPoolId, serverId, languageCode, cardPoolType}，参数全部来自抽卡 URL、无签名；**无分页**，每池一次 POST 返回全量历史（时间倒序）；`code != 0` 即判定 record_id 鉴权过期。
- 限速：逐卡池串行、间隔 ≥600ms（社区共识 0.6–1s），单请求超时 15s，失败重试 3 次。
- 官方仅保留约 6 个月记录、新记录约 30 分钟延迟：必须本地合并去重（time+name+qualityLevel+池 code 组合键）；「刚抽完查不到」是预期行为。
- 一份日志可能含多个 UID 的链接：按 player_id 建映射由用户选择；国服/国际服按 URL host 或 svr_area 判定。

## 项目规则

- 用户抽卡记录属于个人数据：统计全部在本地完成，不得上传任何远程服务器。
- 仅面向 Windows 用户，不做 macOS 版本；抽卡链接获取逻辑需处理国服/国际服差异。

## 常用命令

（待技术栈确定后补充：安装依赖、开发、构建、类型检查、lint、测试命令）
