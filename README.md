# 唤取档案 · 鸣潮唤取记录统计助手

> 工作名「唤取档案」，最终名称待定。

纯本地的《鸣潮》（Wuthering Waves）PC 唤取记录统计工具，面向 Windows。自动从客户端本地日志提取官方唤取链接，按卡池拉取全部记录并永久保存在本机，再用统计 + 趣味评语回答那个问题：这一路抽卡，到底是欧是非。

**当前状态**：设计已定稿（原型 / 视觉 / Spec 齐备），工程开发启动中，暂无可运行版本。

## 功能（V1 规划）

- **一键获取**：自动定位游戏安装目录，从 `Client.log`（新版含 XOR 混淆，自动解码）与 KRSDK WebView `debug.log` 两处提取唤取链接；游戏运行中也可读取。手动粘贴链接作为兜底入口。
- **全量拉取 + 本地合并**：官方接口每池一次返回全量历史；本地按去重键合并、只增不减。官方仅保留约 6 个月记录，更早的历史由本地档案永久保存。
- **五星编年史名册**：时间倒序的五星卡片墙——UP / 歪、超欧 / 超非一眼可读；右栏保底引线（距必得还差几抽、大小保底状态）与高光时刻纪念牌。
- **欧非评价**：本地规则评语 + S–D 评级字母，不调用任何在线服务。
- **记录抽屉**：全量流水，按稀有度 / 卡池筛选，2 万条记录虚拟滚动流畅。
- **备份恢复**：JSON 导出 / 导入（同一去重键合并），换机重装不丢数据。

## 隐私承诺

所有统计与存储 100% 在本机完成。除向官方接口拉取**你自己**的唤取记录外，不向任何服务器发送数据；无埋点、无崩溃上报、无自动更新检查。

## 平台与前提（规划）

- Windows 10 / 11 x64；国服与国际服均支持。
- 获取记录的前提：在游戏内打开过一次「唤取记录」页面。
- 新抽的记录进入官方接口约有 30 分钟延迟，「刚抽完查不到」是预期行为。

## 技术栈

Tauri 2 + Vue 3 + TypeScript + Pinia。业务逻辑全部在前端 TS，Rust 仅承担日志读取、目录探测与 HTTP；NSIS 安装包目标 ≤ 15MB。

## 文档导航

| 文档 | 内容 |
|---|---|
| [docs/PRD.md](docs/PRD.md) | V1.0 产品需求（定稿） |
| [docs/prototype/index.html](docs/prototype/index.html) | 交互定稿原型（浏览器直接打开） |
| [docs/design/DESIGN-SYSTEM.md](docs/design/DESIGN-SYSTEM.md) | 视觉规范 v11 终稿 |
| [CONTEXT.md](CONTEXT.md) | 领域术语表 |
| [docs/adr/](docs/adr/) | 架构决策记录 ADR-0001 ~ 0007 |
| [docs/research-2026-09-25-gacha-api.md](docs/research-2026-09-25-gacha-api.md) | 官方接口技术调研（含来源） |
| [.scratch/v1-huanqu-archive/spec.md](.scratch/v1-huanqu-archive/spec.md) | V1 正式 Spec |

## 开发

工程脚手架尚未搭建，技术选型与约束见 [ADR-0001](docs/adr/0001-tauri-2-desktop-shell.md)；安装 / 构建 / 测试命令将在工程初始化后补充到本节。

## 声明

- 本项目为社区工具，与库洛游戏（Kuro Games）及《鸣潮》官方无关。
- 仅通过官方接口读取玩家本人的唤取记录，不做任何绕过鉴权、代抽或自动化行为。
- 角色头像与武器图标素材来自开源仓库 [ryanbenson/wuthering-waves-assets](https://github.com/ryanbenson/wuthering-waves-assets)，构建期打包、离线加载。

## 许可

待定。
