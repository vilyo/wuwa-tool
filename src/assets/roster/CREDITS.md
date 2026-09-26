# 素材来源与署名（src/assets/roster/）

本目录图片在构建期打包进应用，仅用于本地离线展示；本应用承诺除官方接口外零网络请求
（ADR-0005：不在运行时请求远程图源）。

## 图片来源仓库

- [ryanbenson/wuthering-waves-assets](https://github.com/ryanbenson/wuthering-waves-assets)
  （选型依据：docs/adr/0005-avatar-asset-source.md）
- 命名约定（仓库 README）：API 英文名的 PascalCase，去除非字母数字字符，
  如 `Xiangli Yao` → `XiangliYao.png`；256px PNG。个别文件名大小写沿用仓库实际值
  （如 `WhispersofSirens.png`），映射表以其为准。

## 引入方式

- 2026-09-27 起收录**全部可抽取五星**（44 名角色 + 48 把武器，共 92 张 PNG）；
  此前仅打包定稿原型演示数据出现过的 21 张（18 角色 + 3 武器），导致真实用户
  大量老角色缺头像（清宵有图而今汐/忌炎等无图即由此来）。
- 漂泊者各属性形态（Rover）不可抽取、不会出现在唤取记录中，故不收录。
- 四星物品仅用于非五星展示场景，当前 UI 无此场景，不收录。
- 图源缺口（上游与 Encore 图标 CDN 均暂缺，走回退字牌，待补）：
  沉冥 UnspokenRue（21020107）、玉阙玄华 BloomingJadehaven（21050116）。

## resourceId / 中英文名数据来源

- [Encore API](https://api-v2.encore.moe)（`/api/{lang}/character`、`/api/{lang}/weapon`，
  游戏数据快照，2026-09-27 查证）：提供物品 Id、中英文名、稀有度（QualityId）。
- 该 Id 与抽卡记录 `resourceId` 同为游戏物品 Id：抽卡真实样本
  `resourceId 21010043 = 远行者长刃·辟路`（ningnao 工具源码注释）与 API 同 Id 条目
  交叉验证一致，稀有度口径（3/4/5）亦一致。
- 消费方：`src/domain/avatars.ts`（AVATAR_ASSET_ENTRIES）、`src/domain/standardRoster.ts`。

## 许可

- 上游图片仓库**未声明任何许可**：GitHub API `license: null`，README 无许可章节
  （2026-09-26 查证）。素材图片源自库洛游戏《鸣潮》客户端资源的社区提取，
  图片内容的版权归 Kuro Games 所有。
- 本项目仅在本地离线工具中作非商业展示用途。如再分发本应用，请自行评估风险
  并随附本文件。
