# 01: 应用骨架与设计基底

**What to build:** 打开应用就能看到一个主题化的单画面空壳：Tauri 2 桌面壳 + Vue 3 + TypeScript + Pinia 前端跑起来，设计系统 v11 的视觉基底（明/暗双主题 tokens、斜切/菱形游戏母语元素）落地为全局样式，顶栏（一键同步 / 记录 / 设置的占位入口）与常驻状态栏就位。状态栏随时可见：所有数据仅保存在本机、新记录约 30 分钟延迟、官方仅保留约 6 个月记录、版本号。这是后续所有票的地基。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [x] `tauri dev` 打开单画面窗口：顶栏（占位按钮）、主画面空态、底部状态栏结构完整
- [x] 状态栏常驻显示：本地隐私声明、「新记录约 30 分钟后可同步」、「官方仅保留约 6 个月记录」、应用版本号
- [x] 设计系统 v11 tokens 以 CSS 变量落地：明/暗两套（明为默认）、共鸣青/低饱和金强调色体系，临时开关可切换验证两主题
- [x] 「减少动态效果」（prefers-reduced-motion）开启时全部动画自动关闭
- [x] Vitest + Vue Test Utils 测试设施可运行（含一个冒烟测试）；类型检查与 lint 命令可用
- [x] 窗口标题/产品名按「唤取档案」定名；打包目标仅保留便携形态、不配置安装器（ADR-0008，发布验收在 #14）

---

来源：spec「Implementation Decisions · 架构与技术栈 / 信息架构与视觉」；ADR-0001、0003、0004、0006、0008；docs/design/DESIGN-SYSTEM.md（v11）。

## Comments

- 2026-09-26 实现说明（agent）：
  - **结构**：前端 `src/`（`App.vue` 壳 + `AppTitleBar`/`AppStatusBar` + Pinia `stores/theme.ts`），tokens 在 `src/styles/tokens.css`（明色为 `:root` 默认、暗色挂 `html[data-theme="dark"]`），基底/复位/焦点/reduced-motion 在 `src/styles/base.css`；Rust 侧为模板级最小壳（`src-tauri/`，无命令、无插件，后续票再扩）。
  - **自定义标题栏**：窗口 `decorations: false`，顶栏按原型实现（黑条 + 斜切金色主按钮 + 菱形品牌符），最小化/最大化/关闭为真实按钮（Tauri window API + capabilities 显式授权），顶栏可拖拽（`data-tauri-drag-region`）。lib.rs 处理了 macOS 关窗不退进程的问题。
  - **主题临时开关**：顶栏月亮按钮（原型同款），Pinia store 持有状态并在初始化时把 `data-theme` 写到 `<html>`（`index.html` 的静态属性仅作首帧防闪烁）；#13 转设置项时改 store 初始化读取持久化值即可。
  - **字体**：Barlow Semi Condensed（latin，500/600/700 共 ~47KB）以 woff2 形式本地打包于 `src/assets/fonts/`，未走 Google CDN——保证「除官方接口外零网络请求」承诺。
  - **版本号**：`vite.config.ts` 从 package.json 注入 `__APP_VERSION__`，状态栏显示 `v0.1.0`；与 `tauri.conf.json` 的 `version` 需人工保持一致（升级时可顺手核对）。
  - **打包**：`bundle.targets: []`（不生成任何安装器）；`mainBinaryName: "huanqu"`（ASCII，规避非 ASCII productName 的构建风险）；便携 zip 的组装与 exe 最终命名验收在 #14。
  - **验证记录**（本机 macOS）：`cargo check` ✅、`npm run build`（vue-tsc + vite）✅（JS gzip 32KB）、`npm test` 5/5 ✅（冒烟 + 主题切换 + tauri.conf 防回归）、`npm run lint` ✅；`tauri dev` 已启动到窗口运行状态（进程存活、日志无错）后停止。真机视觉验收（明暗两主题、reduced-motion）待人工确认。
  - **术语备注**：CONTEXT.md 把首选词定为「一键获取」，而定稿 PRD/spec/原型/本票均用「一键同步」，实现从后者；建议下次维护 CONTEXT.md 时对齐。
  - **命令**：见 README「开发」节与 AGENTS.md「常用命令」（注意：本机 npm 走 nvm、cargo 在 `~/.cargo/bin`，非交互 shell 需先加 PATH）。
- 2026-09-26 code-review（双轴）后修正：
  - **对比度硬伤**：状态栏文字由原型的 `--text-3` 改为 `--text-2`（`--text-3` 在 `--bg-raise` 上 ≈3.9:1，不满足设计系统交付检查「双主题文字对比 ≥4.5:1」；原型自身存在此内部矛盾，以交付检查为准）。
  - 金色主按钮按压态保留斜切（`skewX + scale`，对齐原型 pool-tab 的处理）。
  - 黑条上的暖白系 6 处硬编码色值收编为 tokens（`--ink-wash`/`--ink-wash-strong`/`--ink-line`/`--ink-text-dim`/`--ink-text-faint`）。
  - 窗口控制按钮由字符字形（`▢` 在 Windows 有字体回退风险）改为内联 SVG；空态菱形复用 `.dia.lg`。
  - 新增测试：`package.json` ↔ `tauri.conf.json` 版本号一致性防漂移。
  - 搁置未改：状态栏「更早已存于本地档案」在空档案时语义略超前——保留原型终稿原文，待引入档案状态的票再细化措辞；`bundle.targets: []` 仅表示不生成安装器，便携 zip 组装按 ADR-0008 由 #14 验收。
