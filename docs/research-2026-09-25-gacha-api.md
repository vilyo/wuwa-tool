# 鸣潮 PC 抽卡统计助手 · 技术调研汇报

调研日期：2026-09-25。方法：直接阅读 7 个开源工具的源码/脚本（GitHub raw），辅以社区文章与 issue。所有结论均标注来源；口径不一处明确标注「存在冲突/未确认」。

调研的主要开源实现：

| 工具 | 技术栈 | 关键文件 |
|---|---|---|
| [wuwatracker/wuwatracker](https://github.com/wuwatracker/wuwatracker)（社区最大网页版 tracker 的导入脚本） | PowerShell | `import.ps1` |
| [cuo-ren/Wuthering-Waves-Convene-Export](https://github.com/cuo-ren/Wuthering-Waves-Convene-Export) | C++/Qt | `src/Data.cpp`、`GachaType.json`、`language.json` |
| [ningnao/wuthering-waves-gacha-record](https://github.com/ningnao/wuthering-waves-gacha-record) | Rust/egui | `src/core/gacha.rs`、`src/core/util.rs` |
| [dyar7474/WuWa_local_tracker](https://github.com/dyar7474/WuWa_local_tracker) | PowerShell | `WuWa-LocalTracker.ps1` |
| [juliy819/wuwa-gacha-tool](https://github.com/juliy819/wuwa-gacha-tool) | React/Tauri(Rust) | `src-tauri/src/gacha/fetcher.rs`、`decoder.rs`、`README.md` |
| [hyjing/shenghen-wuwa-analysis](https://github.com/hyjing/shenghen-wuwa-analysis) | Web + PowerShell | `public/shenghen-extractor.ps1` |
| [GoneTone/wuthering-waves-convene-gacha-analyzer](https://github.com/GoneTone/wuthering-waves-convene-gacha-analyzer) | Flutter + Rust MITM | `lib/data/gacha_types.dart`、`lib/services/gacha_fetcher.dart`、`gacha_credential.dart` |

---

## 1. PC 客户端本地日志路径与 URL 提取

### 1.1 日志文件（相对游戏安装根目录，即包含 `Client` 文件夹的目录，如 `C:\Wuthering Waves Game`）

| 文件 | 说明 | 来源 |
|---|---|---|
| `Client\Saved\Logs\Client.log` | UE 引擎主日志，**首选来源**；新版已加 XOR 混淆 | cuo-ren `Data.cpp:616/847`、[wuwatracker import.ps1:106](https://github.com/wuwatracker/wuwatracker/blob/main/import.ps1)、ningnao `util.rs` |
| `Client\Binaries\Win64\ThirdParty\KrPcSdk_Global\KRSDKRes\KRSDKWebView\debug.log` | 启动器内嵌 WebView（KRSDK）调试日志，明文 JSON，形如 `"#url": "https://..."`；目录名虽含 `Global`，国服/国际服安装中均存在，工具对两种安装都同时检查这两个文件 | wuwatracker `import.ps1:107`、dyar `ps1:63/217`、shenghen `ps1:46` |

国服与国际服**相对路径结构相同**，差异只在安装根目录（国际服另有 Steam/Epic/Xbox 渠道，见 1.3）。

### 1.2 Client.log 的 XOR 混淆（关键实现细节）

- 算法（多个工具逐字节一致）：`b & 1 == 1 ? b ^ 0xA5 : b ^ 0xEF`。来源：[wuwatracker import.ps1:246-340](https://github.com/wuwatracker/wuwatracker/blob/main/import.ps1)（致谢注明「Kuro 对 Client.log 加了 XOR 混淆，解码脚本原由 @kyuxu 发现、@RabbyDevs 提供」）、[ningnao util.rs:87-93](https://github.com/ningnao/wuthering-waves-gacha-record/blob/master/src/core/util.rs)、cuo-ren `Data.cpp:799-839`、juliy819 `decoder.rs`、shenghen `ps1:32-39`。
- **头部处理存在实现差异**（不影响 URL 匹配，因解码后正则扫描全文）：cuo-ren 跳过前 3 字节（判定 header magic `00 54 50`）；juliy819 也跳过 3 字节（称 UTF-8 BOM）；wuwatracker/shenghen 从第 0 字节全量解码，且**先按原文匹配、失败再解码**（兼容旧版未混淆日志）。
- 实践陷阱（wuwatracker `import.ps1` 已处理，建议照做）：
  - 日志可能被 `Engine.ini`（`Client\Saved\Config\WindowsNoEditor\Engine.ini`）中 `[Core.Log] Global=off` 关闭（脚本提供自动改回）；
  - Client.log 可能被设置只读 Deny ACL，需 `takeown`/`icacls` 解除（`import.ps1:152-202`）；
  - 游戏运行时占用日志，需以共享读（`FileShare.ReadWrite|Delete`）打开；
  - 另有第三方称「3.4 版本起日志加密导致旧脚本失效」（[鸣潮助手网页版](https://mc.appfeng.com/gachaLog)），与开源工具的持续可用实现**存在冲突/未确认**——可能指混淆算法微调或 ACL 措施，建议按「原文→解码」双重尝试实现。

### 1.3 游戏安装目录发现（各工具共用套路）

探测优先级（[wuwatracker import.ps1](https://github.com/wuwatracker/wuwatracker/blob/main/import.ps1)：612-735、dyar `ps1:55-130`、shenghen `ps1:49-78`）：
1. 注册表 Uninstall 项 `InstallPath`（DisplayName 含 Wuthering/鸣潮）；
2. HKCU MuiCache 中 `client-win64-shipping.exe` 记录；
3. 防火墙规则 `App=` 路径；
4. Xbox `.GamingRoot` 文件（`<位置>\Wuthering Waves\Content`）；
5. 全盘扫描常见路径，官方版如 `X:\Wuthering Waves Game`、`X:\Wuthering Waves\Wuthering Waves Game`；Steam `steamapps\common\Wuthering Waves[...]`；Epic `Epic Games\WutheringWavesj3oFh[...]`；含 OneDrive 的路径跳过；
6. 都失败则让用户手输。

WeGame：鸣潮 2024-05-23 公测时即上架 WeGame，与官服账号数据互通（[WeGame 鸣潮官方助手页](https://www.wegame.com.cn/helper/mingchao)）。**没有任何被调研的开源工具做 WeGame 专用适配**——WeGame 渠道安装的游戏同样是 `<根>\Client\Saved\Logs\Client.log` 相对结构，走通用扫描/手动指定即可（社区工具口径一致，具体 WeGame 默认安装前缀未在源码中出现，属运行时探测项）。B 服：所有工具均未提及任何 B 服变体，PC 端存在 B 服的证据**未找到**（大概率不存在）。

### 1.4 抽卡 URL 特征

- 正则（社区通用）：`https://aki-gm-resources(-oversea)?\.aki-game\.(net|com)/aki/gacha/index\.html#/record\?[^"\s]*`，取**最后一条**匹配（最新）。来源：wuwatracker `import.ps1:238`、dyar `ps1:217-224`、shenghen `ps1:28`、cuo-ren `Data.cpp:845`。
- host：国服 `aki-gm-resources.aki-game.com`；国际服 `aki-gm-resources-oversea.aki-game.net`（[ningnao util.rs:143-158](https://github.com/ningnao/wuthering-waves-gacha-record/blob/master/src/core/util.rs)、[Yunzai-Kuro-Plugin issue #8](https://github.com/TomyJan/Yunzai-Kuro-Plugin/issues/8)）。
- 真实样例（juliy819 `fetcher.rs` 测试用例）：
  ```
  https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?svr_id=76402e5b...&player_id=106485288&lang=zh-Hans&gacha_id=100074&gacha_type=1&svr_area=cn&record_id=acdf99a1...&resources_id=c9fbcd24...&platform=PC
  ```
- URL 参数全集：`svr_id`、`player_id`、`lang`、`gacha_id`、`gacha_type`、`svr_area`（国服为 `cn`）、`record_id`（鉴权 token，会过期）、`resources_id`（资源版本 hash）、`platform`（`PC`）。**没有 `sign`、`region_id` 之类的签名参数**。
- 日志内的行格式：Client.log 中 URL 出现在 `OpenWebView ... sdkJson: {"url":"..."}` 行内、带 `[2026.07.30-12.00.00:000]` 时间戳，`&` 可能被转义成 `\u0026`（[juliy819 decoder.rs](https://github.com/juliy819/wuwa-gacha-tool/blob/main/src-tauri/src/gacha/decoder.rs)）；debug.log 中为 `"#url": "..."` JSON 字段（dyar `ps1:217`）。
- 前置条件：必须在游戏内打开过「唤取记录」页面，日志里才有 URL（所有工具 README 一致）。
- 云鸣潮（云端版）URL 会把参数放在顶层 query 和 `#/record?` hash 各一份，hash 优先（juliy819 `fetcher.rs:144-163`）。

---

## 2. 抽卡记录 API 形态

### 2.1 Endpoint 与请求

- **国服**：`POST https://gmserver-api.aki-game2.com/gacha/record/query`
- **国际服**：`POST https://gmserver-api.aki-game2.net/gacha/record/query`
- 来源：cuo-ren `Data.cpp:930-962`、ningnao `gacha.rs:98-105`、juliy819 `fetcher.rs:8-9`、shenghen `ps1:124`、[Yunzai issue #8](https://github.com/TomyJan/Yunzai-Kuro-Plugin/issues/8)（明确「与国服相比仅有域名差异」）。
- 请求体（JSON，参数全部来自抽卡 URL，无额外签名）：

```json
{
  "playerId":     "<URL player_id>",
  "recordId":     "<URL record_id，鉴权 token，会过期>",
  "cardPoolId":   "<URL resources_id，资源版本 hash，各卡池共用同一值>",
  "serverId":     "<URL svr_id>",
  "languageCode": "<URL lang，如 zh-Hans>",
  "cardPoolType": 1
}
```
（`cardPoolType` 为 int；juliy819 发送字符串也能通过。字段语义注释来自 [GoneTone gacha_credential.dart](https://github.com/GoneTone/wuthering-waves-convene-gacha-analyzer/blob/master/lib/services/gacha_credential.dart)——它是靠 MITM 拦截游戏 WebView 自己发的 POST body 得到的。）
- 请求头：浏览器 UA + `Content-Type: application/json` + `Referer: https://aki-gm-resources.aki-game.com/`（国服）/ `https://aki-gm-resources-oversea.aki-game.net/`（国际服）（cuo-ren `Data.cpp:937-951`；其他工具大多只带 Content-Type）。
- dyar 工具还实现了一个 GET query-string 兜底（`?svr_id=...&player_id=...&cardPoolType=N...`），仅此一家，属次要/未确认。

### 2.2 分页方式

**没有分页、没有游标。** 对每个 `cardPoolType` 发一次 POST，即返回该卡池**完整历史**（时间倒序），单池可达上千条（[GoneTone gacha_fetcher.dart:51-53](https://github.com/GoneTone/wuthering-waves-convene-gacha-analyzer/blob/master/lib/services/gacha_fetcher.dart) 注释「單池全歷史可能上千筆」；ningnao/cuo-ren/shenghen/dyar/juliy819 全部为单次请求、无 `size`/`page`/游标参数）。

### 2.3 返回 JSON 结构

```json
{
  "code": 0,
  "message": "...",
  "data": [
    {
      "cardPoolType": "角色精准调谐",   // 卡池中文名（字符串，注意是「调谐」）
      "resourceId":   21010043,        // 物品资源 ID（数字）
      "qualityLevel": 3,               // 稀有度：3/4/5
      "resourceType": "武器",          // 「角色」或「武器」
      "name":         "远行者长刃·辟路",
      "count":        1,
      "time":         "2024-07-05 07:40:58"  // 服务器时间字符串，倒序
    }
  ]
}
```
来源：[ningnao gacha.rs:14-42](https://github.com/ningnao/wuthering-waves-gacha-record/blob/master/src/core/gacha.rs)（含真实样例注释）、cuo-ren `Data.cpp:731-775`、juliy819 `fetcher.rs:110-125`、shenghen `ps1:133-144`。`code != 0` 表示失败（工具普遍视为链接过期）；shenghen 还防御性读取 `resourceName`/`id`/`recordId` 字段（API 是否真返回这些字段**未确认**，以实际返回为准）。

---

## 3. 限速约定与鉴权时效性

### 3.1 请求限速（社区约定，无官方文档）

| 工具 | 相邻请求间隔 | 重试 |
|---|---|---|
| GoneTone | **最小 600ms**（注释：「夾在 12 個 cardPoolType 之間，避免被擋」）+ 单请求超时 15s | — |
| cuo-ren | 每个卡池之间 sleep **1s** | 失败重试 3 次、每次间隔 1s |
| ningnao / shenghen / dyar | 无显式限速 | 无/简单 catch |

结论：共识量级为**每个卡池请求间隔 0.5–1 秒、串行遍历全部卡池**；因无分页，不存在「每页大小/总页数上限」概念。来源：[GoneTone gacha_fetcher.dart:35-52](https://github.com/GoneTone/wuthering-waves-convene-gacha-analyzer/blob/master/lib/services/gacha_fetcher.dart)、cuo-ren `Data.cpp:777/983-998`。

### 3.2 鉴权时效性

- `recordId` 是「会过期的查询 token hash」（[GoneTone gacha_credential.dart](https://github.com/GoneTone/wuthering-waves-convene-gacha-analyzer/blob/master/lib/services/gacha_credential.dart) 原注释）；过期后各工具的处理一致：**判定失败 → 要求用户重新打开游戏内唤取记录页 → 重新提取/拦截**。
- **具体有效期时长：存在冲突/未确认。** 开源代码中无任何工具写死时长；ningnao 会把 URL 缓存到 `url_cache.txt` 跨会话复用（README 明言「更新记录无需启动游戏」），GoneTone「能用就直接用」，说明至少可存活数小时到数天；低置信度社区来源称「数小时到一天左右」。建议按「失败即重取」设计，不依赖固定时长。
- 失效时的表现：HTTP 可能为 200 但 `code != 0`（ningnao/cuo-ren 按此判定，并提示「抽卡链接可能已经失效」）；官方记录页本身过期时显示 "Network error, please try again"（[wuwatracker 帮助文章](https://wuwatracker.com/articles/how-to-fix-wuthering-waves-pull-history-issues)）。搜索中出现的「错误码 1514」**未在开源代码中找到，未确认**。

### 3.3 数据保留窗口（重要）

- 官方唤取记录仅保留 **约 6 个月**：[wuwatracker 帮助文章](https://wuwatracker.com/articles/how-to-fix-wuthering-waves-pull-history-issues)（"Convene records are valid for six months"）；[juliy819 README](https://github.com/juliy819/wuwa-gacha-tool)（「官方抽卡链接通常只保留近约 6 个月，建议至少每半年完整同步一次」）。因此所有工具都做**本地增量合并**保留过期旧数据（cuo-ren `merge()`、ningnao、dyar、shenghen 多重集合合并）。
- 新抽的记录进入 API 有 **约 30 分钟延迟**（同 wuwatracker 文章）。

---

## 4. 卡池类型 code 对照（核实结果）

综合 [cuo-ren GachaType.json](https://github.com/cuo-ren/Wuthering-Waves-Convene-Export/blob/master/GachaType.json)、[juliy819 fetcher.rs POOL_TYPES](https://github.com/juliy819/wuwa-gacha-tool/blob/main/src-tauri/src/gacha/fetcher.rs)、[GoneTone gacha_types.dart](https://github.com/GoneTone/wuthering-waves-convene-gacha-analyzer/blob/master/lib/data/gacha_types.dart)、shenghen `ps1:15`、ningnao `gacha.rs`：

| code | API `cardPoolType` 字符串 | 英文（cuo-ren） | 备注 |
|---|---|---|---|
| 1 | 角色精准调谐 | Featured Resonator | 限定角色池（50/50） |
| 2 | 武器精准调谐 | Featured Weapon | |
| 3 | 角色常驻调谐 | Standard Resonator | |
| 4 | 武器常驻调谐 | Standard Weapon | |
| 5 | 新手调谐 | Beginner | **5 星保底 50 抽** |
| 6 | 新手自选调谐 | Beginner's Choice | 5 星保底 80 |
| 7 | 新手自选调谐（感恩定向调谐） | Beginner's Choice (Giveback) | **GoneTone 当前有效集合无 7**（集合 [1,2,3,4,5,6,8,9,10,11,12,13]，無 7）；cuo-ren 保留但 `skip:true` |
| 8 | 角色新旅调谐 | New Voyage Resonator | shenghen 译「新旅程」，命名略有出入 |
| 9 | 武器新旅调谐 | New Voyage Weapon | 同上 |
| 10 | 角色联动调谐 | Collab Resonator | |
| 11 | 武器联动调谐 | Collab Weapon | |
| 12 | 角色忆旅调谐 | Reverb Resonator | juliy819「忆旅」/ GoneTone「Reverb/憶旅」；shenghen 称「特殊」 |
| 13 | 武器忆旅调谐 | Reverb Weapon | 同上 |

关键结论：

1. **映射已扩展到 8–13**，1–7 的对应关系与社区一致，但新工具必须遍历 1..=13 并容错未知 code（ningnao 循环 `1..=13` 并注释「提供对未来新池子的兼容」；shenghen 同；GoneTone 硬编码 12 池且排除 7）。
2. 6 号池副名「命运的始发之歌」**未在任何开源工具中出现，未确认**；工具口径：6=新手自选、7=新手自选（感恩定向）（[cuo-ren language.json](https://github.com/cuo-ren/Wuthering-Waves-Convene-Export/blob/master/language.json) zh-Hans）。
3. 用词差异：API 返回与工具普遍使用「**调谐**」「**唤取**」；「调频」与 API 实际字符串不一致，做字符串匹配（如按 `cardPoolType` 中文名分池）时会踩坑。
4. 保底数值得到 GoneTone 显式建模佐证：5 星 80 抽（池 5 为 50）、4 星 10 抽全池统一；juliy819 另按 `1|8|10|12` 判定「限定角色池（有 50/50）」。

---

## 5. 国服 / 国际服差异与多账号

- **API 差异只有域名**（[Yunzai-Kuro-Plugin issue #8](https://github.com/TomyJan/Yunzai-Kuro-Plugin/issues/8) 表格）：

| | 国服 | 国际服 |
|---|---|---|
| 记录页 host | `aki-gm-resources.aki-game.com` | `aki-gm-resources-oversea.aki-game.net` |
| API host | `gmserver-api.aki-game2.com` | `gmserver-api.aki-game2.net` |

- 参数结构、POST body、返回结构完全相同；`svr_area=cn` 标识国服。判服方法：URL host（主流）、`svr_area`（cuo-ren）、`player_id` 首位为 1 即国服（juliy819 `get_api_url()`）。
- 日志路径：相对结构一致；国际服安装根目录另有 Steam（`steamapps\common\Wuthering Waves`）、Epic（`Epic Games\WutheringWavesj3oFh`）、Xbox（`.GamingRoot`）变体；国服为官方启动器 / WeGame。
- **同一日志含多账号 URL：确认**。cuo-ren `findGachaUrls()` 把整份 Client.log 中所有 URL 解析成 `player_id → url` 映射逐一拉取（`Data.cpp:841-896`）；ningnao 按「倒序找匹配所选 player_id 的最新 URL」筛选（`util.rs:105-125`）；wuwatracker 跨多安装目录收集全部日志后取**最新修改时间**的那份。同一份日志同时混有国服+国际服 URL 无直接证据（两服是不同客户端、不同安装目录），但 cuo-ren 按每条 URL 的 `svr_area`/host 独立选域名，是稳妥做法。

---

## 6. 对 PRD 的关键影响

**直接决定接口/功能设计的事实：**

1. **无分页**：每卡池一次 POST 拿全量、`data` 按时间倒序——拉取器不需要游标/页大小，但需要**逐卡池串行 + 0.5–1s 间隔**和失败重试（如 3 次×1s）。
2. **鉴权在 `recordId`，无签名**：不存在 `sign`、`region_id` 之类参数；无需任何本地签名计算。
3. **URL 提取管线**：读 `Client.log`（共享读、可能需去只读 ACL）→ 尝试原文与 XOR 解码双路径 → 正则取最后一条 → 解析 9 个 query 参数；`Engine.ini` 关日志与文件 ACL 是真实用户会撞上的故障模式，应列入诊断项。
4. **6 个月保留窗口 + 30 分钟延迟**：必须做本地历史合并/去重（时间+名称+稀有度组合键），且「刚抽完查不到」是预期行为而非 bug。
5. **卡池 code 设计为开放式枚举**：内置 1–13 映射，但对未知 code 走默认保底参数，避免每次官方加池就发版；**不要按中文字符串匹配** API 返回的池名。
6. **多账号/多服**：数据模型以 `player_id` 为主键、按 URL host/`svr_area` 区分国服/国际服；一份日志可能含多个 UID，提取时应建映射而非只取第一条。

**实现时需运行时探测 / 以实际返回为准的项：**

- `recordId` 的确切有效期（社区口径冲突，按「code != 0 即判定过期并引导重开游戏唤取页」处理；不要缓存后假定可用时长）。
- Client.log 混淆头部（3 字节跳过与否在不同工具间不一致）与未来混淆算法变化（3.4 加密传闻冲突）——实现为「原文匹配失败再解码」的双重策略。
- 返回体中 `resourceName`/`id` 等扩展字段是否存在（仅 shenghen 防御性读取）。
- WeGame 安装的前缀路径、云鸣潮 URL 的双份参数格式（hash 优先）。
- 池 7 当前是否仍返回数据（GoneTone 已从有效集合移除，其他工具仍遍历）。
- `time` 字段的时区语义（各工具直接按字符串排序/解析，cuo-ren 提供「设置时区」功能暗示服务器时间与本地有偏差，未有一致结论）。
