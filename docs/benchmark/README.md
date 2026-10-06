# 经典 PC 内容基准：来源与待核对目录

状态：**provisional，尚未冻结**。日期：2026-10-01。COS-01 本批交付为可审查的来源调查、目录骨架和冻结检查；issue #2 仍保持未完成。

## 指定参考与已核实事实

用户指定安装目录：`C:\Program Files (x86)\PlantsVsZombies`。只读检查得到：

| 字段 | 结果 |
| --- | --- |
| 程序 | `PlantsVsZombies.exe`，3,838,152 bytes |
| FileVersion | `1.2.0.1073` |
| ProductVersion | `GOTY` |
| ProductName / OriginalFilename | `Plants vs. Zombies` / `PlantsVsZombies.exe` |
| 本次参考 ID | `pvz-pc-goty-1.2.0.1073-c04c524c6a37` |
| 随附文档 | 该目录及其子目录未发现文件名含 readme/manual/license 的文件 |
| 尚未观察 | 程序实际启动、界面语言、菜单、图鉴、存档与玩法；发行渠道也未知 |

完整 SHA256、目录名和只读命令见 [reference.json](../../benchmarks/classic-pc/reference/reference.json)。不需要重复计算相同文件的哈希。本次没有启动游戏、修改安装、读取或更改玩家存档、解包资产或复制原版美术和音频。

此安装是当前指定的可执行参考，内容范围沿用已确认的经典 PC 主要内容。GOTY 附加项另列；不因参考程序标注 GOTY 就扩大或缩减经典内容。元数据身份已固定，具体内容尚未冻结。

## 来源台账与适用边界

机器可读来源 ID、定位标题和适用发行版位于 `reference.json.sources`。`verified_for_edition` 表示资料对应发行版的主张得到核对，不能转换为本机玩法的 `verified_for_reference`。

