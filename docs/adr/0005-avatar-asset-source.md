# 0005 头像/图标资产来源：ryanbenson/wuthering-waves-assets

卡片需要角色头像与武器图标以提升直观度（用户需求）。选型要求：许可清晰、离线可用（项目规则：数据与展示本地化）、覆盖全角色与全武器。

决定：采用 GitHub 开源素材仓库 [ryanbenson/wuthering-waves-assets](https://github.com/ryanbenson/wuthering-waves-assets)（角色 `images/<PascalCase英文名>.png`、武器 `images/weapons/<同名>.png`，256px PNG，文件名由 API 名派生）。

- 原型期：已下载示例数据涉及的 21 张图到 `docs/prototype/assets/`，卡片头像组件为 `<img>` 叠层，缺图 `onerror` 回退「属性色菱形 + 名字首字」字牌。
- 正式版：构建时把所需子集打包进应用资源（或随版本更新包），按 `resourceId → 英文名 → 路径` 映射加载；不在运行时请求远程图片，维持「零远程请求」的隐私承诺。映射缺失（新角色/新武器未收录）时显示字牌兜底。

## Considered Options

- 运行时请求 hakush.in 等在线图源（被否）：违反零远程请求规则，且可用性不受控。
- Enka.Network（被否）：其官方文档未覆盖鸣潮图标 URL 模式。
- 自行从游戏客户端提取贴图（被否）：维护成本高，法律边界不清；该仓库已完成提取与压缩。
