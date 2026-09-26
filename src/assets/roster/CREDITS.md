# 素材来源与署名（src/assets/roster/）

本目录 PNG 在构建期打包进应用，仅用于本地离线展示；本应用承诺除官方接口外零网络请求
（ADR-0005：不在运行时请求远程图源）。

## 来源仓库

- [ryanbenson/wuthering-waves-assets](https://github.com/ryanbenson/wuthering-waves-assets)
  （选型依据：docs/adr/0005-avatar-asset-source.md）
- 命名约定（仓库 README）：API 英文名的 PascalCase，去除非字母数字字符，
  如 `Xiangli Yao` → `XiangliYao.png`；256px PNG。

## 引入方式

- 21 张（18 角色 + 3 武器：ThousandfoldDeliverance / FreezeFrame / SkullThrasher）
  原型阶段已下载至 `docs/prototype/assets/`，本目录为其副本（原件保留未动）。
- 5 张常驻武器图标（EmeraldOfGenesis / LustrousRazor / StaticMist / AbyssSurges /
  CosmicRipples）于 2026-09-26 自该仓库 `images/weapons/` 下载补充。

## 许可

- 上游仓库**未声明任何许可**：GitHub API `license: null`，README 无许可章节
  （2026-09-26 查证）。素材图片源自库洛游戏《鸣潮》客户端资源的社区提取，
  图片内容的版权归 Kuro Games 所有。
- 本项目仅在本地离线工具中作非商业展示用途。如再分发本应用，请自行评估风险
  并随附本文件。

## resourceId 数据说明

该仓库不提供 resourceId ↔ 名称的对应关系（仓库内无任何 ID 数据文件，同日查证），
故本项目不据此伪造 resourceId；`src/domain/avatars.ts` 与 `src/domain/standardRoster.ts`
中的 resourceId 字段仅在取得可靠来源后填入，缺失时走名称兜底与字牌回退。