| 来源 ID | 可复查定位 | 用途及限制 |
| --- | --- | --- |
| `SPEC` | [需求基线第 4B 节](../specs/cosmos-spec.md) | 内容范围、验收默认值和容差要求；不是原作行为证据 |
| `LOCAL` | `reference.json` 的 `installation` 与 `inspection` | 本机 EXE 自报版本和文件身份；不证明运行状态或渠道 |
| `STEAM` | [官方 GOTY 商店](https://store.steampowered.com/app/3590/)的 About This Game / Key features | 50 冒险关、49 植物、26 僵尸及主要模式；只作规模核对入口，不能替代名册 |
| `EA-MAC` | [EA Readme](https://akamai.cdn.ea.com/eadownloads/u/f/manuals/GAME-PVZ/en_US_readme.html)的页首、System Requirements、Game Modes | 文档是 Mac 1.0.40，构建日期 2012-10-17。20 迷你游戏、两类解谜各 10 项、生存 11 项均只是候选规模，各自包含无尽的数量需核对本机 |
| `GOTY-NEWS` | [2010-08-10 官方公告](https://store.steampowered.com/oldnews/4183) | 新增成就、Steam Cloud、Zombatar 单列；不推断此安装一定具有 Steam 功能 |

沿用 [已有来源调查](../research/2026-09-30-model-budget.md)，本批只核对与目录直接有关的官方页面。没有采用第三方单位属性表，也没有凭记忆补写名称、出怪或数值。EA 文档同时显示 2009 release date 和 2012 Mac build；仅按前者归类为 Windows 首发资料会造成版本混用。

### 2026-10-06 原设计者的教程陈述

[补充调查](../research/2026-10-06-pvz-designer-tutorial-source.md)记录 GDC 官方 George Fan 2012 原始演讲中的教程引入阶段及双发轮次说明。仅作 designer statement，尚未绑定本机 GOTY 1.2.0.1073；完整名册、精确数值、解锁事件与实际运行仍需固定参考核对。本次不更新机器来源/目录，不提升 verified_for_reference 或冻结状态。

## 内容矩阵

[catalog.json](../../benchmarks/classic-pc/reference/catalog.json) 是本批唯一机器可读目录。它包含 230 项范围记录，其中 221 项待参考核对、9 项是已确认的目标游戏验收政策。**这不是 230 个已验收玩法，也不是完整名册已闭合。**

| 范围 | 当前记录 | 核对完成前不得省略 |
| --- | --- | --- |
| 冒险 | `ADV-1-01` 到 `ADV-5-10`，50 个要求槽位；5 类环境 | 每关入口、场地、选卡、出怪、胜负、奖励和存档 |
| 迷你游戏 | `MINI-01..20` 候选槽位 | 真实名称、每项独有机制、解锁与重玩 |
| 砸罐子 / 我是僵尸 | `VASE-01..10` / `IZ-01..10` 候选槽位 | 有限关逐项名册、各自无尽规则与连胜 |
| 生存 | `SURV-01..11` 候选槽位 | 场地、难度、波次、换卡、持久状态与无尽增长 |
| 植物 / 僵尸 | 49 / 26 个候选槽位 | 本机完整名册、非图鉴变体、动作、属性和所有交互 |
| 特殊关与二周目 | `SPECIAL-*`、`BOSS`、`SECOND-PASS*` | 各阶段特殊关、首领阶段、二周目变化与限定遭遇 |
| 禅境花园 | `GARDEN-*` | 分区、植物、道具、照料、收益、时间、移动与持久化 |
| 商店、图鉴、解锁、存档 | `SHOP-*`、`ALMANAC`、`UNLOCK-*`、`SAVE-*` | 商品逐项展开、余额边界、奖励、完整解锁图、跨关与重启恢复 |
| 关键数值与规则 | `VALUE-*`、`INPUT`、`COMBAT` 等 | 离散值、时间、随机规则、场地和边界条件 |
| 对应美术与目标运行质量 | `CORRESPONDENCE`、presentation / runtime 分类 | 原创角色对应、音乐音效、体验、性能、离线与交付验收 |

候选槽位的 `referenceName: null` 是刻意保留的未知。槽位序号不表示原版菜单顺序；不能把它们当作已经核实的 49 个植物或 26 个僵尸身份。核对时保留已有 ID，补真实名称、菜单位置和证据；超出候选规模的角色/变体必须新增 ID。数量冲突记录在差异表与冻结评审里，不能静默删项。

商店、变体、解锁、单位交互目前有完整范围入口，但仍是汇总要求。冻结前必须展开为逐项事实和证据，独立评审必须核对这些分母是否闭合。每项经典必要内容都需要证据，不用平均分抵消缺项。

## 下一次参考观察的提交内容

已有安装路径与版本，无需再次提供。下一批使用正常界面取得：

1. 启动、主菜单、版本界面与窗口环境记录；后续观察始终引用本次 reference ID。
2. 各模式菜单、图鉴、商店和花园逐页名册，保留页面位置、解锁状态与原始证据路径。不要覆盖现有玩家档案；记录观察所用档案前提。
3. 对待核对条目填入规则、数值与测量样本，并记录正常输入步骤。细节见 [观察和验收契约](observation-contract.md)。
4. 记录 GOTY 差异、偶发 bug 候选及证据；原版素材只供观察，不纳入生成素材库。

当前工具没有执行原生游戏的 UI 观察，本批没有可运行性证据。后续具备该能力时继续核对；平台契约、通用工程、pi 接入等独立任务可以并行推进。

### 2026-10-06 Windows 窗口观察尝试

本节为后续记录，不改变上述 2026-10-01 调查结果。本次按 computer-use 技能使用 `@oai/sky`：初始没有参考窗口，启动已安装 EXE 后返回窗口 id68104、标题 `Plants vs. Zombies GOTY`。首次截图返回 `FrameArrived timed out: timed out waiting on channel`；重新选择并激活同一返回窗口后，仅重试一次，仍为 `window capture timed out: timed out waiting on channel`。

文本接口只返回标题栏、系统菜单和最小化/关闭等窗口控件，没有游戏菜单、图鉴或玩法文本。不能据此确认加载完成或任何内容、规则、数值；没有游戏内输入、参考资产提取或目录更新。关闭按钮调用因 `coordinate input geometry is unavailable` 未生效，重新观察后以标准 Alt+F4 退出；两秒后窗口列表为空。未使用自定义截图或控制协议。参考内容仍 provisional，230 行/221 待核实及冻结前置保持；相同条件下不重复捕获。

## 校验与冻结

在仓库根目录运行，无需安装依赖或调用付费服务：

```powershell
node benchmarks/classic-pc/reference/validate.mjs
node --test tests/reference/validate.test.mjs
node benchmarks/classic-pc/reference/validate.mjs --require-frozen
```

前两条应通过；第三条在当前版本**必须返回退出码 1**并报告 provisional。这是预期的冻结阻止结果，不是基准完成。

校验器检查稳定 ID、必需模式、50 个冒险槽位、来源定位、参考版本匹配、证据类别、未知值及冻结条件。它不能判断证据内容是否真实、测量是否正确或汇总条目是否漏项，独立评审仍是冻结前置。目标游戏的运行质量和艺术验收属于后续产物验收，不要求先生成游戏才能固定参考基准。

本批不包含游戏实现或付费 API 调用。COS-01 未冻结继续阻止 COS-14 最终基准验收与 COS-15 完整生成关口；不阻止其他任务按已核实条目准备工具。正式生成仍遵循 ¥200/12h 硬上限、¥100/6h 优化目标；所有能力探针共享 ¥150 总额。
