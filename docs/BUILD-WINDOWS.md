# Windows 便携版构建与 V1 真机验收教程

> 适用：在 Windows 10/11 x64 真机上把鸣潮工具箱（wuwatool）构建为便携版 zip 并完成 V1 人工验收。
> macOS 开发机无法交叉编译 MSVC 目标，此步骤须在 Windows 机执行（ADR-0001、ADR-0008）。

## 一、构建环境准备（一次性）

1. **Visual Studio Build Tools**：安装 "Visual Studio 生成工具 2022"，勾选「使用 C++ 的桌面开发」工作负载（MSVC 编译器 + Windows SDK）。
2. **Rust**：从 https://rustup.rs 安装 `rustup`（默认 `stable-x86_64-pc-windows-msvc` 工具链）。终端执行 `rustc -V` 能出版本号即可。
3. **Node.js**：安装 Node 20 LTS 或更新（含 npm）。
4. **WebView2 Runtime**：Windows 11 自带；Windows 10 若无，从 Microsoft 官网装 "Evergreen WebView2 Runtime"。

## 二、构建便携版

在仓库根目录（PowerShell）：

```powershell
npm install            # 首次安装依赖
npm run tauri build    # 先执行前端 vue-tsc + vite build，再编译 Rust 并出包
```

构建产物：

- 主程序：`src-tauri\target\release\wuwatool.exe`
- `tauri.conf.json` 的 `bundle.targets` 为空数组 `[]`，即**不做任何安装器打包**——原始 exe 就是便携版本体（前端资源已嵌入二进制，无外部 DLL 依赖，仅要求系统有 WebView2）。

## 三、组装便携版 zip（ADR-0008）

1. 新建文件夹 `wuwatool-<版本号>`（版本号与 `package.json` / `src-tauri/tauri.conf.json` 的 `version` 一致，发版时**两处需同步**）。
2. 拷入 `wuwatool.exe`，可附一份 `使用说明.txt`。
3. 右键 → 压缩为 zip。**验收约束：zip 体积 ≤ 15MB**（超了先检查是否误把整个 target 目录压进去）。
4. 使用方式：解压到**任意**文件夹（如 `D:\Tools\wuwatool`），双击 `wuwatool.exe` 直接运行；不写注册表、无安装过程。

**档案数据位置（与程序目录分离，ADR-0008）**：`%APPDATA%\com.vilyo.wuwatool\wuwatool.sqlite3`（即 `C:\Users\<用户>\AppData\Roaming\com.vilyo.wuwatool\`）。升级 = 用新 exe 替换旧文件，数据不受影响；卸载 = 删程序文件夹 + 删上述数据目录。

## 四、V1 真机验收清单（按 PRD §11 DoD）

逐项人工验证，发现问题回灌 `.scratch/v1-wuwatool/issues/` 新票：

| # | 验收项 | 通过标准 |
|---|---|---|
| 1 | 便携版运行 | 解压即用、双击运行、任务管理器/注册表无安装残留 |
| 2 | 体积 | zip ≤ 15MB |
| 3 | **国服真实账号**一键获取 | 游戏内打开一次「唤取记录」页 → 应用点「一键获取」→ 13 池串行拉完、进度可见、数据落库 |
| 4 | **国际服真实账号**一键获取 | 同上（可用国际服客户端或粘贴国际服链接验证） |
| 5 | 新版 XOR 混淆日志提取 | 客户端为新版（日志乱码）时一键获取仍成功（状态栏/文件面板可见 `decode: "xor"` 命中） |
| 6 | 隐私抓包 | 用 Wireshark/Fiddler 抓包：除 `gmserver-api.aki-game2.com`（或 `.net`）外**零网络请求**；统计/浏览/备份全程断网可用 |
| 7 | 日志只读 ACL | 把 `Client.log` 设为拒绝读取 → 应用给出「只读 ACL」指引而非笼统失败 |
| 8 | Engine.ini 关日志 | `[Core.Log] Global=off` 时给出对应诊断与改回指引 |
| 9 | 性能 | 构造 1 万 / 2 万条记录（可反复粘贴导入或临时注入）：名册滚动、记录抽屉虚拟滚动均流畅 |
| 10 | 备份往返 | 导出 JSON → 清空档案 → 导入 → 记录数与内容与导出前一致 |
| 11 | 升级场景 | 用 v0.2 的 exe 替换 v0.1（或反之）：档案数据完整保留 |
| 12 | 多 UID | 一份日志含两个 UID 时出现选择列表；切换档案后数据互不污染 |
| 13 | 减少动态效果 | Windows「设置 → 辅助功能 → 视觉效果 → 动画效果」关闭后，界面动画自动停用 |
| 14 | 明暗主题 | 主题切换即时生效，重启后保持；明色为默认 |
| 15 | 自动同步 | 开关默认开；有有效缓存链接时启动静默增量；链接失效时状态栏温和提示、无弹窗打扰 |

## 五、常见问题

- **`error: linker 'link.exe' not found`**：未装 VS Build Tools 的 C++ 工作负载，回到第一步。
- **首跑提示缺少 WebView2**：装 Evergreen Runtime（见第一节第 4 步）。
- **一键获取提示「未找到安装目录」**：在设置 → 游戏安装目录 → 重新探测，或点手动指定选择游戏根目录（含 `Client` 文件夹的那层）。
- **拉取报「唤取链接已失效」**：回游戏重新打开一次「唤取记录」页，再点一键获取（record_id 是会过期的鉴权 token，属预期行为）。
- **新记录拉不到**：官方新记录约有 30 分钟延迟；官方仅保留约 6 个月记录，更早历史只存在于本地档案。
