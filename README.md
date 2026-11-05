# MERIDIAN · 日内期货复盘台

一个本地优先的日内期货交易复盘桌面应用：记录每一笔决策、权益曲线、形态表现与过程纪律。

技术栈：**Rust + Tauri 2 + React 19 + TypeScript + Tailwind CSS v4**。数据由 Rust 后端写入本机 JSON 文件，不经过任何服务器。界面采用 1Password 风格的三栏布局——暖灰侧栏、按日期分组的中间列表、白色详情页与克制的蓝色主按钮。

> 示例数据仅用于体验界面与统计，不构成任何投资建议。

## 运行

前置条件：

- Node.js 18+
- Rust stable（Windows 需要 MSVC 工具链）
- Windows 10/11 自带 WebView2；macOS / Linux 见 [Tauri 文档](https://tauri.app/start/prerequisites/)

安装依赖并启动桌面版：

```bash
npm install
npm run tauri:dev
```

首次编译 Rust 需要几分钟，之后增量启动约 1–3 秒。

只调试前端（浏览器模式，数据写入 `localStorage`）：

```bash
npm run dev
```

构建安装包：

```bash
npm run tauri:build
```

产物位于 `src-tauri/target/release/bundle/`（Windows 为 `.msi` / `.exe`）。仅构建前端资源可用 `npm run build`。

## 安装包（Windows x64）

从 [GitHub Releases](https://github.com/yixin8875/meridian/releases) 下载最新版本：

| 文件 | 说明 |
| --- | --- |
| `MERIDIAN_<version>_x64-setup.exe` | 推荐，NSIS 安装器，中文界面，支持当前用户安装 |
| `MERIDIAN_<version>_x64_zh-CN.msi` | WiX MSI，适合批量部署 / 组策略 |

- 推送带新版本号的 `main` 后，GitHub Actions 会自动构建并发布安装包与更新文件。
- 安装包未做代码签名，首次运行会出现 SmartScreen「已保护你的电脑」提示，选择「更多信息 → 仍要运行」即可。
- 安装后数据仍写入 `%APPDATA%\com.meridian.trader\meridian.json`；卸载不会删除该文件。

## 版本发布与自动更新

版本号以 `src-tauri/tauri.conf.json` 为准，发布前需要同步修改：

- `package.json`（可用 `npm version <version> --no-git-tag-version` 同时更新 `package-lock.json`）
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`（`Cargo.lock` 会在构建时同步）
- `src/views/Settings.tsx` 页脚显示

提交并推送到 `main` 后，[`.github/workflows/release.yml`](.github/workflows/release.yml) 会：

1. 读取版本号；若 `v<version>` Release 已存在则直接跳过；
2. 在 `windows-latest` 上构建 NSIS 与 MSI；
3. 上传安装包、更新包（`.nsis.zip` / `.msi.zip`）、签名文件与 `latest.json`。

首次启用自动发布前，在仓库 `Settings → Secrets and variables → Actions` 添加：

- `TAURI_SIGNING_PRIVATE_KEY`：更新签名私钥的**完整内容**。本机生成在 `%USERPROFILE%\.tauri\meridian.key`，不要提交到仓库。
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：生成密钥时设置的密码；无密码可留空或不添加。

应用启动 3 秒后请求 `https://github.com/yixin8875/meridian/releases/latest/download/latest.json`。发现新版本时右下角会提示，点击「下载并安装」后自动重启。更新检查只在生产构建中启用，`tauri:dev` 与浏览器预览不会联网检查。0.3.3 是首个包含更新器的版本；0.3.2 及更早版本需要手动安装一次 0.3.3。

本地带签名构建（生成更新包）：

```bash
TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/meridian.key" npm run tauri:build
```

## 首次启动

应用**不会自动写入演示数据**。首次打开是空账户，提供三条路径：

1. **记录第一笔交易** —— 直接开始真实记录；
2. **导入 CSV** —— 从券商或表格软件导出后导入；
3. **先看看示例数据** —— 主动载入一份合成数据（191 笔已平仓、2 笔持仓、4 篇笔记），可随时在设置中清空。

## 功能

- **总览** —— 账户权益、区间净盈亏与资金加权收益率、胜率 / 盈亏比 / 期望 / 最大回撤；权益曲线支持 1M / 3M / 6M / YTD / 全部与悬停逐日明细，并显示当日资金变动；风险条展示累计净入金、今日已实现、每日亏损上限与连续亏损；另有持仓浮动盈亏、过程纪律读条、最近六笔交易。
- **盈亏日历** —— 按月查看每个交易日的净盈亏热图，颜色深浅对应盈亏幅度；顶部显示本月净盈亏、交易天数与盈利 / 亏损日；点击任意日期打开该日的结构化复盘，已写复盘的日期带蓝点，没有交易的日期也可以记录观察。
- **每日复盘** —— 每个交易日一份结构化记录：市场背景、交易计划、执行分、规则违背与明日改进；弹窗内自动汇总本周已平仓笔数、净盈亏、期望与错误标签次数，并可跳到当日交易列表。
- **交易台账** —— 按日期分组的可搜索列表，全部 / 持仓中 / 已平仓筛选；详情展示计划风险、持仓时长、价格、手续费、四项纪律与错误标签；支持编辑与两步确认删除。
- **记录 / 编辑交易** —— 按合约点值自动计算毛盈亏、手续费、净盈亏与 R 倍数，评级随 R 自动生成；支持持仓中（当前价）与已平仓（出场价）两种状态；可勾选追单、提前入场、移动止损、过度交易、报复交易、计划外交易等过程错误标签；表单实时显示本笔风险占账户权益比例，并按账户单笔风险给出建议手数，一键套用。
- **K 线图** —— 每笔交易可附多张截图，支持 `Ctrl+V` 粘贴剪贴板图片、拖拽或选择文件；自动压缩到最长边 1800px，详情页可放大、左右切换与下载。
- **镜像分析** —— R 倍数分布、形态 / 时段 / 星期表现、纪律通过率、错误成本，以及基于当前数据生成的行为读数。错误成本对比「有错误标签」与「无错误标签」的净盈亏和平均 R，并按标签拆解追单、移动止损等具体行为的代价。
- **复盘笔记** —— 盘前 / 盘中 / 盘后 / 周总结四类，带情绪与标签，支持搜索、编辑与删除。
- **交易字典** —— 合约（代码、名称、每点价值）、时段与形态都可以在设置中自行增删改；改名会同步历史交易，仍被使用的条目不能删除。
- **资金流水** —— 每个账户可记录入金、出金与分红 / 利息；权益曲线按实际资金变化，收益率与回撤剔除这些外部资金，只衡量交易表现。设置页可按日期编辑或两步确认删除。
- **风险参数** —— 每个账户可设置单笔风险百分比、每日亏损上限与连续亏损上限；总览显示今日已实现、上限与连续亏损状态，触发时提示停止开新仓。
- **多账户** —— 侧栏账户菜单可随时切换或新建账户；每个账户有独立的起始权益、手续费、风险参数、交易、每日复盘、资金流水、笔记与统计，设置页支持改名、改参数与删除（连同其数据）。
- **设置** —— 账户管理与切换；本机数据文件路径；CSV 导入 / 导出（作用于当前账户）；主动载入示例或清空当前账户。
- **完整备份与恢复** —— 一键导出包含全部账户、交易、笔记、交易字典与 K 线截图的 ZIP；恢复前自动生成当前状态的安全备份。每天首次启动或首次保存时自动保留一份完整备份，默认保留最近 14 份。
- **自动更新** —— 生产版启动后自动检查 GitHub Releases；发现新版本时在右下角提示，可在应用内下载、安装并重启。
- **全局搜索** —— `⌘K` / `Ctrl K`，可搜索合约、形态、日期、备注与笔记。

## 数据存储

桌面版由 Rust 命令 `load_state` / `save_state` 读写：

- 数据文件：系统应用数据目录下的 `meridian.json`
  - Windows：`%APPDATA%\com.meridian.trader\meridian.json`
  - macOS：`~/Library/Application Support/com.meridian.trader/meridian.json`
  - Linux：`~/.local/share/com.meridian.trader/meridian.json`
- K 线截图：同目录 `charts/<图片 id>.jpg`（前端最长边压缩到 1800px）
- 上一次自动保存：同目录 `meridian.backup.json`
- 每日完整备份：同目录 `backups/daily/meridian-daily-YYYY-MM-DD.zip`，保留最近 14 份
- 恢复前安全备份：同目录 `backups/safety/pre-restore-<时间>-<进程号>.zip`
- 文件损坏时：原文件保留为 `meridian.corrupt-<unix 时间戳>.json`，不会静默覆盖

写入采用「临时文件 + rename」以避免半写状态；前端改动后 250ms 防抖自动保存，失败会按指数间隔重试，侧栏底部显示保存状态。关闭窗口时会先保存（最多等待 3 秒），避免丢失最后一笔编辑。设置页会显示当前真实路径并支持复制。

### 完整备份与恢复

设置页「完整备份与恢复」可以导出 `.zip`，内容包含 `meridian.json`、`manifest.json` 与 `charts/` 下的全部 K 线图。恢复时会先校验清单、格式版本、账户数据与图片路径，并在替换前自动生成当前状态的安全备份；恢复完成后应用自动重新加载。每日备份在启动或首次保存时生成，超过 14 份后自动删除最旧的备份。

浏览器调试模式没有 Rust 后端，会自动回退到 `localStorage`（键名 `meridian.trader.v2`）与 IndexedDB（图片，库名 `meridian.charts`）。

数据文件带有版本号，0.2.x 的扁平账户字段会在读取时自动迁移为一个默认账户，旧交易与笔记一并归入；之后的每次保存都使用多账户结构。旧版本的交易在读取时会自动补上空错误标签数组，旧数据文件会补上空每日复盘与资金流水列表，账户也会补上默认风险参数，无需手动迁移。

## CSV 导入

支持中文或英文表头，逗号分隔，带引号字段可包含逗号与换行。

| 列 | 别名示例 | 说明 |
| --- | --- | --- |
| 日期 | `date` | `YYYY-MM-DD`、`YYYY/MM/DD`、`MM/DD/YYYY` |
| 时间 | `entryTime` / `入场时间` | `HH:mm` |
| 合约 | `symbol` / `代码` | ES、MES、NQ、MNQ、RTY、M2K、CL、MCL、GC、MGC |
| 方向 | `side` | 多 / 空 / L / S / long / short |
| 手数 | `qty` / `数量` | 默认 1 |
| 入场价 / 止损价 / 目标价 / 出场价 | `entry` / `stop` / `target` / `exit` | 缺省盈亏时用于计算 |
| 形态 / 时段 / 状态 | `setup` / `session` / `status` | 状态含“持仓/open”视为未平仓 |
| R / 盈亏 / 手续费 | `rMultiple` / `pnl` / `fees` | 缺省时自动计算 |
| 错误标签 | `mistakes` | 多个标签用 `|`、`;` 或 `、` 分隔 |
| 备注 | `note` | 非空时自动勾选“写下进场理由” |

导入按 `日期 + 时间 + 合约 + 入场价 + 手数 + 方向` 去重，重复行自动跳过。导出使用同一套中文表头，可直接回导。

## 计算口径

| 指标 | 口径 |
| --- | --- |
| 毛盈亏 | `(出场价 − 入场价) × 方向 × 点值 × 手数` |
| 手续费 | `手数 × 每手手续费` |
| 净盈亏 | 已平仓：毛盈亏 − 手续费；持仓中：毛盈亏 |
| 日盈亏 | 当日所有已平仓交易的净盈亏之和；持仓中的交易不计入 |
| 计划风险 | `abs(入场价 − 止损价) × 点值 × 手数` |
| R 倍数 | 毛盈亏 ÷ 计划风险 |
| 评级 | A：R ≥ 1.5；B：−0.4 ≤ R < 1.5；C：R < −0.4 |
| 胜率 | 盈利笔数 ÷ 已平仓笔数 |
| 盈亏比 | 毛盈利 ÷ 毛亏损 |
| 期望 | ΣR ÷ 已平仓笔数 |
| 净入金 | 入金 + 分红 − 出金，不计入交易盈亏 |
| 账户权益 | 起始权益 + 累计交易净盈亏 + 累计净入金 |
| 最大回撤 | 剔除出入金后的交易权益峰值到谷底的最大跌幅 |
| 收益率 | 按每日资金基数（前一日权益 + 当日净流入）计算的链式收益率 |
| 单笔风险占比 | 计划风险 ÷ 当前账户权益 |
| 建议手数 | `floor(当前权益 × 单笔风险% ÷ (|入场价 − 止损价| × 点值))`，不足 1 手时提示预算不足 |
| 执行分 | 通过的过程纪律项 ÷ 全部纪律项 |

点值取自 `src/data/contracts.ts`（如 ES $50/点、NQ $20/点、CL $1,000/点）。

## 目录

```
src-tauri/
  src/lib.rs            Tauri 命令：数据读写、K 线图、完整备份与恢复
  src/main.rs           桌面入口
  tauri.conf.json       窗口、构建与打包配置
src/
  App.tsx               hash 路由、选中状态与弹窗编排
  store.tsx             数据上下文、自动保存、重试与关闭前保存
  index.css             Tailwind v4 设计令牌与组件类
  types.ts              Trade / DailyReview / JournalNote / AppData
  lib/
    storage.ts          Tauri invoke 与 localStorage 回退
    backup.ts           完整备份 / 恢复的 Tauri 调用封装
    csv.ts              CSV 解析、别名映射与导出
    stats.ts            统计、权益曲线、分组与分布
    format.ts           日期、金额、R 值格式化
  components/
    Shell.tsx           三栏外壳、侧栏、顶栏搜索
    TradeList.tsx       按日期分组的交易列表
    TradeDetail.tsx     交易详情
    TradeForm.tsx       记录 / 编辑交易弹窗
    NoteList.tsx        笔记列表
    NoteDetail.tsx      笔记阅读 / 编辑
    Chart.tsx           手写 SVG 权益曲线
    PnlCalendar.tsx     月度盈亏日历与按日聚合
    DayReview.tsx       每日复盘弹窗与本周自动汇总
    CashFlowForm.tsx    入金 / 出金 / 分红记录弹窗
    UpdateBanner.tsx    自动更新检查、下载与安装提示
    primitives.tsx      徽标、盈亏、指标、弹窗等基础组件
  views/
    Overview.tsx        总览
    Mirror.tsx          镜像分析
    Settings.tsx        账户、数据、CSV 与重置
  data/
    contracts.ts         合约点值、形态、时段、纪律项
    seed.ts              仅在用户主动选择时载入的示例数据
```

## 设计

- 画布 `#f5f4f1`、侧栏 `#f7f6f3`、列表 `#fcfbf9`、内容白 `#ffffff`
- 文字 `#1d1d1f` / `#6e6e73` / `#98989e`，分隔线 `#e7e5e0`
- 强调蓝 `#0b6cf0`，盈利绿 `#12805c`，亏损红 `#c7443e`
- 系统 UI 字体（Segoe UI / PingFang SC / Microsoft YaHei UI），正文 13px
- 桌面窗口 1320 × 860，最小 1060 × 680；三栏为侧栏 228px、列表 326px、详情自适应

## 已知边界

- 美元计价；不支持汇率换算。
- 不连接券商、不拉取实时行情；“持仓中”的当前价由手动填写。
- 无云同步与多设备合并；数据以本机文件为准，可通过 CSV 迁移。
- 错误标签目前是固定的六项；自定义纪律项与按形态绑定的盘前检查清单尚未实现。
- 每笔交易仍按单次入场 / 出场记录，不支持部分成交或分批加仓；资金流水也只记录账户层面的出入金。
- 自动更新依赖 GitHub Releases；离线或尚未发布新版本时不会提示。
