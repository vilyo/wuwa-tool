# 05: 多 UID 选择与档案切换

**What to build:** 多号玩家的数据互不污染：一份日志检测出多个 UID 时，展示列表让用户选择要导入的档案；同步中发现与当前档案不同的 UID 时，弹切换确认，旧档案只读保留。档案以 player_id 为键，切换后统计与展示整体切换。

**Blocked by:** 04 目录探测与一键同步（多 UID 信息来自日志提取）。

**Status:** ready-for-human

- [ ] 一份日志含多个 UID 的抽卡链接时，展示 UID 列表由用户选择导入，不静默取其一
- [ ] 检测到与当前档案不同的 UID：弹切换确认；确认后旧档案只读保留，两号记录互不污染
- [ ] 档案以 `player_id` 为键；切换档案后名册、统计、流水整体切换到对应数据
- [ ] V1 仅切换当前档案，不做多档案并行展示 UI（Out of Scope）

---

来源：spec「User Stories 12/13」「Implementation Decisions · 获取管线（档案以 player_id 为键）」「Out of Scope」；CONTEXT.md「档案 / 切换档案」。
