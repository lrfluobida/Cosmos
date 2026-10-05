# Cosmos 父任务与子任务发布稿

状态：2026-10-05 更新。[主 issue #1](https://github.com/lrfluobida/Cosmos/issues/1) 与 61 个原生子任务已核实；[发布映射](github-issues.json) 保存实际编号、链接和依赖。任务尚待逐项实施与验收。

补充任务：[COS-18 / #19](https://github.com/lrfluobida/Cosmos/issues/19) 承接原 R4/R11 已确认的需求访谈与 Windows CLI 入口要求，A/B 已部分集成，整体验收与缺口仍保持 open。[COS-19 / #20](https://github.com/lrfluobida/Cosmos/issues/20) 承接原 R4/R5/R12，修复真实失败暴露的角色交接格式、截断诊断与输出配置；当前离线实施，不改变范围或预算。

新补充：[COS-20 / #21](https://github.com/lrfluobida/Cosmos/issues/21) 在原开发验证授权和预算内准备显式 validation profile 与新有界 case；源代码审查、集成及准入完成后才由协调者执行。正式生成 ¥200/12h、验证合计 ¥150 和首批累计 ¥30 保持不变；原窗口和已消费 case 不重开。

失败修复：[COS-21 / #22](https://github.com/lrfluobida/Cosmos/issues/22) 承接首个 native case 暴露的 Windows 模板 capture 原子 rename 失败；沿原 R5/R11 免费诊断并修复，不扩大范围或预算。

调用实验历史：原生Case8 v1真实browser090音频断言code_defect失败，经一次自动linked repair后v2 build/Edge111/111/独立codingreview approved并接受，76请求新增保守峰值估算¥1.549592、共享¥7.008623。旧七失败/C6 free111和原v1失败保持，closure6只归还未用容量；COS34源码已独审集成但实际human NONE，COS35/36已独审集成、仍为preparation_only，COS37已审fixture重开能力，迁移仍缺runtime adapter/付费入口，COS38输入adapter/COS39失败事实分类已独审集成、迁移仍为preparation_only，COS40 source consumer已审synthetic能力，COS42预算组source已独审集成、实际ledger4 upgrade/delegation已应用，COS41 design反馈source已审，COS43原生入口源码已独审集成，真实迁移case1仅planning1/34.198秒/¥0.014102后缺policyId失败；C1结束时九cases/revision1421/ledger4/shared¥7.022725、closure7/45closed/七audits为历史，COS44 policy契约源码已独审集成，COS45第二迁移case源码已独审集成、actual C2 design-schema失败；15SDK/282562ms/新增¥0.161528，C2结束时10cases/rev1488 ledger4/shared¥7.184253/closure8/50closed八audits为历史，COS46只读自检源码已独审集成，COS47第三迁移source已独审集成、actual C3规划身份失败：1SDK/33413ms/¥0.014780/无tasks-game；C3结束时11cases/rev1495 ledger4/shared¥7.199033/closure9/55closed九audits为历史，COS48主机身份绑定源码已审集成，COS49第四迁移source已独审集成、actual C4 hostcaptures通过但designreview changes_requested/無game；24SDK/1377154ms/new¥0.214694，C4结束时12cases/rev1602 ledger4/shared¥7.413727/closure10/60closed十audits为历史，COS50路径契约源码已审，COS51第五迁移source已独审集成/TRANSFER_CASE_FIVE_SOURCE_READY，C5结束时（历史）13cases/rev1884/ledger4/shared¥8.530730/closure11/65closed十一audits；design/art host及独立review通过，coding截止前取消、未handoff/capture/build/browser/game。Source52/53已独审集成但只source/TEMP证据，preparation internal API具备、public CLI/connector与实际human未通过；COS54/55审批时仅source/TEMP、actual C6 NONE为历史；当前COS58/59源码已审集成，C6复用design/art后coding120秒流时限失败，13codingadmitted/12settled135531µ/unknown974882µ、14cases/rev1942/6delegations/65closed11audits，closure12未执行，COS60准备中；迁移尚未通过，完整经典与最终用户体验未验收。

2026-10-01 更新：用户确认单次完整运行硬上限为 **¥200/12h**，**¥100/6h 是优化目标，不是硬性达标保证**；共享付费验证总额仍为 **¥150**。直接 DeepSeek API 探针已发生 31 次调用，按保守峰值计费为 ¥0.721771，计入同一验证账本；后续拟开展的有界端到端探针累计不超过 ¥30，仍从该 ¥150 余额预留。见 [二次穿刺](../research/2026-10-01-cost-latency-challenge.md)，当前证据不代表完整运行已达到硬上限内的验收条件或优化目标。

依据：[产品规范](cosmos-spec.md)、[可行性调研](../research/2026-09-30-feasibility.md)、[模型与预算调研](../research/2026-09-30-model-budget.md)。本文纳入最新确认的额度与验收边界；调研中的历史预算建议不能覆盖这些要求。

## 1. 本次拆解的边界

- 当前实施者是开发 Cosmos 平台的 Codex 子代理；运行时角色是未来 Cosmos 调用的设计、编码、美术与评审上下文，两者必须区分。
- 子任务交付平台能力、通用模板和验收工具。游戏专属代码、关卡与资源组合必须由 Cosmos 运行时生成，保留生成与人工介入记录。
- GitHub Issues 用于跟踪平台开发；Cosmos 本机运行、恢复、验收与交付不依赖 GitHub 可用性。
- 首版为 Windows CLI，交付桌面浏览器游戏、完整源码、依赖与启动说明、资产清单及验收证据。
- pi 调研基线为 `earendil-works/pi` v0.99.1，源码快照 `0582d9c11da78c1812d4537af2d194f1dd060d26`；版本与快照分别记录，实施时核对对应关系。
- 模型固定 DeepSeek V4.1 Flash，API 标识 `deepseek-flash`；优先验证 pi 内置 DeepSeek provider，包括视觉输入，不得静默替换模型。
- pi SDK、TypeScript 编排器、Phaser 与 Playwright 为初始实施基线；通过既定探针核实接入与适用性，按证据处理缺口和必要调整。
- 所有付费能力验证共享 **¥150 总上限**，含模型、图像、音频及验证所需其他服务；每张任务卡的额度都从同一余额分配。
- 成熟 Cosmos 每次完整游戏生成共享 **¥200 与 12h 硬上限**，包括生成、集成、修复和自动验收；**¥100/6h 为优化目标**，平台研发不冒充一次成熟运行。
- 额度目前用于规划，不表示本次启动外部付费调用。计时前仅准备通用环境、模板与参考资料；游戏专属代码、可运行关卡数据与生成美术须在正式运行计时、计费范围内产生。
- 达到额度或到时硬停止，交付当前产物、费用、证据与差距。仅用户可以决定追加额度、延长时限或另行继续，恢复不得重置原账本。
- 验证切片与迁移用例不改变首个完整基准的内容分母，也不证明完整基准已经达标。
- 最终结果由自动验收客观条目，再由用户最终试玩确认体验；中间关口是内部执行条件，不设置逐阶段人工试玩签收。

## 2. 父 issue 正文

### 标题

开发 Cosmos：基于 pi 的通用 2D 游戏 agent，并完成经典 PC 塔防基准的端到端生成验收

### 目标与完成条件

从一句话进入需求访谈，固定契约后由 Cosmos 调度设计、编码和美术，独立评审并自动修复，最终交付可运行游戏及源码。角色会话、产物版本、费用、取消与恢复均有可检查记录。

首个完整基准覆盖经典 PC 版主要内容：50 个冒险关卡、迷你游戏、解谜、生存、禅境花园，以及商店、图鉴、解锁与存档。冒险二周目、特殊关、无尽规则和单位交互纳入清单；其他精确数量、名册与节奏由 COS-01 核实，禁止直接混用 GOTY 或 Mac 资料。原创简化美术与原角色一一对应，界面布局大体相似；包含原创或可再分发的背景音乐和关键音效，不含配音与片尾 MV。

父任务通过须满足：固定清单逐项通过，关键数值与节奏符合明确容差，原作偶发 bug 有列明的排除项；正常输入、存档与稳定性达到冻结阈值；完整运行不超过 ¥200/12h 硬上限；独立自动验收证据完整，用户最终试玩认可。¥100/6h 是需另行测量和报告的优化目标，不构成硬性达标保证，当前尚无完整运行达标证据。小切片通过、调查完成与平台组件通过分别记录，均不能替代此条件。

### 子任务清单

- [ ] [COS-01 固定参考来源与完整验收清单](https://github.com/lrfluobida/Cosmos/issues/2)
- [ ] [COS-02 定义任务、上下文与共享预算契约](https://github.com/lrfluobida/Cosmos/issues/3)
- [ ] [COS-03 验证指定模型与 pi provider](https://github.com/lrfluobida/Cosmos/issues/4)
- [ ] [COS-04 验证原创美术与音频供应链](https://github.com/lrfluobida/Cosmos/issues/5)
- [ ] [COS-05 建立 Windows CLI 与通用浏览器工程](https://github.com/lrfluobida/Cosmos/issues/6)
- [ ] [COS-06 实现最小状态与预算执行器](https://github.com/lrfluobida/Cosmos/issues/7)
- [ ] [COS-07 接通运行时角色与独立评审上下文](https://github.com/lrfluobida/Cosmos/issues/8)
- [ ] [COS-08 建立正常输入驱动的验收链路](https://github.com/lrfluobida/Cosmos/issues/9)
- [ ] [COS-09 实现产物登记与代码资产集成](https://github.com/lrfluobida/Cosmos/issues/10)
- [x] [COS-10 由 Cosmos 生成真实端到端切片](https://github.com/lrfluobida/Cosmos/issues/11)
- [x] [COS-11 实现受约束的修复与重新规划](https://github.com/lrfluobida/Cosmos/issues/12)
- [x] [COS-12 验证取消、异常退出与恢复](https://github.com/lrfluobida/Cosmos/issues/13)
- [x] [COS-13 验证并行调度与长时执行边界](https://github.com/lrfluobida/Cosmos/issues/14)
- [ ] [COS-14 建立完整基准的运行时验收工具](https://github.com/lrfluobida/Cosmos/issues/15)
- [ ] [COS-15 执行完整基准生成与自动验收](https://github.com/lrfluobida/Cosmos/issues/16)
- [ ] [COS-16 验证不同需求的有限迁移](https://github.com/lrfluobida/Cosmos/issues/17)
- [ ] [COS-17 整理交付与用户最终试玩](https://github.com/lrfluobida/Cosmos/issues/18)
- [ ] [COS-18 接通 Windows 需求访谈与生成运行 CLI](https://github.com/lrfluobida/Cosmos/issues/19)
- [ ] [COS-19 修复原生角色交接格式与输出截断处理](https://github.com/lrfluobida/Cosmos/issues/20)
- [ ] [COS-20 区分开发验证窗口与正式生成时限](https://github.com/lrfluobida/Cosmos/issues/21)
- [x] [COS-21 诊断并修复 Windows 产物目录原子发布失败](https://github.com/lrfluobida/Cosmos/issues/22)
- [ ] [COS-22 验证更高调用上限下的完整原生生成](https://github.com/lrfluobida/Cosmos/issues/23)
- [ ] [COS-23 为原生作者交接增加一次只读格式纠正](https://github.com/lrfluobida/Cosmos/issues/24)
- [ ] [COS-24 归还已停止验证案例的未用任务分配额度](https://github.com/lrfluobida/Cosmos/issues/25)
- [ ] [COS-25 验证作者只读格式纠正后的完整原生生成](https://github.com/lrfluobida/Cosmos/issues/26)
- [ ] [COS-26 让原生规划按已关闭任务后的有效分配容量核算](https://github.com/lrfluobida/Cosmos/issues/27)
- [ ] [COS-27 验证有效分配核算修复后的完整原生生成](https://github.com/lrfluobida/Cosmos/issues/28)
- [ ] [COS-28 只读澄清编码交接中的作者职责与主机验收](https://github.com/lrfluobida/Cosmos/issues/29)
- [ ] [COS-29 验证交接职责澄清后的完整原生生成](https://github.com/lrfluobida/Cosmos/issues/30)
- [ ] [COS-30 用主机证据和独立评审处理编码交接未决项](https://github.com/lrfluobida/Cosmos/issues/31)
- [ ] [COS-31 验证主机证据驱动的完整原生生成](https://github.com/lrfluobida/Cosmos/issues/32)
- [ ] [COS-32 区分游戏断言超时与浏览器故障并触发有界修复](https://github.com/lrfluobida/Cosmos/issues/33)
- [ ] [COS-33 验证浏览器缺陷反馈后的完整原生生成](https://github.com/lrfluobida/Cosmos/issues/34)
- [ ] [COS-34 持久化最终用户体验决定并绑定交付版本](https://github.com/lrfluobida/Cosmos/issues/35)
- [ ] [COS-35 为通用浏览器 host 绑定共享验证窗口和角色额度](https://github.com/lrfluobida/Cosmos/issues/36)
- [ ] [COS-36 绑定运行时推箱子设计与可信鼠标验收计划](https://github.com/lrfluobida/Cosmos/issues/37)
- [ ] [COS-37 通过隔离 profile 和同 origin 验证真实浏览器进程重开](https://github.com/lrfluobida/Cosmos/issues/38)
- [ ] [COS-38 连接运行时关卡设计与固定角色输入](https://github.com/lrfluobida/Cosmos/issues/39)
- [ ] [COS-39 记录持久浏览器失败事实并保守分类](https://github.com/lrfluobida/Cosmos/issues/40)
- [ ] [COS-40 接通持久浏览器与生成媒体的完整验收](https://github.com/lrfluobida/Cosmos/issues/41)
- [ ] [COS-41 在原设计会话中提供有界语义反馈](https://github.com/lrfluobida/Cosmos/issues/42)
- [ ] [COS-42 将迁移验证绑定到原 COS16 预算组](https://github.com/lrfluobida/Cosmos/issues/43)
- [ ] [COS-43 提供固定迁移案例的原生运行入口与准入](https://github.com/lrfluobida/Cosmos/issues/44)
- [ ] [COS-44 明确原生规划输出中的 policyId 契约](https://github.com/lrfluobida/Cosmos/issues/45)
- [ ] [COS-45 准备第二个原生迁移案例与剩余额度准入](https://github.com/lrfluobida/Cosmos/issues/46)
- [ ] [COS-46 为设计作者提供标识符约束与输出自检](https://github.com/lrfluobida/Cosmos/issues/47)
- [ ] [COS-47 准备带设计输出自检的第三个原生迁移案例](https://github.com/lrfluobida/Cosmos/issues/48)
- [ ] [COS-48 由主机将规划局部别名绑定到预声明任务身份](https://github.com/lrfluobida/Cosmos/issues/49)
- [ ] [COS-49 准备由主机绑定身份的第四个原生迁移案例](https://github.com/lrfluobida/Cosmos/issues/50)
- [ ] [COS-50 明确作者输出与捕获产物的角色读取路径](https://github.com/lrfluobida/Cosmos/issues/51)
- [ ] [COS-51 准备带捕获路径契约的第五个原生迁移案例](https://github.com/lrfluobida/Cosmos/issues/52)
- [ ] [COS-52 将迁移验收与角色 host 纳入生产运行库](https://github.com/lrfluobida/Cosmos/issues/53)
- [ ] [COS-53 保存运行时设计前的需求草稿与访谈模式](https://github.com/lrfluobida/Cosmos/issues/54)
- [ ] [COS-54 为角色提供准确输入引用的文件清单](https://github.com/lrfluobida/Cosmos/issues/55)
- [ ] [COS-55 接通编码作者原会话的可信编译检查](https://github.com/lrfluobida/Cosmos/issues/56)
- [ ] [COS-56 复用已通过阶段的固定产物与评审来源](https://github.com/lrfluobida/Cosmos/issues/57)
- [ ] [COS-57 准备仅编码的第六迁移案例与剩余额度准入](https://github.com/lrfluobida/Cosmos/issues/58)
- [ ] [COS-58 接通公开 CLI 的推箱子准备模式生成与恢复](https://github.com/lrfluobida/Cosmos/issues/59)
- [ ] [COS-59 为长编码响应设置原窗口内的可信请求时限](https://github.com/lrfluobida/Cosmos/issues/60)

发布时优先把上述任务登记为 GitHub 原生 sub-issues；无论工具是否支持原生关系，父子 issue 的正文与元数据均须保留父任务链接、稳定任务 ID 和依赖链接。本文是 2026-10-01 已确认实施基线的发布稿，不表示任务已执行或依赖已通过。

## 3. 执行关口与首批就绪任务

| 关口 | 进入条件 | 不满足时的处理 |
| --- | --- | --- |
| G0 开始实施 | 采用 2026-10-01 已确认 spec 与初始技术基线，接口与文件归属明确 | 补齐具体接口与文件归属；已就绪任务继续推进 |
| G1 付费验证 | 供应商与凭据可用、当前计费可核对、共享 ¥150 账本已建立且可预留 | 不发付费请求；先完成免费调查、离线准备与额度分配 |
| G2 真实端到端 | COS-03/04/05/06/07/08/09 通过其有界验收 | 修复对应能力；不提前手写基准游戏填补缺口 |
| G3 长时运行 | COS-10/11/12/13 通过，未知请求与预算恢复场景有证据 | 不开始无人值守完整生成 |
| G4 完整基准 | G3、COS-01、COS-14 与 COS-18 通过，单次 ¥200/12h 硬上限契约冻结 | 不以减少关卡、单位或模式绕过关口 |
| G5 最终交付 | 自动验收报告与可启动产物齐备 | 自动验收有缺项时先报告差距；不得包装为已达标 |

首批就绪：COS-01 的来源调查、COS-02 的契约及 COS-05 的通用工程准备。G0/G1 后优先并行 COS-03 与 COS-04，复用已完成的直接 API 探针证据；尽快抵达 COS-10，再扩展长时与全量能力。

G0 沿用已确认实施基线，不重复请求整套方案批准。执行中只有需求冲突、证据不足导致的关键决策或额度/时限问题回到用户；常规集成、修复与内部审查自主执行。COS-01 的用户参考版本、COS-03 的 pi SDK 接入和 COS-04 的图像服务能力仍按各自前置条件与探针核实。

## 4. 子任务卡

路径是建议归属，实施开始时在任务卡中落实实际路径；不得借此重排无关代码。P0 为关键路径，P1 为完整运行必需，P2 为迁移验证。

### COS-01 · P0 · 固定参考来源与完整验收清单

- 本次进展：静态基础值证据 `fdd64c8` 已独立审查并合入 `80d4d75`；记录 53 行 × 9 DWORD，字段语义与源码推导分开。53 行不代表可选植物分母，launchRate 不按秒解释；catalog 仍为 230 项、221 项待核实，未冻结，#2 保持 open。
- 后续静态证据：Zombie 定义表 `e292b49` 已获独立批准并合入 `73cf4fe`，34 行 × 7 DWORD 原始值与源码语义推导分列；34 含特殊项/Zombatar，不是经典分母。mZombieValue 不是 HP，基础关卡/波次/权重不证明实际出怪；原 catalog、未知项及未冻结状态保持不变。
- 初始化 HP 静态证据：`a1c1371` 已获独立批准并合入 `80794c3`，保存 17 处短指令样本和 270/370/1100 三处立即数赋值；语义仍属源码推导，最终有效 HP、完整分支及经典等价性未验证，230/221 与未冻结状态不变。
- 投射物静态证据：`3a20bae` 获独立 PROJECTILE_STATIC_SOURCE_READY 并合入 `89f8162`，保存 14×3 原始 DWORD 与 11 处短指令样本；普通豌豆基础字段 20 不证明最终命中伤害。非 UTF-8 cpp 已停止读取，只用 UTF-8 头文件推导字段，护甲、倍率、交互、运行与经典等价性仍未知，230/221 与未冻结状态不变。
- 依赖/状态：用户已提供安装来源，`reference.json` 已固定 GOTY 1.2.0.1073 与文件 hash，状态 metadata_pinned_content_pending；外部前提仍是可见、可留证的正常输入观察通道及可达未解锁内容，目前 native capture 不可用，尚未 verified_for_reference 或内容冻结。清单冻结引用最终 spec 第 4B 节标准。
- 输入：用户提供的可运行参考版、spec 已定模式范围、现有调研与来源资料；精确版本由本任务记录。
- 输出/范围：`docs/benchmark/` 下版本标识、来源台账、完整内容矩阵、数值与计时表、排除项和待核实项；不写游戏实现。
- 工作：核对 50 冒险关与全部主要模式；逐项记录版本、来源位置和可信状态，区分原始事实、推导与未知。
- 通过：每个必须条目有稳定 ID；精确名册与关键数值有可复查依据，容差可执行，所有未知有明确处置，完整分母被冻结。
- 失败/证据：混用发行版、用汇总商店数字替代完整名册或无来源推断即失败；保留来源摘录/定位、差异表与确认记录。
- 阻塞边界：调查可以结束并交付未决清单，但“基准冻结”状态仍阻塞 COS-14 最终验收与 COS-15；不得把缺少依据写成已还原。

### COS-02 · P0 · 定义任务、上下文与共享预算契约

- 依赖/状态：无；契约草拟就绪，执行格式随 G0 固定。
- 输出/范围：`docs/contracts/`、`schemas/`；任务、需求、上下文包、产物、证据、费用、状态与运行清单 schema，含本文第 5 节字段。
- 工作：定义作者/评审权限、状态转换、输入版本校验、失败分类及试验预算预留方式；先给 COS-03/04 可用的共享账本规范。
- 通过：有效样例可校验；缺失输入版本、无验收 ID、非法状态迁移与没有来源的“通过”记录被拒绝。
- 失败/证据：作者可以自行删验收项或重置账本即失败；交付合法/非法样例、验证结果和版本变更规则。
- 边界：只建完成执行与恢复所需字段；无需 GitHub 在线同步或通用工作流产品。

### COS-03 · P0 · 验证指定模型与 pi provider

- 依赖/状态：COS-02、G0、G1；与 COS-04 可并行，共用原子预留或串行付费准入。
- 输出/范围：`probes/provider/` 与验证报告；锁定依赖、真实模型标识、调用/使用量记录及可复现脚本。
- 工作：内置 DeepSeek provider 的多轮工具调用、无工具轮次、文件编辑、出错修复、会话压缩、恢复、取消及截图传递。
- 增补测量：记录首响应、输出用量、工具等待及修复开销，比较串行与有限并发，形成成本和关键路径推算依据。
- 已有证据：[直接 API 探针](../../probes/2026-10-01-deepseek/README.md) 已测工具续接、局部规则、真实失败修复和简单视觉；31 次调用的保守峰值费用 ¥0.721771 已计入共享 ¥150 验证账本。复用这些记录，后续聚焦 pi 接入、明确契约下的配置选择及输出截断处理；不将直接 API 结果写成 pi SDK 已通过。
- 通过：`reasoning_content` 在继续与恢复后符合接口要求；截图和裁剪中的预置缺陷可被记录；真实响应与用量对应指定模型。
- 失败/证据：错误模型、工具结果丢失、恢复报错或取消后继续执行即失败；记录漏检/误报，视觉局限进入验收策略。
- 阻塞边界：失败先定位现有 provider 的缺口，不默认另造适配层；预算不足即停止并提交结论，不静默换模型。

### COS-04 · P0 · 验证原创美术与音频供应链

- 依赖/状态：COS-02、G0、G1；无需等待完整内容名册。
- 输出/范围：`probes/assets/`、资产与来源清单；一个原创角色的待机/攻击/死亡样例、一个背景音乐样例与关键音效样例。
- 工作：事先固定尺寸、锚点、帧序、透明边缘、音频格式及授权要求；测量候选生成、失败重试和导入的实际费用。
- 增补测量：按独立部件、关键姿态、程序图层和付费图片分别记账；验证复用后的角色辨识度，测量可用资产成本和废稿率。
- 通过：动画导入后角色一致、状态切换可读、深浅背景无明显边缘问题；音频可播放且来源/再分发条件清楚。
- 失败/证据：只有静态概念图、无法确认来源、不可再分发音频或价格不可核对即失败；保留导入录像、试听材料和费用记录。
- 阻塞边界：供应商选择以本任务结果固定；不得假定 RTX 3060 6GB 足够完成全部生成，也不得因成本省略已确认音频。

### COS-05 · P0 · 建立 Windows CLI 与通用浏览器工程

- 依赖/状态：G0；可与 COS-03/04 并行，不使用目标游戏专属逻辑。
- 输出/范围：`src/cli/`、`templates/2d/`、启动说明；初始化、运行目录、构建与预览的最小入口。
- 工作：固定初始实施基线的实际依赖与命令；提供精灵、输入、场景切换和调试观测所需的通用能力。
- 通过：Windows 新目录可按说明初始化、构建、启动并由桌面浏览器操控；源码与锁定依赖齐备。
- 失败/证据：依赖作者机器隐含状态、模板预置目标游戏规则或只证明无画面 headless 运行即失败；保留命令输出与浏览器证据。
- 边界：不预制植物、僵尸、波次、商店或关卡表；通用样例不算生成基准成果。

### COS-06 · P0 · 实现最小状态与预算执行器

- 依赖/状态：COS-02、COS-05。
- 输出/范围：`src/runtime/`、`src/budget/`；结构化状态、运行 ID、尝试记录、付费准入、到时/到额停止与摘要导出。
- 工作：分开已结算、在途预留、未知费用；创建运行即固定总额与截止时间，断线和进程重启沿用同一运行记录。
- 通过：模拟并发请求不能超卖额度；余额不足、时限到达、价格/请求状态未知时按契约阻止新增付费工作。
- 失败/证据：修改提示词可绕过限制、重启令计时/费用归零或失败请求被无条件退回预留即失败；提供故障注入记录。
- 边界：先满足短链路，复杂并发与崩溃恢复由 COS-12/13 验证；当前完整额度并不授权透支。

### COS-07 · P0 · 接通运行时角色与独立评审上下文

- 依赖/状态：COS-02、COS-03、COS-06。
- 输出/范围：`src/roles/`、角色工具权限与上下文构造；Cosmos 调度设计、编码、美术及临时评审会话。
- 工作：从一句话经集中提问形成固定需求；派发仅携带相关规则、输入产物、接口与已知失败的上下文包。
- 通过：角色只得到声明的上下文与写入范围；评审读取冻结要求和指定产物，不能沿用作者自评作为通过依据。
- 失败/证据：全部角色共用可篡改验收上下文、文件修改范围冲突未被拦截或无证据自动完成即失败。
- 边界：评审由 Cosmos 主持，不要求新增常设 QA-agent；上下文隔离不声称等于操作系统安全隔离。

### COS-08 · P0 · 建立正常输入驱动的验收链路

- 依赖/状态：COS-02、COS-05；与运行时角色接入可并行。
- 输出/范围：`src/acceptance/`、`tests/acceptance/`；固定浏览器环境、输入脚本、断言、截图/录像与机器可读报告。
- 工作：用玩家可用输入执行启动、操作和状态变化；辅助接口只用于观测和诊断，机制单测与玩家流程分别标注。
- 通过：正常场景可运行；禁用输入、破坏点击响应、制造遮挡/错误数字时，对应检查稳定失败并留下实际/期望结果。
- 失败/证据：直接修改内部状态完成关键试玩流程、仅靠截图相似或作者文字总结判定通过即失败。
- 边界：视觉模型结果与确定性断言分开记录，不把 COS-03 的视觉能力声明当作缺陷检测保证。
- 加速边界：同一生产模拟在固定种子和相同输入下，原速与加速的关键事件、数值、冷却、胜负及存档须一致；鼠标输入、真实动画、音频与帧率另行验收。不能仅快进浏览器时钟来宣称全流程通过。

### COS-09 · P0 · 实现产物登记与代码资产集成

- 依赖/状态：COS-02、COS-04、COS-05。
- 输出/范围：`src/artifacts/`、资产导入与集成检查；任务归属、版本、依赖、来源、接口及交付目录 manifest。
- 工作：验证尺寸/锚点/帧序、音频格式、引用完整性；固定代码与资产组合后才交给评审。
- 通过：合法组合可构建；缺图、错误动作名、过期资源版本与同路径写入冲突均被明确拒绝或进入待处理状态。
- 失败/证据：自动捡取“最新”文件导致不可复现，或集成失败却覆盖上次可用产物即失败；提供集成与拒绝样例。
- 边界：不重做资产生成服务；保留已验收素材供恢复复用。

### COS-10 · P0 · 由 Cosmos 生成真实端到端切片

- 依赖/状态：G2；原组件独立验收complete/closed，[完成评论](https://github.com/lrfluobida/Cosmos/issues/11#issuecomment-5979967185)由Root POST/PATCH/GET精确读回；仍使用全部验证共享的 ¥150 余额。
- 输出/范围：`probes/e2e/` 与独立运行产物；从通用模板出发，由运行时完成有资源、冷却、波次、胜负及重开的一个关卡。
- 工作：串起需求、设计、生成代码/原创动作/音频、集成和独立自动验收；平台实施者不手写该关卡补齐证据。
- 增补测量：拟先在累计不超过 ¥30 的有界探针额内测一组不同机制与一次修复，费用仍计入共享 ¥150 验证账本；按固定开销、机制族、资产类、集成与验收外推，不按关卡数简单线性放大。
- 通过：正常输入覆盖胜利、失败、资源不足、冷却边界与重开；费用和耗时完整，产物可独立启动，人工介入逐项披露。
- 失败/证据：只有预制样例运行、外部手写游戏冒充 Cosmos 生成或缩减验收后过关即失败；保留完整运行链与失败报告。
- 边界：此关通过只证明端到端链路；完整内容清单和最终还原目标保持不变。

- 实际切片证据：原生C8在source `ef4b2ea`生成v1，真实browser090 `media.audioStarted-defeat:false`触发code_defect；一次自动linked修复后v2 build/Edge111/111/0failed/0skip/errors[]及同版本独立codingreview approved，`2026-10-03T18:56:49.570Z`被接受。平台未手改game，原v1失败/旧七案例保留；76请求新增保守峰值估算¥1.549592/shared¥7.008623，937497ms，manual consumed。此组件原条件已独立验收完成，早期pilot失败仍保留，完整经典内容/最终还原目标和用户体验未通过；[最新C8结果](https://github.com/lrfluobida/Cosmos/issues/11#issuecomment-5972584874)已精确读回。
- 组件验收：独立复核原8 gameplay AC、111步正常输入、v1/v2计划与task acceptance一致、构建和同版本review/promotion；Root只读核验76请求均结算、无未知预留。原失败/费用/源码SHA保持；[组件记录](../reviews/2026-10-04-g3-component-acceptance.md)分列实际与模拟证据，不重跑或另付费。

### COS-11 · P1 · 实现受约束的修复与重新规划

- 依赖/状态：COS-10；原组件独立验收complete/closed，[完成评论](https://github.com/lrfluobida/Cosmos/issues/12#issuecomment-5979968242)由Root POST/PATCH/GET精确读回；复用其产物与证据，不无故重新生成。
- 输出/范围：`src/runtime/repair/` 与失败分类、修复交接、无进展终止规则。
- 工作：反馈携带复现、期望、实际、产物版本及验收 ID；分别处理代码缺陷、服务异常、需求冲突和依据不足。
- 通过：预置缺陷可转给正确角色，定向修复经独立复核；重复无进展或预计超限会停下并交付差距。
- 失败/证据：作者删除失败用例、降低容差、无限重试或把缺少依据当代码缺陷绕过即失败；保存每次尝试与费用。
- 边界：重试次数按验证结果固定并写入配置；需求/预算变化由用户决定，常规修复不增加人工签收点。

- 实际有界修复：C8真实v1 code_defect经现有一次repair route新建linked attempt，repair25 SDK请求/449517 micro-CNY，v2原HostAC/Edge111及独立codingreview通过并接受；未删失败用例、改容差、人工改game或增加repair额度。源码原READY/source005f51b/mergee1467f0保持，actualNativeRepairValidation单列；不把这一组件实证扩成全部产品/长时恢复完成，原费用与失败证据保留。
- 组件验收：独立核对真实repair dispatch、linked v2 attempt/当前版本独立review、原AC和计划完全不降级，复用batch05/06失败分类/无进展停止与限额模拟边界证据。当前complete，旧offline-verified-awaiting-live为审批时历史；[组件记录](../reviews/2026-10-04-g3-component-acceptance.md)保留v1失败、实际费用和一次修复边界。

### COS-12 · P1 · 验证取消、异常退出与恢复

- 依赖/状态：COS-06、COS-09、COS-11。
- 输出/范围：`src/runtime/recovery/`、故障注入场景与恢复报告。
- 工作：覆盖生成中取消、落盘前后崩溃、付费请求已发送但返回丢失、已完成产物尚未登记等边界。
- 通过：恢复仅派发未完成工作；核对未知请求后再决定重试，已验收产物保留，费用预留与截止时间连续。
- 失败/证据：取消后继续写入交付、同一结果重复付费、孤儿任务被当成功或预算静默重置即失败。
- 边界：无法核对的请求标记等待处理并保留保守额度；不能由模型猜测成功/失败后继续消费。

### COS-13 · P1 · 验证并行调度与长时执行边界

- 依赖/状态：COS-07、COS-08、COS-12；原组件独立验收complete/closed，[完成评论](https://github.com/lrfluobida/Cosmos/issues/14#issuecomment-5979969151)由Root POST/PATCH/GET精确读回。
- 输出/范围：`src/runtime/scheduler/` 与长链路/并发验证记录；依赖调度、进度摘要与资源限额。
- 工作：注入并行资源冲突、服务退避、长上下文压缩和临近截止时间的运行；保留已通过任务并重派受影响部分。
- 通过：无重复执行和漏任务；并发预留不超额；到时停止新工作并收敛在途任务；用户能据状态继续处理。
- 失败/证据：有任一失联付费任务未记账、失败依赖仍被使用或报告“完成”但证据不齐即失败。
- 边界：可用模拟时钟验证 12h 硬截止边界，但必须标为模拟；少量真实长链路用于测量，不能声称已实际跑满 12h。
- 组件验收：复用已独审batch06/source `cf7d5f63a7df5de45a0fa187b5ed727304bf5344`、merge `d3aab995c8b29a384c389192323c6dfa47cc4f98`：parallel peak2为注入，原生SDK compaction为mock HTTP，12h硬截止为模拟时钟。真实C8为serial、无compaction、937497ms；Root只读确认76unique requests=76settled entries、unknown/reserved0/owner absent，实际长链路未漏账，不声称实际并行或跑满12h。当前complete，旧offline审批状态为历史；[组件记录](../reviews/2026-10-04-g3-component-acceptance.md)列明证据层次。

### COS-14 · P1 · 建立完整基准的运行时验收工具

- 依赖/状态：COS-01 冻结、COS-08、COS-11；前期可按已核实条目编制工具草稿。
- 输出/范围：`benchmarks/classic-pc/`；完整条目与测试映射、模式流程、存档/解锁/经济/交互检查，以及容差断言。
- 工作：分组覆盖冒险、迷你游戏、解谜、生存、花园及外围系统；为无尽制定有限观测窗口、循环和增长规则检查。
- 通过：每个必须条目有验证方式与判定标准，关键玩法有正常输入证据；缺模式、错数值、错存档等预置故障会失败。
- 失败/证据：测试只认文件存在、平均分抵消缺项、仅覆盖新手关或宣称穷尽无尽所有局面即失败。
- 边界：本任务开发验收与运行时输入资料，不为当前实施子代理分配手工实现全游戏的任务。

### COS-15 · P1 · 执行完整基准生成与自动验收

- 依赖/状态：G4（含 COS-18）；单独建立本次成熟运行账本，固定 ¥200/12h 硬上限，不挪用剩余验证额度扩大单次上限。
- 输出/范围：独立 `runs/<run-id>/`；Cosmos 生成完整工程、原创对应资产与音频，执行全部模式/内容的验收和必要修复。
- 工作：分批组织运行时生成任务，集成共享系统与内容，再完成跨模式解锁、存档、经济及长流程检查。
- 通过：固定分母逐项通过，数值/节奏达容差，运行质量达阈值；全过程在硬上限内，证据可追溯到同一交付版本；另行报告 ¥100/6h 优化目标的实际差距，不将其写成已达标保证。
- 失败/证据：触限、缺项、关键断言失败均标记未达标；交付当前可用产物、具体差距、费用、时长和恢复信息。
- 边界：不得预置验证切片的专属产物以移出正式运行计时/计费，不得因成本退回缩小版本；用户决定是否续跑，续跑保留原尝试未达标事实。

### COS-16 · P2 · 验证不同需求的有限迁移

- 依赖/状态：COS-10、COS-13、COS-18；partial/open，真实迁移C1规划失败/C2设计schema失败/C3规划身份失败/C4独立review请求修改/C5编码截止取消/C6编码流请求超时，固定用例与原契约保持；用例先固定，可与完整基准工具准备并行。
- 最新迁移C6：source6b8aa15/UTC2026-10-05T02:50:02.916Z→03:01:25.805Z/deadline03:35:02.916Z，682889ms；13codingauthor admitted、12settled135531µ/1unknown974882µ，shared settled8666261/reserved974882/committed9641143。原C5 design/art两passed及7capture复用通过，planner/design/art SDK0；coding20read/0toolerror，无write/compile/capture/build/browser/review/repair/accepted，manual consumed。当前14cases/rev1942/6delegations/65closed/11audits，未closure12、paid阻塞；[真实结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-5988185221)与[研究记录](../research/2026-10-05-native-c6-stream-timeout.md)。COS59已审源码修时限，COS60只准备新案例，不重开C6。
- 迁移C5（历史）：source9e7f771/UTC2026-10-04T20:11:59.648Z→20:56:55.067Z/deadline20:56:59.648Z/cutoff20:56:54.690Z，2695419ms；66records=65admitted settled+1准入前cancelled/admittedAt null。Role records1/14/12/39/0（coding38admitted+1cancelled）/purpose1planning54author11reviewer；new1117003/shared8530730 micro-CNY（fees16938/255740/166678/677647/0），unknown/reserved0。Design/art原host与独立review passed，mapcheck1passed/rewritesRemaining0；coding截止取消、未handoff/capture/build/browser/accepted/game/repair，manual consumed，exec18517exit1/key清理/owners释放。[实际结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-5984507367)/[研究记录](../research/2026-10-05-transfer-coding-deadline-failure.md)，COS16仍partial/open。
- 输出/范围：`probes/transfer/`；一个区别于塔防规则的小型 2D 需求、运行产物及平台改动记录。
- 工作：使用相同角色契约和通用模板生成，检查需求、代码、素材与验收能否重新组合，不依赖塔防专属编排分支。
- 通过：按事先固定的功能和正常输入场景完成；报告新增的平台通用能力与人工修改，不能预制该游戏再套运行记录。
- 失败/证据：必须手改编排器才能替换核心规则，或调用量超出共享验证余额即记录失败/阻塞并说明原因。
- 边界：付费部分仍计入 ¥150 验证总额，先预留再开展；迁移通过不增加对任意 2D 游戏都能成功的承诺。
- 实际迁移case1（历史）：2026-10-04在71729运行34198ms、planning1 SDK/新增14102 micro-CNY，无game/tasks[]；三planning task缺policyId被strict validator拒绝。当时九cases/rev1421/ledger4/shared7022725/unknownreserved0、closure7仅回原COS16 group未用9985898，父10000000不变。[真实结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-5980291265)与[失败记录](../research/2026-10-04-transfer-planning-failure.md)保留，未通过六T16/八段consumer或human体验，不改frozen契约/新预算。
- C2结果（历史）：真实迁移C2：source c6a9/UTC2026-10-04T14:18:16.191Z→14:22:58.753Z、原deadline15:03:16.191Z，282562ms/15SDK/new161528/shared7184253；planning16206/design145322，art/code/repair0，native planning通过并登记三task。Design attempt8776311e-ac8a-4506-8ffa-6ee36d850051在原generic identifier box state onTarget失败/code_defect；semantic check1 passedtrue/rewritesRemaining0/mapVersioncos16-map-v1，但未publishFrozen/capture，art/coding未开始/无game。Root仅内存副本on-target经原validator通过，实际文件未改；current2 manual consumed/Node19451exit1/credentialCleared/owner释放/unknownreserved0。 COS16仍partial/open，六T16/八段consumer未通过；[最新结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-5981247311)与[失败记录](../research/2026-10-04-transfer-design-identifier-failure.md)保留。
- C3结果（历史）：真实迁移C3：source e8f4d4d/UTC2026-10-04T16:16:36.151Z→16:17:09.564Z、原deadline17:01:36.151Z（本地2026-10-05），33413ms/1SDK/planning14780 micro-CNY/shared7199033 / ¥7.199033，unknown/reserved0。Policy game-design/game-art/game-code及role/AC/deps正确，但taskId局部别名cos20-design/cos20-art/cos20-coding未匹配预声明current grant IDs，strict planner拒绝；registered tasks0/design-art-code-game0。Node56308exit1/credentialsCleared/owners释放、currentC3 manual consumed，原保存回复未改，非SDK账单或browser故障。 最新11cases/rev1495 ledger4/shared7199033/closure9/55closed九audits、COS16 partial/open，[最新结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-5982184956)与[身份失败记录](../research/2026-10-05-transfer-planning-identity-failure.md)保留，frozen契约/预算不改。
- 真实迁移C4：source e609a16/UTC2026-10-04T18:03:20.961Z→18:26:18.115Z、原deadline18:48:20.961Z（本地Oct5），1377154ms/24SDK/new214694/shared7413727 / ¥7.413727；planning14294/design200400/art-code-repair0，unknown/reserved0。Local aliases实际绑定、generic design与transfer map host capture通过；validate-game-design1 passed/errors[]、validate-transfer-design1 passed/rewritesRemaining0/mapVersioncos16-map-v1。独立design review changes_requested，65readonly toolcalls查找capture/.../files/authors/design/*.json，但实际immutable文件为_cosmos/design.json与_cosmos/transfer-design.json。No game/build/browser/art/coding，不改生成文件或自动提升。 最新12cases/rev1602 ledger4/global7413727/closure10/60closed十audits、COS16 partial/open，[实际结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-5983277445)与[路径失败记录](../research/2026-10-05-transfer-capture-path-failure.md)保留。

### COS-17 · P1 · 整理交付与用户最终试玩

- 依赖/状态：COS-18 通过，COS-15 报告与产物就绪；父任务正式关闭还需 COS-16 通过和全部必需验收通过。
- 输出/范围：交付目录、启动说明、源码/依赖、资产来源、客观验收报告、运行账本、已知差距与最终试玩记录。
- 工作：在 Windows 干净目录验证交付可启动，核对报告与实际版本一致；将最终游戏交由用户试玩体验。
- 通过：自动验收全部必须项通过且用户最终认可；用户发现缺陷按原预算/时限和缺陷契约处理，超限先交付现状。
- 失败/证据：最终包无法启动、报告对应其他版本、隐去人工补写或把用户尚未试玩写成认可即失败。
- 边界：最终打包、干净目录启动检查与报告核对计入 COS-15 同一次 ¥200/12h 硬上限，只将等待用户试玩单独记录。即使未达标也交付当前成果与差距；只在用户决定后续跑，不添加中间里程碑试玩批准流程。

### COS-18 · P1 · 接通 Windows 需求访谈与生成运行 CLI

- 依赖/状态：COS-10、COS-11、COS-12、COS-13；作为 COS-15/16/17 的前置，不阻挡 COS-14 工具准备和 COS-16 用例冻结。承接原 R4/R11 与父任务的一句话需求入口；COS-05 的本地工程命令、COS-07 的角色 API 和 COS-10 的固定切片入口不单独构成完整产品入口。
- 输出/范围：`src/cli/`、有界的 `src/roles/interview.ts` 与 `src/roles/requirements.ts` 接线、必要的 `src/runtime/` 主机装配、`tests/cli/` 与相关角色测试、`docs/development/quickstart.md` 和 `roles.md`。需要复用时仅从 `probes/e2e/` 提取通用主机能力，保留固定 pilot 的原入口、输入与验收条件。
- 工作：用户通过 CLI 输入一句游戏需求，由原生 design 角色集中提问、收集回答并形成需求与验收草稿；展示准确版本，保存用户的显式确认与来源，再接通 Cosmos 规划、生成、集成、独立检查和受约束修复。提供对应运行的状态、停止、恢复入口，以及源码、启动说明、验收结果、费用与具体差距的交付位置。
- 复用：沿用 `confirmRequirements`、原生 pi provider、`planTaskDag`、`executeTaskDag`、`RunController`、产物登记、正常输入验收及 COS-11/12/13 成果，不另造执行器、调度器或账本体系。换需求不得要求用户手改编排器或固定 pilot 文件；本任务不预制游戏专属代码与资产。
- 确认边界：确认前访谈须有明确入口；不得为满足现有角色 API 的已确认契约要求而伪造 `confirmed: true`、默认答案或用户身份。缺答、拒绝或退出均不得启动生成；草稿或回答变更后须重新展示并取得确认。复用既有确认时必须保留其真实来源及对应的准确输入版本。
- 预算与阶段边界：付费访谈先预留后调用，计入适用的共享验证 ¥150 或本次生成 ¥200 总额，不得设免费旁路。现有 `RunController.create` 即固定起点和最长 12h 截止，实施时须通过统一账本与明确阶段边界支持确认前费用和确认后计时；不得偷偷创建重置费用的第二个运行。正式生成仍在需求确认且环境准备完毕后开始计时，打包和干净目录启动检查计入原截止时间；状态、停止、恢复不重置运行身份、费用、未知预留或截止时间。¥100/6h 仍是优化目标，追加额度或续跑仍由用户决定。
- 通过：Windows 新目录通过公开 CLI 参数、正常 stdin 回答与确认、停止命令或信号，覆盖输入需求、访谈、展示草稿、确认、生成、查看状态、停止/恢复和交付。至少两种不同 brief 无须修改编排器即可进入各自需求；拒绝确认和修改草稿不能误启动生成；停止后不再派发，恢复保留原账本和截止时间，已通过证据按版本复用，未达标产物如实报告。
- 验证/证据：默认测试注入 provider/host 与模拟时钟，零付费地验证真实命令入口、stdin 流程、确认来源、阶段计费及运行连续性，并保存输出和运行记录；模拟证据不冒充真实生成通过。复用 COS-10 已通过部分的证据，COS-15/16 经本入口完成真实生成与正常游戏输入验收，不为本任务无故重跑付费切片。
- 失败/边界：未确认即生成、要求手改内部配置才能换需求、停止后继续派发、恢复重新计时或把未验收交付标为完成均失败。仅限 Windows CLI，不扩成 Web 应用、账号系统或新产品平台，不改变完整基准分母、原预算和固定验收条件。

### COS-19 · P1 · 修复原生角色交接格式与输出截断处理

- 关联/状态：父任务 #1；关联 COS-07 / #8、COS-10 / #11、COS-18 / #19；当前离线实施，承接原 R4/R5/R12。已发布正文见 [#20](https://github.com/lrfluobida/Cosmos/issues/20)，本卡不把关联任务新增为执行依赖。
- 输入/问题：`cos10-reviewed-validation-1` 在固定平台 `f16c8964530fcab7cf7f9c54f0cd84ef17d4c7a4` 失败。design 已写出 17 条实现说明和 8 项玩法映射，但最终回复含前言与 JSON 围栏，整段解析失败；art 达到 16,384 输出 token 上限，被 SDK 正确拒绝，未写入或检查素材。两项均未进入 capture，通用 `insufficient_evidence` 掩盖具体原因；[失败记录](../research/2026-10-02-reviewed-experiment-failure.md) 保留原结果。
- 输出/范围：集中解析模型消息中的原始 JSON 或唯一明确的 JSON 围栏对象；拒绝歧义、多载荷和不完整内容。磁盘 JSON 继续严格解析，现有字段、权限与验收规则不变。为已知 `PiSessionError('incomplete')` 保存明确、安全的截断诊断，保留已结算费用，禁止执行截断内容或盲目重发。
- 输出配置：兼容地提供作者分角色上限，生产 art/coding 作者为 65,536 token，并鼓励分块写入；真实请求参数与事前费用预留使用同一配置。design、planning、review 及已有显式配置保持原边界；旧试验配置与记录不改。
- 通过：包装格式正确的回复可进入 host 检查；非空 remaining/uncertainty、`approved` 加非空 findings 仍拒绝。损坏或歧义 JSON 不猜测修补；截断有明确原因和费用，不写成完成、不增加隐含重试。额度不足在副作用前拒绝，原费用、请求数和截止约束继续生效；离线检查不代替真实生成通过。
- 验证/工作方式：`role_io_implementer` 负责实现，独立 reviewer 由协调者安排，本批仅 `batch07_merger` 合入。交付定向回归、实际 source commit、独立审查及进度记录；与 COS-18 修复继任任务组分开实施，协调共享 host 工厂配置位置。UTF-8、中文保护和最小修改规则适用。
- 边界：不手工修改模型字段或旧失败结果，不重开已消费实验；本任务当前仅离线实现，后续真实验证须沿用适用账本和明确运行边界。

### COS-20 · 区分开发验证窗口与正式生成时限

- 首例结果：native fixed driver `732f3d1` 获独立 NATIVE_DRIVER_SOURCE_READY 并合入 `92e183a`，公开 flags、原账本 owned workers、完整失败快照/反馈认证与一次 coding repair 已离线接通。主线两个代表 2/2、0 skip 和严格构建通过，显式 probe 类型及真实零模型通用 smoke 证据复用。首个真实 `cos20-native-validation-1` 于 `2026-10-02T11:58:02.694Z` 开始，原定 `12:43:02.694Z` 截止，`11:58:09.818Z` 以 manual stop 结束，7.124 秒、零 SDK 请求、零新增费用；bootstrap/requirements capture 通过，template capture 原子 rename 报 EPERM，guardAborted:false，原因未确定。case 已消费，结果与 marker 保留；当时 #21 为 source-ready-real-startup-failed/open，COS-10 与 G3/G4 未通过。协调者已解除首例 main 冻结，完整安全元数据见 [进度](../../PROGRESS.md)。
- Case2 源码：`b3ab706` 经独立 CASE_TWO_SOURCE_READY 合入 `89085f3`，八个批准路径仅更新独立 `cos20-native-validation-2` 声明、免费准入、相关 fixture/tests 和说明。要求已有 profile 3 的 current case1 已明确停止，COS-21 必须具有精确 WINDOWS_PUBLICATION_SOURCE_READY、已集成状态与 reviewed/merge 两个 main 祖先 SHA，closed 不能绕过；该条件引用已集成源码，不要求 COS-10/COS-20 实际验收先关闭。主线零调用新 claim/历史保持与 case1 未停止拒绝两项 2/2、0 skip；相同依赖的显式 probe/test 类型及其余已通过证据复用。当时 COS-20 为 source-ready-newcase2-awaiting-paid/open，新 case 尚未执行；最终文档 main 清推后冻结，root 完成真实 Windows publisher 免费检查及准确 SHA preflight 后才按原额度执行，结束并明确解除前不改 main。
- Case2 真实结果：准确 `f5522e8` 上于 `2026-10-02T15:39:49.986Z` 开始、原定 `16:24:49.986Z` 截止，`15:46:42.301Z` 结束，412,315 ms；40/40 实际 SDK 请求耗尽，新费用保守峰值估算 ¥0.857751、共享累计 ¥1.974153、预留/未知零。design/art 真实 host 与独立 review passed，coding 7 次请求后下一次被拒，未 capture/build/check_project/browser、无独立 accepted candidate、semantic repair 未 claim。case2 manual stop/结果/marker 已消费，本轮 main 已解冻；COS-20 源码 integrationStatus 为 offline-verified-awaiting-live，liveValidationStatus 为 request-limit-exhausted，保持 open，COS-10、G3/G4 与父完整目标仍未通过，原 case1 对象/费用/时钟/grants 保留。
- Case3 源码实施前记录（历史）：原 40 请求是协调者的有界选择，本次费用与 45 分钟均未到限；上游耗用 33 次后 coding 仅剩 7 次。拟另备独立 case3 version 2/80 请求声明与源级校验，仍守 ¥5/45 分钟、验证 ¥150/首批 ¥30/一次 coding repair；尚未源码批准或付费执行，不修改旧两 case 的 40 次 quotes，不重开已消费案例。
- 结束时间边界补充：已审 `9a91f75` 合入 `58b6e59`，允许同一次正常 stop/event 的真实时间先后差，保留外部 stop 和唯一事件门槛；主线跨时间戳回归 1/1、0 skip。旧 SHA 的免费 preflight 不能作为新 main 的付费准入，仍须最终 native main 重新免费核对。
- 状态/源级前置：已发布 [#21](https://github.com/lrfluobida/Cosmos/issues/21)，源码已就绪，真实启动失败由 COS-21 诊断。前置只要求 COS-06/07/08/09/11/12/13/18/19 对应源码已独立审查并集成，不要求这些任务的全部 live/完整产品验收通过。COS-10 的实际验证是本任务产出，不作为循环前置；[映射](github-issues.json) 分列 sourcePrerequisites 与 validationOutputsFor。
- 已有授权：CONTEXT 的生成运行排除平台开发；R6 的正式 ¥200/12h 与 R7 的开发验证合计 ¥150 分开。沿用用户验证预算、凭据提供及持续推进授权，由可信 coordinator 为更严格的新 case 记录真实 `operator_validation` 决定，不自动套用 formal human quote，不伪造 GameDraft 确认或 run.humanDecisions。
- 输出/范围：同一权威 snapshot/runId/ledgerId 的显式 validation profile、新独立 opt-in driver/声明、定向测试、开发说明与进度；CONTEXT 术语和 ADR 由专属作者另行提交审查。原 start/deadline/stop、费用、请求、任务、allocations 和失败 case 保留；旧 v1、formal v2 及旧实验入口不得自动获得新权限，不使用假时钟或 deadline 投影。
- case 与准入：首例冻结 COS-10 evaluation 输入，固定新 caseId/windowId、准确已审 main SHA、输入 hash 和真实操作授权来源。claim 即消费，重复调用不刷新身份、时钟或计数；旧三个已消费/过期 case 保留。环境、未知费用、writer 未收敛、陈旧 SHA/输入/报价、已 claim、超额或到期均在新副作用前拒绝。
- 预算：本 case 实际加预留增量最多 ¥5、45 分钟、40 次调用、一次语义修复；planning、角色、review、纠错与 compaction 全部计费计数。验证累计首批 ¥30、合计 ¥150 不变；首例仅从原未分配额安排新 grants，不回收旧 allocations。
- 接线：复用 RunController 记账、owner/child、request receipt、createRoleBudget/PilotGuard 准入；每次请求绑定真实 validation case/window，当前时钟明确读取新窗口，原字段保留历史含义。新路径使用固定 evaluation 输入，跳过模拟访谈和自行 `confirmed:true`；规划使用独立真实 grant，不制造 passed planning 阶段。新 art/coding 作者 65,536 输出 token 与 reservation 同配置；旧 probe 显式 16,384 不变。
- 验证/工作方式：先固定窄 profile、授权记录和计费 API，再接 driver；两项分别有专属 implementer/独立 reviewer，仍由 batch07_merger 唯一合入。离线覆盖历史不变、无 fake human proof、case/window 权限、原子 claim/幂等、未知费用/并发/截止拒绝、全调用计数、cap/reservation 一致及旧入口拒绝。源码、离线验证和实际准入全部就绪后才由 coordinator 在原授权内执行；真实报告如实记录通过或失败与费用，不计作完整经典基准或用户体验通过。
- 当前边界：任务发布和本次文档登记不启动付费调用，不改真实账本或旧失败产物。UTF-8、中文保护及 key 不落盘规则适用。

### COS-21 · P1 · 诊断并修复 Windows 产物目录原子发布失败

- 源码审查时进展：`1d03122` 经独立 WINDOWS_PUBLICATION_SOURCE_READY 合入 `99e6d87`，仅修改 registry 原子提交、定向测试和开发说明三个路径。真实 Windows 无 Delete 共享句柄可复现相同 EPERM/rename，释放后原生发布成功；原 case1 的具体占用进程仍未知。仅 Windows EPERM 最多六次尝试、25/50/100/200/400 ms 等待，单调一秒重试派发窗口；每次复核路径、不可变目标、owner 原字节与取消，延迟 timer 或异步 guard 返回后到限不再 rename。主线延迟与不可覆盖两项 2/2、0 skip，类型检查通过；复用作者和独立 reviewer 既有证据，当时状态为 offline-verified-awaiting-live/open。最终 main 的真实项目免费 publisher 检查由 root 执行，fresh case2 尚未运行。
- Case2 前免费实机证据：root 在 `8aced7c`（相同 fixed source `1d03122`）的实际 E: 工作目录用真实 ArtifactRegistry 发布 requirements 三文件、template 四文件；template capture.json 的真实 PS/.NET FileShare.ReadWrite 无 Delete 句柄使首次 rename 报 EPERM，释放句柄并确认 child exit 0/ESRCH 后，第二次原子 rename 成功，capture metadata 存在且 tmp 清空。Node 0.833 秒/exit 0/model 0，原 shared snapshot 字节和 mtime 未变；记录来自协调者安全元数据，未重跑。原 case1 占用来源仍未知，当时 case2 未 claim，保持 open 与原失败历史；本机诊断结果见进度记录。
- 完成证据：root 的真实 case2 已结束，startup、requirements/template captures 和随后 design/art captures 均正常；结合独立已审修复、实际 E: held-handle publisher 和原边界检查，固定共享占用模式的 registry bug 验证完成。integrationStatus 为 `complete`，liveValidationStatus 为 source-and-live-publication-verified，reviewStatus 仍 WINDOWS_PUBLICATION_SOURCE_READY；root 已同步并精确读回 [#22 completed/closed](https://github.com/lrfluobida/Cosmos/issues/22#issuecomment-5956839404)。原 case1 具体占用来源仍未知；case2 因另一请求上限问题失败，COS-10/COS-20 及 G3/G4 未通过，不能把 component 完成视为游戏达标。
- 依赖/状态：已发布 [#22](https://github.com/lrfluobida/Cosmos/issues/22)，为第 21 个原生子任务，现已 completed/closed。源级前置为 COS-09/COS-20 已独立审查并集成的源码；验证产出反馈 COS-10/COS-20，不要求其失败任务先关闭，不形成循环验收依赖。
- 实际失败：首个 native case 的 owned bootstrap exit 0、npm ci 18 packages/5 秒、requirements capture 成功；template capture 在 registry 临时目录向不可变 captures 版本目录 rename 时 EPERM，guardAborted:false。7.124 秒、零模型请求与零新增费用；不能据此确认杀毒软件、文件 watcher 或永久 ACL 为原因。
- 输出/范围：`src/artifacts/` 原子 publication/capture 的最小修复、定向故障复现与回归、诊断报告及进度；host glue 仅在根因证据要求时修改。先进行免费真实 Windows 文件系统诊断，保留能在修复前失败的复现证据，不改全局 ACL 或系统保护。
- 工作：若证据表明临时 FileShare 拒绝，采用有界原子 rename 重试；保持 owner、路径与不可变 destination 检查，遵守 AbortSignal。永久拒绝、目标已存在、取消或达到边界均安全失败，不覆盖已发布版本，不暴露半成品。
- 通过/证据：最小修复经过专属 implementer 与独立 reviewer，固定 SHA 的真实项目 publisher 免费验证通过；临时拒绝恢复、永久拒绝、目标存在及取消的定向证据齐备。成功发布不等同于生成游戏或 G3/G4 通过。
- 前期真实 case 约束：修复及独立审查完成后，另备已审新声明和真实 operator 决定；仍受验证合计 ¥150、首批累计 ¥30、新 case 最多新增实际加预留 ¥5/45 分钟/40 请求/一次 coding repair 约束。当时 case2 尚未就绪，不启动；case1 的消费、失败结果、原日期与费用保留，不重开或改名复用。
- 验证/工作方式：`cos21_implementer` 独立分支和 managed worktree 实施，独立 reviewer 检查实际 diff 与证据；本批仅 `batch08_merger` 合入 main。UTF-8、中文保护、key 不落盘与参考安装只读规则继续适用。

### COS-22 · 验证更高调用上限下的完整原生生成

- 源码进展：`27c81b3` 经独立 VERSIONED_CASE_THREE_SOURCE_READY 合入 `474a6a9`，十个批准路径仅涵盖 version 2 声明、core 类型/版本门槛、case3 准入与相关 tests/fixtures/说明。固定新 `cos20-native-validation-3`、validation-declaration-2/80 请求；version 1 仍最多 40，未知版本和 version 2 的 81 拒绝，旧两 case 的 quote/hash、费用、grants、时钟与消费结果保留。主线版本边界和只读 case3 quote/历史保持代表共 2/2、0 skip，一次源码类型检查通过；作者和 reviewer 已过证据复用，未重复根构建或全流程。
- 依赖/状态：已发布 [#23](https://github.com/lrfluobida/Cosmos/issues/23)，id 5680389595，第 22 个原生子任务，现为 actual-validation-failed-author-handoff/open，源码 VERSIONED_CASE_THREE_SOURCE_READY/27c81b3/474a6a9 保留。源级前置仅要求 COS-20/COS-21 对应源码已独立审查并集成；实际验证产出反馈 COS-10/COS-20，不要求失败的 COS-20 先关闭，不形成循环验收依赖。COS-20 保留 CASE_TWO_SOURCE_READY/b3ab706/89085f3 与独立 case2 失败，COS-21 保留 complete/closed/WINDOWS_PUBLICATION_SOURCE_READY；closed 不绕过准确审批标记与两项 main 祖先 SHA。
- Case3 真实结果：准确 `c78b12c` 上于 `2026-10-03T05:23:54.699Z` 开始，原定 `06:08:54.699Z` 截止，`05:24:45.981Z` 结束，51,282 ms；planning 2/design author 3 共 5/80 请求，新增保守峰值估算 ¥0.068875、共享累计 ¥2.043028、reserved/unknown 零。design 一次 attempt 写出 summary/17 notes/8 AC mapping，最终 1,549 bytes 作者 prose 无 JSON fence，被严格 decoder 以 `Model response requires one complete JSON object` 拒绝；回复包含 remaining/uncertainty 字样，未 host capture 或独立 review，不能声明内容通过。classification 为 insufficient_evidence/early execution，art/coding 未开始，accepted candidate 无、semantic repair 未 claim，非上限耗尽；case3 manual finish/结果/marker 已消费，主线冻结解除，旧两 case 历史与费用保留。
- 失败依据：case2 上游 planning 1/design 8/art 24 合计 33 次请求，coding 仅余 7 次，未到 handoff/capture/build 即耗尽 40 次上限。费用 ¥0.857751 和耗时 6 分 52.315 秒均未触及 ¥5/45 分钟；该 40 次上限是协调者的内部有界选择。
- 输出/范围：新独立 case3 的 version 2 声明、80 次请求准入及源级校验、定向测试和真实结果报告；仅修改必要的声明/入口与校验，不手工完成角色专属游戏代码或资产，不扩大 native/roles 范围。
- 工作/约束：旧 version 1 的 case1/case2 永远保持 40 次及原 quote/hash、费用、grants、时钟、结果和已消费身份；新 version 2/80 次仅赋予新 case3。沿用固定输入、模型、输出 caps、五 grants 总额 ¥21、新 case 实际加预留 ¥5/45 分钟/一次 coding repair、共享验证 ¥150/首批 ¥30，不增加预算或修改旧记录。
- 通过/证据：新源码有专属 implementer 与独立 reviewer，固定 SHA 集成后重新免费核对真实 preflight，可信 coordinator 记录独立 operator 决定并执行；真实 coding handoff/capture、构建、正常输入验收与独立 accepted candidate 均有证据才记录切片通过。源码或局部 host 通过不能代替目标游戏通过；未达标时如实保存失败、费用与差距。
- Case3 执行前边界（历史）：case3 声明和校验已独立批准并集成，当时尚未真实 claim 或付费执行；runtime host/driver、固定输入、模型、角色输出 caps 与既有金额/时间含义保持。已消费 case1/case2 不重开，真实切片未通过，G3/G4 未通过，不扩大正式 ¥200/12h 或完整基准范围。最终文档 main 干净推送后冻结，root 按最新准确 SHA 免费只读 preflight、共享资金准入和真实 operator 决定执行 case3；结束并明确解除前不改 main 的 docs/source/reference。

### COS-23 · 为原生作者交接增加一次只读格式纠正

- 源码进展：`d334c82` 获独立 AUTHOR_PROTOCOL_SOURCE_READY 合入 `d49d132`，13 个批准路径逐字节一致。原 SDK session/attempt 仅一次真正无工具格式纠正，实际禁用 mutating tools，codemode/deferred 仍可调用时拒绝准入；原 purpose/cap/grant/signal 计费，保存原始/响应和作者输出范围签名。中断恢复不重派作者或第二次纠正，已有默认路径保留；源码与离线证据不证明真实设计或游戏通过。
- Case4 执行前同步证据（历史）：[COS-23 源码进展](https://github.com/lrfluobida/Cosmos/issues/24#issuecomment-5966532371) 已由 root 发布并精确读回；源码保持 offline-verified-awaiting-live/open，当时真实 case4 尚未 claim 或执行。
- 依赖/状态：已发布 [#24](https://github.com/lrfluobida/Cosmos/issues/24)，id 5686944546，原生关联父 #1；offline-verified-awaiting-live/open。源级前置 COS-07/COS-20 已审集成源码，验证产出反馈 COS-10/COS-20，不要求失败运行先关闭。
- 输入/范围：case3 的作者交接格式失败、严格 response schema 与已有原生 SDK 会话；保存原始失败回复，最多增加一次真正 SDK 的只读格式纠正，限定必要作者交接代码、测试与说明，不修改游戏或资产。
- 工作/约束：所有格式纠正调用计入同一 paid/request 上限，保留原语义和非空 remaining/uncertainty；不得伪造空未决项、猜测 schema 字段或用人工 JSON 冒充模型产物。通过 pi/SDK 实际关闭 write/edit 等 mutating tools，不能仅依靠 prompt 承诺只读；不增加语义修复次数。
- 通过/证据：固定原始回复、SDK 实际工具权限、费用/请求计数和严格 schema 结果可复查；有效格式仅允许继续真实 host 检查，语义不完整、歧义或第二次格式失败仍失败。源码有独立 reviewer，未来真实 case 另行准入，不重开消费的 case3，不将格式纠正写成内容已验收。

### COS-24 · 归还已停止验证案例的未用任务分配额度

- 源码进展：最终 `ee4ef28`（链 `915f9a5` → `ee4ef28`）获独立 VALIDATION_ALLOCATION_CLOSURE_SOURCE_READY 合入 `98aa9cc`，18 个批准路径逐字节一致。validation-only ledger 3.0.0 追加精确 allocation closures/真实 operator 决定与原子 event，原 amounts、fees、日期/quotes 保留；原 v1/formal v2 不自动升级。新 case 沿 budgetCapacity 使用归还容量，closed 旧 grant IDs 永久拒新派发；真实 closure 与 paid case 仍由 root 在准确已审 main 单独操作，不由 fixture 成绩声明通过。
- 真实免费 closure：root 在准确 `98aa9cc` 于 `2026-10-03T06:52:44.358Z` 应用真实 operator_validation_allocation_closure/coordinator 决定，snapshot revision 338→339、ledger contract 1.0.0→3.0.0；仅关闭 15 个旧 grants 的未用容量，共 62,073,374 micro-CNY，effective allocated 147,596,040→85,522,666，unallocated 2,403,960→64,477,334。费用估算 2,043,028、reserved/unknown 零完全保持，原 run/tasks/三个案例/requests/stop/时钟 DeepEqual；除明确 contractVersion 升级外，原 ledger fields/entries/allocations DeepEqual，events 原 prefix 保持，仅追加一个 event 和 receipt。owner 释放、无 controller lock，Node 6.733 秒/exit 0/model requests 0；source integrationStatus/审批保持，实际 closure 单列为 awaiting-fresh-native-claim，不代表游戏通过。[真实结果](https://github.com/lrfluobida/Cosmos/issues/25#issuecomment-5966532705) 已精确读回，root 明确解除 main 短冻结。
- 依赖/状态：已发布 [#25](https://github.com/lrfluobida/Cosmos/issues/25)，id 5686944963，原生关联父 #1；offline-verified-awaiting-live/open。源级前置 COS-06/COS-20 已审集成源码，产出反馈 COS-20/COS-23，不要求运行任务完成形成循环。
- Closure 前阻塞（历史）：协调者提供当时 allocated 147,596,040 micro-CNY、actual 2,043,028、reserved/unknown 零，unallocated 2,403,960，不足下一个五 grants 共 ¥21 的 envelope。归还对象是已停止案例未花的任务 grant capacity，已结算费用仍累计，不归零或提升 ¥150 总额。
- 输出/约束：追加版本化 allocation closure，仅对已停止、owner/child 已 drain、请求已知并结算的 grants 精确归还未用部分。保留原 allocation amounts、实际 fees、quote/hash、operator 决定、日期与全部历史；关闭的旧 grant ID 永久拒绝新增派发。共享 ¥150/首批 ¥30、新 case ¥5/45 分钟/80 请求/一次 coding repair 保持，不制造追加预算或 human 确认。
- 操作契约：免费只读 closure quote 绑定真实当前源码 SHA、原 snapshot bytes/revision、拟关闭 IDs/amounts、旧案例和 requests；可信真实 operator receipt 绑定准确 quote，变更在原子提交中记录、同操作幂等。陈旧状态、未收敛 owner、在途/未知费用或无法核对的未用额拒绝；未来 paid case 仅由 root 单独准入执行。
- 通过/证据：两链无路径碰撞，联合源码/changed probes/new tests 一次显式 strict noEmit 通过；恢复响应中断、新 v3 case capacity 与 generation scope/额外钱拒绝三代表 3/3、0 skip。作者及独立 reviewer 原 evidence 复用，未重全套、wrapper、80 次循环、Browser 或 child；源码已独立批准，实际 closure 和 paid case 结果另行记录，文档登记不修改真实账本或声明游戏已通过。

- 第五笔真实closure/当时边界（历史）：root在source `2404982d075cf7f69c914eb1ad41e9162807747c` 于`2026-10-03T16:17:34.316Z`应用realcoordinator/operator_validation_allocation_closure；revision1079→1080/ledger3保持，仅新关闭C7五grants/released19,776,886，累计35closed/5audits。Allocated108,715,555→88,938,669/unallocated41,284,445→61,061,331，shared费用5,459,031/unknownreserved0不变；run/tasks/requests/stop/seven histories、ledger entries/allocamounts、旧30closures/4receipts/events-prefix逐项deepEqual。Node3.284秒/exit0/model0/ownerReleased，不清费或刷新旧窗口，当时current为stopped7、新case8未claim；quote/decision精确值见mapping actualAllocationClosure5，前四笔原记录保持。

- 第六笔真实closure：root在C8原source `ef4b2ea2bdd9b867cac6fe9797a56257569d663a`于`2026-10-03T19:04:38.225Z`应用realcoordinator/operator_validation_allocation_closure，revision1413→1414/ledger3保持，仅关闭C8五grants/release19,450,408，总40closed/6audits。Effective109,938,669→90,488,261/unallocated40,061,331→59,511,739，费用7,008,623/unknownreserved0不变；run/tasks/requests/stop/8history/fees/grantamount、旧35closures/5receipts/events prefix逐项deepEqual。3515ms/3.515秒/exit0/model0/ownerfree，不清费用、加预算或重开已manual consumed C8；原五笔保持，quote/decision精确值见mapping actualAllocationClosure6。

### COS-25 · 验证作者只读格式纠正后的完整原生生成

- 首轮源码进展：`be02266a5f171ddc5383e02a55d3e231bb9dbe7c` 获独立 CASE_FOUR_SOURCE_READY 合入 `b3901caf3f3cecd141b1003b3f91e4574cc898c4`，八条批准路径逐字节一致，UTF-8/LF/diffcheck 通过。主线只读历史保持与 source/closure receipt/audit 漂移拒绝两项 2/2、0 skip；相同 base 的作者声明/入口/相关显式 strict 类型和独立五风险代表证据复用，未重复构建、类型检查或 native 流程。
- 最新门槛修复：首次 `15f3375` 免费实际 preflight 被 COS-22 已审源码的 actual-validation-failed-author-handoff/open 状态误拒；零 claim/写入/model，snapshot revision 339 与费用 2,043,028 micro-CNY 保持。原作者最小修复 `bc97d7d191fbd6c03d22d506943f469e9717441c` 经原 reviewer 增量 CASE_FOUR_SOURCE_READY 合入 `403984489725b4272ef8739e86d640cdd86ce1f8`，四路径逐字节一致；仅已知 COS-22 失败态配合精确 marker、唯一记录与 source/merge 双祖先准入，unknown 状态或 COS-23 借用该状态仍拒绝，不改历史失败为通过。真实 public metadata shape 的 RED→2 GREEN 和独立 2/2、0 skip、strict probe/tests 类型证据复用，未重复编译或全矩阵；最新源码已清推，root 在 source403 上实际免费 preflight READY（4.600 秒/model 0、14 项 source approvals、原 bytes/mtime 保持），最终文档 main 仍需新 quote/operator/freeze。
- 依赖/状态：已发布 [#26](https://github.com/lrfluobida/Cosmos/issues/26)，id 5687112557，第 25 个原生子任务；offline-verified-awaiting-live/open、CASE_FOUR_SOURCE_READY。Case4 执行前的源级准入要求 COS-20/21/22/23/24 匹配各自独立审查批准的精确 reviewStatus marker，reviewedCommit 与 mergeCommit 都为冻结 main 祖先，不以泛化“已集成”或失败任务完成状态替代。验证产出反馈 COS-10/COS-20，不形成循环门槛；源码审批保持，case4 已真实失败并消费，见下述 Case4 真实结果。
- 输入/范围：固定新 `cos20-native-validation-4`，沿用 declaration-v2/80 请求、固定 inputs/model/output caps、五 grants 总额 ¥21、case ¥5/45 分钟/一次语义 coding repair、共享 ¥150/首批 ¥30；新 native host 显式设置 authorProtocolCorrections:1。旧三个案例的声明/hash、quotes、40 或 80 次上限、日期、费用、已消费身份和全部历史保持，不重开或手改生成游戏。
- 准入：已有三个案例全部 stopped/drained、请求费用已知，仅精确归还未用任务分配容量后准备免费源码 preflight。每个 author attempt 在原同一 SDK session 内最多一次真正只读格式纠正，通过 SDK 实际关闭 mutating tools 实现；新增实际纠正及 compaction 调用均按原 purpose 计入既有 80 请求和费用硬上限。保留原语义及 remaining/uncertainty，不增加 coding repair，不伪造 human/GameDraft 或语义完整性。
- 通过/证据：准确源码与前置产物先独立审查、集成，root 按最新 main 免费只读核对并记录真实 operator 决定；冻结准确 main 后由 root 执行新 case。真实交接、capture、构建、正常输入验收与独立 accepted candidate 齐备才记通过；失败保留真实费用、结果与差距，G3/G4 和完整目标仍未通过。
- Case4 执行前边界（历史）：case4 入口及 COS-22 源级状态门槛修复已独立审查并集成，真实 allocation closure 已由 root 完成；当时 case4 尚未真实 claim、paid、游戏验收或体验通过。首次免费 preflight 的短冻结已解除，等待最终 main 元数据、最新准确 SHA 重新免费只读 preflight、资金准入与真实 operator 决定，再冻结准确 main 由 root 执行；结束并明确释放前不改 main。旧三案例、真实 closure、当时累计费用 ¥2.043028 与 snapshot revision 339 保持，G3/G4 未通过。
- Case4 真实结果：准确 `b0cf64f` 上于 `2026-10-03T08:06:12.677Z` 开始，原定 `08:51:12.677Z` 截止，`08:06:25.965Z` 结束，13,288 ms；planning 1 个实际请求，新增保守峰值估算 ¥0.011432、共享累计 ¥2.054460、unknown/reserved 零，snapshot revision 345/ledger 3.0.0。startup/bootstrap/template 通过，规划回复 1,396 bytes 严格 JSON、3 roles IDs/完整 10 AC/无环/coding 双前置均合法；host `src/roles/planner.ts:115` 用 gross 168,596,040 > 150,000,000 拒绝，未扣已关闭 grant 未用量后的有效容量 106,522,666 本应合法。design/art/coding 未创建或开始，accepted null、无 semantic repair；未触 80/¥5/45 分钟限制，case4 manual finish/结果/marker 已消费。源码审批 CASE_FOUR_SOURCE_READY/bc97d7d/4039844、offline-verified-awaiting-live/open 保持，实际 failure 单列；root 已核 native PID 30920 dead/exit 1/credentialCleared、锁 absent/owner known closed 并解除 main 冻结，不改模型 proposal 或重开旧案例。

### COS-26 · 让原生规划按已关闭任务后的有效分配容量核算

- 依赖/状态：已发布 [#27](https://github.com/lrfluobida/Cosmos/issues/27)，id 5687873042，原生关联父 #1；offline-verified-awaiting-live/open，6f6960b89daaea3dde9032ae620a76fa7b9ce138 获独立 PLANNING_EFFECTIVE_CAPACITY_SOURCE_READY 合入 409868335cb45ee2f50e065f92ac0f4cd9419208。源级前置 COS-06/07/20/24 已审集成源码，产出反馈 COS-10/COS-20/COS-25，不要求失败运行先关闭。
- 集成证据：五条批准路径逐字节一致，独立六代表及作者六项/strict types 证据复用；与 COS-27 无路径碰撞，联合 strict noEmit 及有效 v3 planner/fresh-core compatibility/case5 只读历史三项代表 3/3、0 skip，不写实际 case5 通过。
- 实际组件证据：真实 case5 planning 通过并继续到 design/art/coding，验证已关闭 grants 后的有效容量核算可用；liveValidationStatus 单列 source-and-live-planning-capacity-verified，原 source marker/SHA/offline/open 保持，组件实测不代替游戏通过。
- 失败依据/范围：case4 原规划结构合法，失败为 host 读取 gross allocations 168,596,040 而未扣已关闭未用容量；有效 budgetCapacity 为 106,522,666，仍小于原 ¥150 上限。仅最小修改原生 planner 的容量基数与必要定向测试/说明，不改模型 proposal、生成游戏、角色额度、旧 ledger entries/allocations 或已结算费用。
- 通过/约束：验证 closure 前后有效容量、旧关闭 grant ID 权限及原 v1/formal v2 预算语义保持；独立 reviewer 检查实际源码与证据后，由本批唯一 merger 集成。局部修复通过不表示实际生成通过；case4 已消费，不重开，原 80/¥5/45 分钟/一次 coding repair 与共享 ¥150/首批 ¥30 不变。

### COS-27 · 验证有效分配核算修复后的完整原生生成

- 源码进展/依赖：已发布 [#28](https://github.com/lrfluobida/Cosmos/issues/28)，id 5687874167，原生关联父 #1；offline-verified-awaiting-live/open，8348495794da8e49bed1129fe4b02a8a920505fb 获独立 CASE_FIVE_SOURCE_READY 合入 0efc5ec905786358dc4d43a646d34c17dbf11b26。七项逻辑/八条物理批准路径（含 case-four 测试重命名为 case-five）精确一致，source 审批保留；case5 已真实失败并消费，actualValidationFailure 单列。源级前置 COS-20/21/22/23/24/25/26 匹配精确 marker 与 source/merge 双 main 祖先，不要求失败任务完成，验证产出反馈 COS-10/COS-20。
- 输入/约束：新固定 `cos20-native-validation-5`，同固定 inputs、declaration-v2/80、model/output caps、五 grants ¥21、case ¥5/45 分钟/一次 coding repair、共享 ¥150/首批 ¥30，新 native host authorProtocolCorrections:1；旧四案例历史、声明/quotes/hash、40 或 80 次、日期、费用和结果保持，不伪造 human 或手写游戏补足失败。
- Case5 执行前准入准备（历史）：root 已于 `2026-10-03T08:45:43.574Z` 通过已有 closure API 仅关闭 case4 五 grants 未用的 20,988,568 micro-CNY，revision 345→346、ledger 3.0.0 保持、closure 共 20/decisions 2，unallocated 为 64,465,902。旧三 case 的 15 closures/62,073,374 不重复归还，费用 2,054,460/unknown reserved 零不变，原 run/tasks/四 cases/requests/entries/allocations/第一笔 closure 与事件前缀保持；Node 3.906 秒/exit 0/model 0/owner released。在 closure2 的上述时点，current 仍是 stopped case4，当时 case5 尚未开始；源码就绪后仍须新准确 quote/operator/freeze，不清零旧 fees 或重派 closed IDs。
- Case5 执行前证据/边界（历史）：源码由专属 implementer 与独立 reviewer，固定版本集成后 root 重做免费精确 preflight/资金核对/真实 operator 决定，冻结最终 main 再执行；当时 case5 未 claim，费用 2,054,460 micro-CNY、snapshot revision 346、20 closures/2 decisions。独立六风险代表及作者证据、一次联合 strict noEmit 与三 pure FS 代表复用；真实角色交接/capture/build/正常输入与独立 accepted candidate 齐备才记录通过，G3/G4 未通过。
- Case5 真实结果：source `8fc7ce5`，quote `vq1-3eec2ee59c21dda34a1d5ea6a0772f8662eec4328179d04c2883cfe7334b6c5f`；`2026-10-03T09:28:05.370Z` 开始、原定 `10:13:05.370Z` 截止、`09:35:55.652Z` 结束，470,282 ms。47 请求新增保守峰值估算 ¥0.901041、共享 ¥2.955501、unknown/reserved 零，结束时 snapshot revision 555/ledger 3.0.0；planning 1/13,572、design 11/160,804、art 11/269,665、coding 24/457,000 micro-CNY。design/art 一次 attempt passed，coding 一次 failed/checkId author_handoff/insufficient_evidence；原 remaining []、两项 uncertainty 指向 host SVG/WAV 实际加载与隐藏 normal mouse occupied/cooldown 场景，误将 host-owned observation 当 author blocking，非 JSON protocol failure。
- 证据边界：真实 coding check_project 记录六次，TypeScript/Vite 检查通过，immutable v1 candidate 已 capture；host verify/browser/独立 coding review 未运行、accepted null/semantic repair 0，不能写 game passed 或人工删除 uncertainty。原 raw proposal/game 保留，case5 manual finish/结果/marker 已消费；parent Node 23096 dead/exit 1/key cleared、controller/registry locks absent，root 明确解除 main 冻结。其后第三笔免费 closure 仅关闭 case5 未用容量，revision 556，不刷新原 deadline 或重开窗口。

### COS-28 · 只读澄清编码交接中的作者职责与主机验收

- 源码进展/状态：已发布 [#29](https://github.com/lrfluobida/Cosmos/issues/29)，id 5688544970，原生关联父 #1；offline-verified-awaiting-live/open。625f4b33d32110a7dbed6f2d3d0bcf3dbe448a87 获独立 HANDOFF_SCOPE_CLARIFICATION_SOURCE_READY 合入 846e94cf558863f9b6829a8b875b0955f1af7938，九条批准路径精确一致、UTF-8/LF/diffcheck 通过。原证据和主线共享 slot 1/1、0 skip 复用；该源码审查时尚无真实 case6 结果，随后 C6 实际 readonly clarification 发生，原三 concerns 完整保留，一项转 summary 后仍两 uncertainty，未因澄清自动通过。源级前置 COS-07/20/23，验证产出 COS-10/20/27，不要求失败运行先关闭。
- 输入/范围：只在 validation 新 coding opt-in 的合法 JSON、remaining 为空、职责 uncertainty 触发原同一 SDK session 的真正只读 scope clarification；短设计最多 300 词先交 root 批准，原始回复/哈希/签名/身份和 durable 状态保留，不修改 actual case5 game 或原回复。
- 约束：format correction 与 scope clarification 每个 attempt 共享 ONE extra provider slot，不额外增加模型/语义 coding repair 权限；实际请求/compaction 按原 purpose 计入既有 80 次和费用。SDK 实际关闭 mutating tools，unknown 费用/中断不得重复付费；原 flag0 和五个历史案例权限保持。
- 通过/证据：不得伪造清空 genuine unresolved/remaining/uncertainty，真正未完成继续失败。澄清仅区分作者职责与主机验收，host 全 AC 与独立 review 不减少，格式或澄清本身不宣布游戏通过；实现、定向证据和独立审查齐备后才由唯一 merger 集成。

### COS-29 · 验证交接职责澄清后的完整原生生成

- 源码进展/状态：已发布 [#30](https://github.com/lrfluobida/Cosmos/issues/30)，id 5688546212，原生关联父 #1；offline-verified-awaiting-live/open。56919a3e4265bfe5d42345c1e5cd32cb8049dd20 获独立 CASE_SIX_SOURCE_READY 合入 89d4fc0ba991bb446139e7e4465b524b5f91e1ee，八逻辑/九物理路径精确一致，源码与原代表证据复用。源级前置 COS-20..28 精确 marker/source+merge 双祖先，不要求失败任务 completed；源码审批保持，实际 C6 已失败并消费，actualValidationFailure/nativeValidationCase6 单列，验证产出 COS-10/COS-20。
- 输入/约束：新固定 `cos20-native-validation-6`，同 inputs/declaration-v2/80/model/output caps/五 grants ¥21/新 case ¥5/45 分钟/一次 coding repair/共享 ¥150/首批 ¥30；新 native caller 显式 codingHandoffClarifications:1，和 format correction 共享一次额外 slot。五个旧案例源码/声明/hash/quotes/费用/日期/40 或 80 次/消费结果保持，不伪造 human 或手改 game。
- Case6 执行前准入/closure3（历史）：root 于 `2026-10-03T10:17:11.499Z` 在 source `8fc7ce5` 免费关闭 C5 五 grants 未用 20,098,959 micro-CNY，revision 555→556、ledger3，closed 总数 25/decisions3；allocated 106,534,098→86,435,139、unallocated 43,465,902→63,564,861，费用 2,955,501/unknown reserved0 不变，旧 prefix 保持。Node 3.836 秒/exit0/model0/owner released；在该时点 Case6 尚未 claim，原 C5 manual-stopped 不重开，后续 guards 检查 prior1..5/current5/25closures。
- Case6 真实结果：准确 `7e51632`，`2026-10-03T11:22:00.263Z` 开始、原定 `12:07:00.263Z` 截止、`11:32:19.891Z` 结束，619,628 ms。66 请求新增保守峰值估算 ¥1.280416、共享 ¥4.235917、unknown/reserved0、snapshot841/ledger3；planning3/23,792、design10/99,404、art22/530,791、coding31/626,429 micro-CNY。design/art 一 attempt passed，coding 一 attempt failed/insufficient_evidence/author_handoff；readonly scope clarification 实际发生，共享 slot 被区分，原三 concerns 完整保留，一项转 summary，仍有胜利 pacing 和是否必须 runtime fetch manifest 两 uncertainty，remaining0。真实作者 TypeScript/Vite 成功、v1 capture 存在，但原 run 没进入 host/browser/独立 coding review，accepted null/semanticrepair0；manual finish/结果已消费，不重开。Node28236 dead/exit1/keyclear/locks absent 后 root 明确解除冻结。
- 独立免费 postfailure 实证：root 克隆原 immutable v1 到本机 `.cosmos/diagnostics/case6-host-diagnostic-61d2d518-1bce-4268-a37e-86fcc6ad7ac7`，以原 host build 与未修改 normal mouse plan 在真实 Edge29728 运行，build passed、111 步 passed/0 failed/0 skip/no errors，约96.4秒正常退出、forcedfalse；原 candidate file list/每文件 SHA 和 shared snapshot bytes 不变，0 model/0 fee。原生生成候选游戏实际完成固定玩法诊断，包含胜利/失败可见状态；这是独立诊断，不 resume/promote 或改 C6 failed/consumed，不等于正式 native run accepted、独立 code review 或完整 classic benchmark，诊断耗时不并入旧声明结果。
- Closure4 前边界（历史）：C6 原 run 结束时 snapshot841/费用4,235,917/unknown reserved0，三 closures/25 grants 保持，C6 潜在unused19,719,584 尚未归还；当时 COS30 未 READY，case7 尚未登记。随后 root 第四次免费 closure 仅关闭 C6 五 grants，原 paid failed/consumed 与 free111 证据不变，未清费、刷新时钟或新 claim。
- 第四笔真实 closure/当时边界（历史）：root 在 source `7e51632` 于 `2026-10-03T14:22:19.998Z` 应用 real coordinator/operator_validation_allocation_closure，revision841→842/ledger3不变，只新关闭 C6 五grants/released19,719,584，总closed30/four decisions；allocated107,435,139→87,715,555，unallocated42,564,861→62,284,445，费用4,235,917/unknown reserved0保持。所有原run/tasks/sixcases/times/quotes/operator/human/artifact refs、旧ledgerfees/allocamounts、25closures/3audits/events prefix原样。Node5.021秒/exit0/model0/owner released，free postdeadline 不复活旧run或追加¥150；root解除短冻结。当时 COS30/COS31 source仍未READY，case7仅issue/ownedauthor已登记，未实际claim/paid，G3/G4/体验未通过。

### COS-30 · 用主机证据和独立评审处理编码交接未决项

- 依赖/状态：已发布 [#31](https://github.com/lrfluobida/Cosmos/issues/31)，id 5689492852，第30个原生子任务、父 checkbox 已核对；offline-verified-awaiting-live/open。`90e4557e8e31fd48081613fbcc5da4651557e906`（父 `e6993c3ccee7c10a38d104d9dfd3e847dafbcc26`）获独立 HOST_EVIDENCED_HANDOFF_SOURCE_READY，合入 `8d23a9e8319a7d1b235e1c0abaa6ba0a7ea10e62`，十二批准路径精确一致、UTF8/LF/中文/diffcheck通过。source 前置 COS-07/08/20/23/28 已审集成源码，验证产出 COS-10/COS-20/COS-29，不要求失败任务完成形成循环；[公共进展](https://github.com/lrfluobida/Cosmos/issues/31#issuecomment-5970378743) 已精确读回。
- 工作方式/范围：专属作者先 ≤300词设计交 root 审阅，再实现新 validation-only coding explicit opt-in；不授予六个旧案例新权限。只在 strict 原 remaining0 后 capture 固定版本，保留完整原 concerns，包括已转 summary 的内容，再执行全部原 host AC/additional checks，即使 uncertainties pending；genuine unfinished remaining 仍立即失败，不改 old case6 game 或 raw proposal。
- 通过/证据：只有实际全部 host 检查和独立 coding review 对每项 concern 提供绑定当前版本、准确 ID/ref/evidence 的 ConcernResolution，才可记录通过。漏项、错 ID/ref/version、未解决或 durable 证据不足一律失败；不可自动清数组、降低 AC/review 或用免费 C6 诊断替代新版本证据。
- 失败/约束：host 真失败且 code_defect 可沿既有一次 coding repair，未决语义不能伪装成已修复。不增加 semantic repair，不向作者另起 LLM clarify loop，不手改游戏；未来新 case 单独获得准确 source/main/preflight/operator/freeze 后执行。独立增量4/4、7.26秒及作者集中类型/受影响单测复用；主线只跑编码完成、concern resolution 和独立 verdict 单次原子发布 pure FS 代表1/1、0skip（1223.9ms），未重compiler/大矩阵/48秒driver。源码批准不表示nativeCase7通过；COS30 集成时 caller 尚未独批的状态仅为历史，后续审批见 COS31。
- C7路径证据（历史）：C7原coding两uncertainties经scope澄清仍保留，真实build/v1capture后已进入host/browser，证明新host证据路径实际被调用；browser第005步失败、后续skipped、没有独立codingreview/accepted，不能记全部HostAC或逐项ConcernResolution通过。原source marker/source/merge/offline/open保持，失败单列在COS31。

- C8实际接受证据：原生v2全部Host/Edge111计划通过、同版本独立codingreview approved并promotion；host证据路径在新C8完成，C7只进入browser但失败的历史仍保留。Source marker/source/merge/offline状态不改，actual live status单列，不把bounded slice接受视为完整经典或用户体验通过。

### COS-31 · 验证主机证据驱动的完整原生生成

- 依赖/状态：已发布 [#32](https://github.com/lrfluobida/Cosmos/issues/32)，id5689873259，第31个原生子任务、父checkbox已读回；offline-verified-awaiting-live/open。`8a07e66d065ba6ddec719ea29e6b519898276c23`（base `8d23a9e8319a7d1b235e1c0abaa6ba0a7ea10e62`）获独立 CASE_SEVEN_SOURCE_READY，合入 `21218fd0624034f6d8abad38bd7de2cc8341606c`；这是执行前源码审批，[公共源码审批](https://github.com/lrfluobida/Cosmos/issues/32#issuecomment-5970626041) 已精确读回，实际C7失败另列。Source前置COS-20..30为独立已审集成源码，精确approval marker及reviewedCommit/mergeCommit双frozen-main祖先，不要求failed任务closed；产出反馈COS-10/COS-20。
- 输入/约束：newfixed `cos20-native-validation-7`，declaration-v2/80/同9inputs/model/outputcaps/五grants¥21/newcase¥5/45分钟/一次codingrepair/shared¥150/首批¥30保持；nativepolicy强固定 authorProtocolCorrections:1、codingHandoffClarifications:1、hostEvidencedCodingHandoff:1。旧六cases/声明/hash/quotes/40或80/日期/费用/permission保持，不修改原C6game或用free111改其accepted状态。
- Case7执行前准入/证据（历史）：当时Current为manual-stopped6、prior1..6均停止收敛，30closed grants/four真实closure记录精确认证；COS29 CASE_SIX_SOURCE_READY及COS30 HOST_EVIDENCED_HANDOFF_SOURCE_READY 精确审批/source+merge双SHA须通过，SOURCE_NOT_READY不准执行。Source30接口、caller和新decl均已独审集成；复用作者31focused与唯一strict noEmit、独审tempFS6/6/0skip，九逻辑/十物理批准路径字节一致、UTF8/noBOM/LF/diffcheck通过，联合固定声明/opt-in policy代表1/1/0skip（1.7087ms）。当时最终文档批准后root fresh exactmain quote/资金/operator/freeze再执行。
- Case7实际结果：source `2404982d075cf7f69c914eb1ad41e9162807747c`，UTC`2026-10-03T15:47:24.285Z`开始/原定`16:32:24.285Z`截止/`15:56:47.389Z`结束，563,104ms；54calls=planning1/design10/art17/coding26/repair0，费用micro-CNY=15,106/113,027/526,943/568,038/0，新增1,223,114/shared5,459,031/unknownreserved0/snapshot1079/ledger3。design/artpassed、codingbuildpassed/v1captured、scope澄清后两uncertainties保留且host/browser已进入；111plan前三checks和startinputpassed，第005步“准备开始”!=“防守中”failed，后续skipped。pageerror指出`[data-testid="wave"]`缺失，原index strong只有id="wave"而hud.ts要求data-testid=wave；报告3错误/局部boundedDeadlineError/Edgeforcedexit，diagnosis insufficient_evidence，无独立codingreview/repair/accepted，不是111passed。Node32584/Edge31536 dead、exec27393 exit1/keyclear/锁absent后root解冻；closure5只归还未用容量，费用及旧六案例不变。
- C7结束时通过/边界（历史）：全部原HostAC/additionalchecks、按每个concern绑定当前版本证据的独立review、normal input/accepted candidate齐备才写native通过，不以旧free诊断或fixture代替新版本证据。当时源码审批保持，C7失败已停止、不重开或手改原game，新case8未claim；G3/G4与完整classic/用户体验仍未通过。

### COS-32 · 区分游戏断言超时与浏览器故障并触发有界修复

- 依赖/状态：已发布 [#33](https://github.com/lrfluobida/Cosmos/issues/33)，id5691425244，第32个原生子任务、父checkbox/原生关联已精确读回；offline-verified-awaiting-live/open。独审 BROWSER_DEFECT_CLASSIFICATION_SOURCE_READY 批准 `af883ba936806003034ea5015dfc3d1ce11939a8`（父 `2031bd073cb3ecd126c875daa7194ee1957fd0af`），合入 `bc24755518abe5c2f8c02e6fbf1add6414c72f33`；source前置COS-07/08/11/13/20/30为独立已审集成源码，验证产出COS-10/COS-20/COS-31，不要求失败任务closed。 [公共源码审批](https://github.com/lrfluobida/Cosmos/issues/33#issuecomment-5972022726) 已精确读回。
- 输入/范围：C7实际第005步失败、HUD selector缺失、局部等待超时与强制退出记录；作者先≤300词设计交root审阅，再以TDD修runner/diagnostics的失败分类与既有有界repair路由。原C7生成文件及报告保持，不手改旧游戏。
- 通过/约束：区分游戏断言超时和真实浏览器故障，保留足以判断原因的pageerror/步骤/进程证据；可判定的游戏缺陷反馈沿已有一次coding repair，不能因清理时强制退出而抹掉已有游戏错误，也不将真实浏览器/基础设施故障假归为已修复。原HostAC、独立review、金额/请求/截止和unknown费用守卫保持，不新增semantic repair或把部分计划写为通过。
- Case8执行前源码证据/边界（历史）：四批准路径逐字节一致、UTF8/LF/中文/diffcheck通过；复用作者23pure、首P2修正10pure、termination20/shared6、两不同真实Edge fixture各1/1及初次/增量types证据，独审增量6/6、2.92秒、0skip/exit0。联合仅运行局部观察race归类代表1/1、0skip（7.2949ms），未重复Edge/compiler/长driver。两实际保存报告在新可信事实下诊断为code_defect（1），原C7保存报告仍为insufficient_evidence（2）；原C7失败、费用和closure5不被回写，新case8仍须caller自身独审、最终metadata/preflight/operator/freeze后才能执行。

- C8实际组件验证：真实v1 browser090音频断言失败被归为code_defect并触发既有一次自动repair，v2原111步与独立codingreview通过、accepted；说明可归因游戏缺陷的反馈/修复链已实测。Source BROWSER_DEFECT_CLASSIFICATION_SOURCE_READY/af883→bc247/offline/open保持，原C7 insufficient_evidence仍保留，不追改旧report或game。

### COS-33 · 验证浏览器缺陷反馈后的完整原生生成

- 依赖/状态：已发布 [#34](https://github.com/lrfluobida/Cosmos/issues/34)，id5691425850，第33个原生子任务、父checkbox/原生关联已精确读回；offline-verified-awaiting-live/open。独审 CASE_EIGHT_SOURCE_READY 批准 `d5df6e3d7ed8258356af4316d496acdb5e1f99c9`（base `bc24755518abe5c2f8c02e6fbf1add6414c72f33`），合入 `887d51459ef8e5b55a9ed10a6f83a45fd6017567`；source前置COS-20..32的精确审批marker/reviewedCommit/mergeCommit均须独立已审并为冻结main祖先，验证产出COS-10/COS-20，不要求failed任务完成关闭。 [公共源码审批](https://github.com/lrfluobida/Cosmos/issues/34#issuecomment-5972107850) 已精确读回。
- Case8执行前输入/范围（历史）：固定全新 `cos20-native-validation-8`，沿用declaration-v2/80、同9inputs/model/outputcaps、五grants合¥21、新case¥5/45分钟/一次codingrepair、shared¥150/首批¥30；当时prior1..7已停止，35closed grants/五笔真实closure记录须精确认证，COS31/COS32及caller源码已独审集成，尚未claim或paid。
- Case8执行前源码准入（历史）：pureFS声明、caller和七历史/35closures/五audits/source门槛已独审通过；作者31focused与唯一strict7.202秒/importClosure exit0、独审6/6/0skip（71.592秒）复用。八逻辑/九物理批准路径（含test git mv）字节一致、UTF8/LF/中文保持/diffcheck通过，authorProtocolCorrections/codingHandoffClarifications/hostEvidencedCodingHandoff 均保持1，host文件原字节保持；联合固定声明代表1/1、0skip（2.0592ms），未重矩阵/compiler/Browser。最终docs批准后root用准确finalmain做免费preflight/资金核对/真实coordinator决定并冻结，再执行；全部原HostAC/additionalchecks、逐concern当前版本证据的独立review与normal-input/accepted candidate齐备才记通过，保留真实失败与有界repair证据。
- Case8实际结果：source `ef4b2ea2bdd9b867cac6fe9797a56257569d663a`，UTC`2026-10-03T18:41:12.207Z`开始/原定`19:26:12.207Z`截止/`18:56:49.704Z`结束，937497ms；76calls=planning1/design9/art19/coding22/repair25，micro费用13588/112966/338470/635051/449517，新增1,549,592/shared7,008,623/unknownreserved0/snapshot1413。Design/artpassed，coding v1 browser090 `media.audioStarted-defeat:false`真实code_defect失败；一次新linked repair后v2 build/Edge111/111/0failed/0skip/errors[]、PID464 forcedfalse/exitedtrue、同版本独立review approved并promotion。AcceptedAt18:56:49.570Z，project准确`registry/candidates/cos20-native-validation-8-game/v2/project`，reviewer/context/attempt精确ID见mapping；原v1失败保留，没有平台人工改game。Nativeexec12527exit0/Node26584dead/Edgegone/keyclear/shared与registryownerabsent后root解冻，manual consumed；closure6仅归还未用容量，旧七案例/费用前缀保持。[C8及closure6公开结果](https://github.com/lrfluobida/Cosmos/issues/34#issuecomment-5972585087)已精确读回。
- 当前边界：原源码审批与offline/open保持，actual native bounded单关已接受v2；不重开C8或手改原game，完整classic/最终还原目标、G4和实际用户体验尚未通过，COS10/11/13组件已独立验收closed，G3沿原closed-only条件自然满足。C7失败/C6 free111及旧历史保持，source34正式generation决定入口不能把validation C8当用户体验认可。

### COS-34 · 持久化最终用户体验决定并绑定交付版本

- 依赖/状态：已发布 [#35](https://github.com/lrfluobida/Cosmos/issues/35)，id5692013242，第34个原生子任务、父checkbox/原生关联已精确读回；offline-verified-awaiting-live/open。独审 USER_EXPERIENCE_DECISION_SOURCE_READY 批准 `02243f6362168af9ddef3dcec878e0b10e590899`（父 `dab20b210159617f16279f06a8725159318f5d27`），合入 `5d4d1d478aefce9fcde6254359edee906a551213`；source前置COS-08/11/18的已审集成源码，COS18仅部分源码就绪，不要求其任务closed；产出反馈COS-18/COS-17/COS-15，补既有COS18/R17缺口，不扩大产品范围。
- 范围/已审方案：作者先≤300词设计交root批准，再pure TDD实现正式generation最终体验决定；用户只显式approve/reject/cancel，host内部绑定准确交付hash、report/current candidate/attempt及独立review，使用owner短锁和一次性write-once receipt，保留等待用户体验阶段。Validation案例不作为最终用户体验确认，决定入口不调用模型、费用为零。
- 通过/约束：持久记录真实用户的明确决定及其对应交付版本，恢复和状态读取保持同一身份/来源；缺少当前版本的客观验收或独立review、错版本或不可持久化不得冒充认可。Reject/cancel不写最终体验通过，不以fixture、coordinator授权或model输出伪造human决定；等待用户试玩单独记录，原费用/截止/预算不重置。
- 源码证据/当前边界：九批准路径字节一致、无碰撞、UTF8/LF/中文/diffcheck通过；作者5groups/61affected/初次strict7.107秒、取消修复7pure2.346秒/4path strict6.689秒及独审增量5/5/583ms/zeroFee复用。联合仅legacy两参数receipt/取消代表1/1、0skip（17.6295ms），未重61/types/Browser。实际human NONE，等待真实正式generation的版本绑定体验决定，不把C8自动通过、只读预览或fixture当用户已看到/认可；父完整目标、classic/G4与用户体验未通过。[公共源码审批](https://github.com/lrfluobida/Cosmos/issues/35#issuecomment-5972864380)已由root发布并精确读回。

### COS-35 · 为通用浏览器 host 绑定共享验证窗口和角色额度

- 依赖/状态：已发布 [#36](https://github.com/lrfluobida/Cosmos/issues/36)，id5692927967，第35个原生子任务、父checkbox/原生关联已精确读回；offline-verified-awaiting-live/open。独审 SHARED_VALIDATION_BROWSER_HOST_SOURCE_READY 批准 `bc352be3e62d02f594f4fed55197b5be921f72e9`（含 `d5e6e6e996883c18bd279f7e2e3bf1bfd1f3141b`），合入 `e806020d055ea0a1641849154aea971f796b9c2b`；source前置COS-07/08/18/20/23/28/30/32为对应已审源码，COS18沿partial source stage，不要求任务closed；输出反馈COS-16/COS-18。
- 范围/工作：作者先设计再pure TDD，把通用browser host的角色SDK调用绑定同一共享验证窗口、原角色grant与费用/截止/取消守卫，沿用已审作者纠正、交接职责、host证据和缺陷反馈能力。只准备通用平台能力，不写迁移游戏或地图到template、不启动paid。
- 预算/通过边界：沿用COS16原10,000,000 micro-CNY（¥10）、shared¥150/首批¥30及原计时约束，不为新issue各添预算或刷新旧clock。Source独审可证明绑定与fail-safe，迁移实际仍缺同profile真关进程重开和入口；新实际window以后由root单独准备准确source/quote/operator，当前不claim。
- 源码证据/审批时边界（历史）：九批准路径字节一致、无碰撞、UTF8/LF/中文/diffcheck通过；独审增量5groups/7.211秒/exit0验证合法planning read无需DAG/fee、错role/task/write与已创建toolsource漂移拒绝、错repair role/output不占slot、feedback篡改拒绝后合法coding绑定可repair。作者5pure/3defaults/affectedstrict、修复3RED/GREEN与一次完整synthetic repair/review/promotion证据复用；联合仅合法planning read before task registration代表1/1、0skip（266.2969ms），未重groups/strict/Browser。Generation默认行为保持，实际迁移仍缺跨host重开、新driver/运行时map和真实profile/window；preparation_only/not_executable，不把fixture当迁移通过，C8字段保持。

### COS-36 · 绑定运行时推箱子设计与可信鼠标验收计划

- 依赖/状态：已发布 [#37](https://github.com/lrfluobida/Cosmos/issues/37)，id5692928479，第36个原生子任务、父checkbox/原生关联已精确读回；offline-verified-awaiting-live/open。独审 TRANSFER_DESIGN_BINDING_SOURCE_READY 批准 `d862f7747826dd0bc82b80e7fce6c9c04bdce69d`（base `5d4d1d478aefce9fcde6254359edee906a551213`），合入 `dbe86ea42e408f0c32785f98247357a54c185cc6`；source输入COS-02/08、COS14 draft、COS16 frozen contract、COS18 dynamic partial source；输出反馈COS-16/COS-18，使用sourcePrerequisites/范围说明，不要求这些完整任务closed形成循环。
- 范围/工作：作者先设计再pure TDD，把运行时真实推箱子design与冻结迁移契约、可信artifact身份/版本及正常鼠标验收plan绑定；不能把模型任意计划直接当验收标准，不把游戏/地图预写到template，不用fixture冒充运行时生成或真实迁移。
- 预算/通过边界：同COS16原¥10/shared¥150/首批¥30和已冻结的原时钟约束，只做平台准备，不创建paid窗口或追加任务额度。真实迁移还需共用profile的关进程/重开及动态入口证据，新实际window由root以后单独声明/准入。
- 源码证据/审批时边界（历史）：六批准路径字节一致、无碰撞、UTF8/LF/中文/diffcheck通过；独审5/5涵盖oracle/restore/suffix/mapv1v2/registry篡改与原README8287bytes前缀，作者6/6（1040.6669ms）/strict6.790秒exit0复用。联合仅保持六AC、正常buttons/saved expectations及不可用process checkpoint的binding代表1/1、0skip（409.8785ms），未重matrix/compiler/Browser。仍为preparation_only，T16-05/06 not_executable，无真实迁移/paid，完整classic/最终还原目标、G4及实际human未通过。

### COS-37 · 通过隔离 profile 和同 origin 验证真实浏览器进程重开

- 依赖/状态：已发布 [#38](https://github.com/lrfluobida/Cosmos/issues/38)，id5696255260，第37个原生子任务、父checkbox/原生关联已精确读回；offline-verified-awaiting-live/open。独审 PERSISTENT_PROFILE_PROCESS_REOPEN_SOURCE_READY 批准 `b936020a1abdcd738998d660e7d0b57eb2637be6`（含 `e9912b8376fbcc74b79ebafd289a844dcc5cde8e`、base `dbe86ea42e408f0c32785f98247357a54c185cc6`），合入 `3f2a9420acf53a6a62a5b904cf7a73160b14f80a`；source前置COS-08/12/32/36对应已审components，输出反馈COS-16/COS-18，不要求完整任务closed。
- 范围/工作：作者先≤300词design再实施隔离profile、同origin的真实浏览器进程关闭/重开checkpoint；默认runner32不退化，不能用reload或storage injection冒充恢复。只使用作者自己的synthetic temp profiles/browser fixture，按root排程验证，不访问用户browser profile、Root私有案例或原game，不调用model/paid。
- 源码/fixture证据：12批准路径字节一致、无35/36碰撞、UTF8/LF/中文/diffcheck通过；复用独审初始5pure/增量2 context blocker/await及pinned policy字节匹配。作者正常Edge27860→29284/default31540正常exit和webm/PNG/log、SW修复9864→26576正常exit/同profile同origin/four warning/首与重开parent+iframe四register阻断、0 SW/controller/request证据复用；strict/pure与旧normal/source32证据复用。联合仅pinned blocker before page scripts pure代表1/1、0skip（5.6615ms），未再跑真实Edge/矩阵/compiler。
- 审批时预算边界（历史）：仍是COS16平台准备，沿用原¥10/shared¥150/首批¥30和旧时钟，不新建ledger、续旧预算或创建实际window。Fixture验证隔离profile/同origin真实进程重开能力，T16-05 consumer可在源码就绪后执行，但fixture不是Cosmos生成游戏或实际迁移通过；runtime adapter/付费入口及真实运行仍未齐备，T16-05/06实际迁移证据未形成。C8接受v2、旧八历史/费用7008623/40closed/6audits和actualhuman NONE保持。

### COS-38 · 连接运行时关卡设计与固定角色输入

- 依赖/状态：已发布 [#39](https://github.com/lrfluobida/Cosmos/issues/39)，id5696791572，第38个原生子任务、父checkbox/原生关联由root实时REST精确读回；offline-verified-awaiting-live/open。独审 TRANSFER_RUNTIME_INPUT_ADAPTER_SOURCE_READY 批准 `03772ff0561de97a4ada0689c03b71bf10f7503f`（含 `5ca2d8e6f9c66b23df02f8607bed88bb760e7d9b`），合入 `5d7a99217c2448be74d2c6cb18280d8abeac4e8c`。保持最终input adapter scope，不采用旧完整consumer范围；source输入COS-35/36/37已审对应源码、COS16 frozen contract与COS18 partial source，输出反馈COS-16/COS-18，不要求完整任务closed。
- 输入连接范围：规划前保留四个design输出引用，运行时map经已审oracle验算、冻结两版本计划；design capture和角色固定inputs/依赖/独立review journal绑定实际输出版本，current-candidate plan选择及staged bytes须准确匹配。先固定可信host拥有的stable loopback origin，保留完整ExecutionRequirement与stage：真实HumanRequirement确认来源或ValidationRequirement的operator/current case/window/source/hash，不构造human confirmedBy，不静默修改已登记任务输入。
- 阻断/后继边界：本项仅运行时设计与固定角色输入adapter。Persistent/media实际consumer、machine phase facts/diagnostics接线、design semantic revision及actual entry仍待后继；未接consumer的prep候选必须failed/insufficient_evidence，不fallback/pass/promote，不把格式纠正当地图语义修复。
- 源码证据/审批时状态（历史）：12批准路径字节一致、无39碰撞、UTF8/LF/中文/diffcheck通过；独审2/2/0skip/exit0（17.029秒）、作者19initial/default3/strict、增量4tamper+normal5/5+v1/v2group1/1/strict证据复用，fullgate沿原TaskJournal signatures、不新schema。联合仅current-candidate v1/v2准备plan/deps绑定一组代表1/1、0skip（13965.4067ms），未scope/tamper矩阵/Edge/compiler。仍为preparation_only/not_executable、零paid，不改真实八案例/ledger/caps；COS16原¥10/shared150/首30与旧时钟、C8/closure6/actualhuman NONE保持，迁移另待完整consumer/有界设计修复和实际入口。

### COS-39 · 记录持久浏览器失败事实并保守分类

- 依赖/状态：已发布 [#40](https://github.com/lrfluobida/Cosmos/issues/40)，id5696864882，第39个原生子任务、父checkbox/原生关联由root实时REST精确读回；offline-verified-awaiting-live/open。独审 PERSISTENT_FAILURE_FACTS_SOURCE_READY 批准 `47d82443838cdf713ef08ff91811ca7bd4d735eb`（含 `573450e858d740380694fb3cef6673b6754cccbf`），合入 `bf6d78d124a6977ea5fc2fd7ca37e4dfe8c9f0be`；source前置COS-32/37已审对应源码，输出反馈COS-16/COS-18后续actual consumer，不要求完整任务closed。[公共源码审批](https://github.com/lrfluobida/Cosmos/issues/40#issuecomment-5977698439)已由root POST+GET精确读回。
- 范围/工作：受控phase/error packet、persistent raw/evidence与owned exit核对，probe保守聚合复用Source32；不修改COS38 host/binding/wrapper，不连接media/actual entry。仅四source/test路径与计划范围，不因缓存旧正文拓为完整consumer或新增修复授权。
- 分类/边界：legacy、坏facts、unknown、global deadline、cancel、binding变化或exit证据不足均insufficient_evidence；真实early settled mismatch可code_defect，但完整series仍failed，不制造未执行witness或丢掉原始失败证据。只保守记录和分类，design semanticrevision/完整persistent媒体consumer与付费入口留后继。
- 源码证据/审批时状态（历史）：五批准路径字节一致、无38碰撞、UTF8/LF/中文/diffcheck通过；nested exception.sourceURL coercion P2由strict schema关闭，独审增量2/2/0skip（3074.0187ms），作者12probe/17jointpure/strict证据复用。联合仅nested exception types/declared error fields分类代表1/1、0skip（140.2498ms），未Edge/大matrix/重复compiler。仍零paid/preparation_only/not_executable，实际迁移/human NONE；不读Rootprivate/触preview，不改八案例/费用/caps/旧时钟，C8接受v2/旧七失败/C6free111/closure6保持，不新增修复或实际window授权。

### COS-40 · 接通持久浏览器与生成媒体的完整验收

- 依赖/状态：已发布 [#41](https://github.com/lrfluobida/Cosmos/issues/41)，id5697434114，第40个原生子任务、父checkbox/原生关联由root REST精确读回；offline-verified-awaiting-live/open。独审 TRANSFER_PERSISTENT_MEDIA_CONSUMER_SOURCE_READY 批准 `6192b92efdf106941963ecdda2b66a3a34d2cddd`（含 `7d59adc57cb14beb93c632b36c7881dd45b7c5b6`），合入 `ea0971b2c1605000e86d7f7fd552aac715880339`；source输入COS-35/36/37/38/39已审对应源码、COS16 frozen contract与COS18 partial source，outputs16/18，不以完整任务closed造循环。 [公共源码审批](https://github.com/lrfluobida/Cosmos/issues/41#issuecomment-5979024302)已由root POST+GET精确读回。
- Consumer范围：仅可信host显式opt-in，actual candidate build后挂载original stable origin，接八段persistent consumer/Source39保守diagnostics/生成media readonly样本union；loadedFrame取max而非sum，bool取OR且须带真实witness。提前冻结真实task IDs并兼容legacy default，不修改IR/200steps/sixAC；default prepared failed/no fallback保持，不允许模型换验收器/profile/origin。
- 验收/修复边界：exact independent review/proof/promotion绑定同一候选，沿原唯一coding repair权限，v2仍使用同map/等价期望；collector坏packet/null/env/缺exit都insufficient_evidence，健康全系列结果为false才可按可信事实归为coding defect。保留原OwnedWork envelope/controller tickets、PID在CDP前登记，不伪造未执行witness或提前promotion。
- 源码证据/审批时状态（历史）：16批准路径字节一致、无预算42碰撞、UTF8/noBOM/LF/中文/diffcheck通过；独审P2 codingOrigin requirement+reserved expectedArtifacts修复代表1/1/0skip（12.347秒），输出ref tamper/strict/原7runtime146.354秒/媒体8/binding2/default2/prep/envelope/promotionrepair与唯一PhaserQA2/2（3.530秒）证据复用。联合仅媒体witness union（max/OR readonly）代表1/1、0skip（4.3296ms），未完整链/Phaser/重开/compiler。批准仅可信source consumer和synthetic验证，design semanticrevision/原COS16组准入/actual paid entry仍留后继；零paid、不改八cases/费用/窗口/caps/原分母，实际迁移/human NONE、C8/closure6保持。

### COS-41 · 在原设计会话中提供有界语义反馈

- 依赖/状态：已发布 [#42](https://github.com/lrfluobida/Cosmos/issues/42)，id5697722881，第41个原生子任务、父checkbox/原生关联由Root REST精确读回；offline-verified-awaiting-live/open。独审 TRANSFER_DESIGN_FEEDBACK_SOURCE_READY 批准 `8e5c69746b26efd41e7e3f28180c72db695a140d`，合入 `6450f43188a8a8cfb9b986defe7631675aab6c22`；source前置COS-07/23/38/40对应已审源码，不要求完整任务closed，outputs16/18。[公共源码审批](https://github.com/lrfluobida/Cosmos/issues/42#issuecomment-5979614161)已由Root POST+GET精确读回。
- 原会话范围：同一design session使用可信hostTools `validate-transfer-design`，保留原grant/maxcalls/fee/deadline/session/attempt；first invalid仅允许一次rewrite process，second invalid永久exhausted，first pass seal，同bytes重试idempotent。恢复看到started却无result须保守失败，不借只读格式纠正或新增TaskAttempt扩大语义权限。
- 审计/封存边界：mutable审计仅design，无params任意路径；成功capture绑定receipt、sealedbytes/source/inputs/task/attempt/provenance。没有tool，或afterseal改map，downstream保持0；generic说明可完善，不改factory/orchestrator/provider/ledger/caseSchema、不扩readonlycorrection/codingrepair/TaskAttempts。
- 源码证据/审批时状态（历史）：九批准路径字节一致、无预算42/main碰撞、UTF8/noBOM/LF/中文/diffcheck通过；samebyte缓存/time/cold-chain三P2关闭，独审firstOnly冷恢复1/1（9.059秒）无additional rolecall，作者samebytes/time/unknown/exhausted/strict/encoding证据复用。联合仅stopped author cold cached-pass拒绝代表1/1、0skip（973.7454ms），未完整consumer/矩阵/Edge/compiler。源码具备不等于实际迁移；零paid，旧八cases/7008623/clock/caps/C8closure6/human NONE与原预算/正式契约保持，43原生入口源码已独审集成、实际免费准入待Root，无新window/claim。

### COS-42 · 将迁移验证绑定到原 COS16 预算组

- 依赖/状态：已发布 [#43](https://github.com/lrfluobida/Cosmos/issues/43)，id5698140786，第42个原生子任务、父checkbox/原生关联由root REST精确读回；offline-verified-awaiting-live/open。独审 VALIDATION_COS16_GROUP_SOURCE_READY 批准 `851020833c044cafa419245a08e467db3873951b`（base `340bc04d2ce6f186d4bdbd2bb0041b7fed057b56`），合入 `6b94b31725e341d5c4116bdc16d25ce775adf1a5`；source前置COS-02/03/20/24已审对应component，outputs16/18；审批时actual entry尚未发布的状态仅为历史；现COS43源码已审集成、真实迁移case1失败，但原子ledger4升级/组delegation已发生，live事实另列。[公共源码审批](https://github.com/lrfluobida/Cosmos/issues/43#issuecomment-5979094810)已由Root POST+GET精确读回。
- 版本/原额度：declaration3/validation ledger4源码及实际claim已应用，snapshot3保持；旧v1/v2、ledger1..3、八cases/六audit的字节解释不变。Root独有实际只读核对原父taskId COS-16 allocation10,000,000 micro-CNY、当时无entry/committed0，本作者不查真实ledger，也不猜其他legacy84,596,040组成。认证derived五roles初向量planning400000/design1200000/art2800000/code2800000/repair2800000合10000000，父row/amount不改，delegation append-only并禁止direct parent dispatch。
- 同时守卫：原子核task上限/case¥5/group¥10/first¥30/shared¥150；group committed按settled+reserved计且包含unknown，不能绕费用或预留。Capacity按raw-allclosures-derivedNet，derivedNet=child allocation-child closure，保留父¥10 bucket、不加新预算；child closure只恢复group capacity，后续只领取精确剩余grant、不能再领整¥10。
- 关闭/保真：必要group closure quote用新版本，旧六receipts不rewrite；settlement overrun如实保留并停止，不压低费用。不得任意扩为财政platform/provider/factory/scheduler/requestmeta/ownedcommand/transferhost变更；预算core与40媒体/41设计反馈独立，actual entry已进行case1 planning后失败，未通过迁移。
- 源码证据/当前边界：18批准路径/14src实际diff字节一致、与40无shared file碰撞、UTF8/LF/中文/diffcheck通过；独审2/2（840.0559ms）/0skip覆盖multi3case累计audit prefix/credit oversum拒/父bucket只计一次及overcharge保真stop、其他admitted settle/cancel/drainowner release。作者new12/legacy15/strict6.8899秒证据复用，联合仅父bucket一次/禁directparent reservation代表1/1、0skip（5.6162ms），未全编译/Root矩阵/Phaser。源码审批时零paid/无真实upgrade/delegation/窗口为历史；当前真实claim/settlement/closure7已验证、迁移失败，原八cases/7008623/C8closure6历史/clock/caps/human NONE与formal200/12不变；公开COS16 CLI/实际入口仍待验，41已审集成、43实际入口仍待验，原父10m不变，不续旧预算。
- 首次实际group证据（历史）：ledger3→4/delegation1与迁移case1原子claim已应用，planning费用14102已结算；免费closure7于2026-10-04T13:04:45.241Z关闭五derived grants、released9985898只回group capacity，groupnet/committed14102/remaining9985898，effectiveallocated90488261前后不变/unallocated59511739。当时rev1421/ledger4/45closed/七audits/shared7022725，原六receipt/40closure前缀不改；[实际评论](https://github.com/lrfluobida/Cosmos/issues/43#issuecomment-5980292477)。Source marker/双SHA/offline/open保持，claim验证不等于全部component或game完成。
- closure8历史：免费closure8于UTC2026-10-04T14:41:20.289Z由Root应用，rev1487→1488/ledger4/10cases/groupdelegations2/50closed八audits，只关闭C2五derived grants、released9824370回原组；groupnet/committed175630/remaining9824370、parent10m/sourcefirstref1414不改，shared effectiveallocated90488261前后相同/unallocated59511739、shared7184253不变。Role余量planning369692/design1054678/art/code/repair各2800000。Models0/owner释放，旧run/tasks/requests/stop/validation/entries/allocations/delegations和七receipt45closure/events前缀按Root deepassert原样，C3需另声明，当前未登记。 Source42 actual group flags继续true，原closure7对象/审批状态不改，不把claim/closure记为game或整组件通过。
- closure9历史：免费closure9于UTC2026-10-04T16:34:48.907Z由Root应用（本地Oct5）：rev1494→1495/ledger4/11cases/currentC3manual/delegations3/55closed九audits，仅关闭C3五grants、released9809590回原组；parent10m/sourcefirstref1414/授权members3不变，groupnet/committed190410/rem9809590，role历史planning45088/design145322/others0、余量354912/1054678/2800000×3。Shared effectiveallocated90488261前后不变/unallocated59511739/shared7199033不变，model0/owner释放；Root deepassert旧run/tasks/requests/stop/validation/cases/entries/allocations/delegations及八audit50closure/events前缀原样。 原Source42 actual flags/审批、closure7/8记录不改，capacity归还不等于game/整组件通过。
- 免费closure10由Root于UTC2026-10-04T18:50:22.312Z应用：afterrev1602/ledger4/12cases/currentC4manual/60closed十audits，released9594896只回原parent10m组；groupnet405104/rem9594896，role历史planning59382/design345722/others0、余量340618/854278/2800000×3，shared effectiveallocated90488261保持/费用7413727不变。Paidparent24440/nativeexit1/key cleared；owner close曾对launcher30020 non-ESRCH，随后两PID ESRCH/CIMempty、原SnapshotStore.recover成功且snapshotbytes不变，owners释放后Root解冻。私有恢复回执不由记录作者读取。 原Source42审批/actual flags、closure7/8/9不改，group容量归还不清费用或代表game通过。

- 最新closure11：Root免费closure11于UTC2026-10-04T21:13:42.554Z应用：rev1883→1884/ledger4/13cases/currentC5manual/5delegations/65closed十一audits；五grants unused8477893仅回原COS16组，groupnet/committed1522107/rem8477893。Role历史76320/601462/166678/677647/0，余量323680/598538/2633322/2122353/2800000；parent10000000/ref1414、sharedallocated90488261/unallocated59511739/费用8530730保持。旧run/tasks/requests/stop/validation/allocations/entries/delegations及十audit60closures/events前缀Root deepassert保真，model0/owner释放，不清費或重开C5。[实际评论](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-5984507367)。

### COS-43 · 提供固定迁移案例的原生运行入口与准入

- 依赖/状态：已发布 [#44](https://github.com/lrfluobida/Cosmos/issues/44)，id5698693292，第43个原生子任务、父checkbox/原生关联由Root REST精确读回；offline-verified-awaiting-live/open、implementationPhase source-integrated。Source20..42精确components stage/marker/source+merge祖先须通过，41三P2已关且source已审合入；Root从clean6450 source基底启动实施的记录为历史。COS14 draft/COS16 frozen仅scope，不require完整任务closed；outputs16/18为partial内部operator，不冒充COS18真实human前门或关闭原COS16公开要求。独审 TRANSFER_NATIVE_ENTRY_SOURCE_READY 批准 `04b4e62ebd9bf92c074ac7b6fcf100d4e7e7ee43`，合入 `97182ce5b3f455459772e5b3660a5536dd638766`；[公共源码审批](https://github.com/lrfluobida/Cosmos/issues/44#issuecomment-5979894712)由Root POST+GET精确读回，源码审批时尚无livecase为历史；现迁移case1已失败/消费，source审批不被runtime失败覆盖。
- 固定范围：newcase `cos20-transfer-validation-1`、declaration3/quote2、case5,000,000micro-CNY/45分钟/80calls/唯一codingrepair及41原session semantic1；derived planning400000/design1200000/art2800000/code2800000/repair2800000合原COS16 parent10000000/shared150/首30。固定requirements保留六T16+两stages/.preparation/topbudgetGroup，template无map/path/game/art/humanfake，非算法改写。
- Case1执行前免费准入（历史）：只加新transfer文件和old validation identity narrow seam，旧Case8 wrapper/bytes/AC不改；每笔old closure认证其old currentCase.declaration hash，不用当前new input，旧六receipts不rewrite。当时fresh preflight确认八consumed/stopped/current8、unknownreserved0、40closed6audit、费用/clock/source祖先/markers/noowner/newroot-marker absent，仅只读、不消费。
- 原子运行边界：groupclaim把ledger3→4/newcase/delegation原子提交，无upgrade-only旁路；固定nativebootstrap新planningID、runOwnedNode与host owned captures，withPreparation planner/validatedtasks/executionreceipt/DAG native roles、production无sessionFactory，沿原journal/oneRepair/effectivefinish。实际八段/media/process/independentreview/promotion/ledger SDKcalls/clock均须真实报告，human不写confirmed。
- 源码证据：十二批准路径字节一致、UTF8/noBOM/LF/中文/diffcheck通过；作者pure9/9（35.0375秒）、默认C8 identity1/1（2.044秒）与strict9.108秒复用。独审完整DAG/journal/唯一repair1/1（23.630秒）；历史writer在env prepare中出现后recheck拒绝，prepare1/execute0、旧bytes不变、新case/operator receipts零（4.064秒）。联合固定newinput/declaration代表1/1、0skip（47.9131ms），未重跑compiler/完整消费者/Edge。
- C1结束时边界（历史）：Source43保持 TRANSFER_NATIVE_ENTRY_SOURCE_READY/原reviewed与merge SHA/offline-verified-awaiting-live/open；actual liveValidationStatus单列native-transfer-planning-contract-failed，caseId cos20-transfer-validation-1。原子claim/ledger4 upgrade/delegation已实际发生，planning1/34.198秒后strict policyId拒绝，tasks[]/无game，manual consumed、owner释放/Node18880exit1/credentials cleared/unknownreserved0。当时closure7后九cases/revision1421/ledger4/shared7022725/45closed/七audits；[实际结果](https://github.com/lrfluobida/Cosmos/issues/44#issuecomment-5980291983)和[诊断](../research/2026-10-04-transfer-planning-failure.md)另列。C8/closure6原八cases费用与source历史保留，不改oldgame/human NONE，不重开旧case，COS44契约修复源码已审集成，但当时未新case；后续C2失败见COS45，迁移尚未通过。

### COS-44 · 明确原生规划输出中的 policyId 契约

- 依赖/状态：已发布[#45](https://github.com/lrfluobida/Cosmos/issues/45)，id5699591283，第44个原生子任务、parent #1实际44children #2–#45/新checkbox由Root REST精确读回；offline-verified-awaiting-live/open、source-integrated；注册时in-progress/SOURCE_NOT_READY为历史，现独审 PLANNING_POLICY_SCHEMA_SOURCE_READY 批准 `4c3b785f71cf22456f107e47115edd3dea91667f`，合入 `33e58df84e30361dd375aa8613605c94dba3614a`，[公共审批](https://github.com/lrfluobida/Cosmos/issues/45#issuecomment-5980481610)由Root POST+GET精确读回。Source前置COS07/#8、COS18/#19 partial和COS43/#44对应已审源码，outputs16/18，不require完整任务closed；专属cos44_implementer从clean71729启动codex/cos44-planning-policy-schema。
- 范围/验收：只改src/roles/planner.ts、factory.ts两个prompt及roles tests/plan；policy分支显式六字段taskId/policyId/role/objective/acceptanceIds/dependsOn，legacy保留五字段。免费regression确认契约一致，不放宽validator、不guess role或fallback，不新增付费纠错、预算/新case/游戏改动。
- 真实失败关联：迁移case1原reply三roles/AC/deps正确但all3缺policyId；最初JSON shape省略字段，后条件句才required，strict policyFor(undefined)拒绝。[失败记录](../research/2026-10-04-transfer-planning-failure.md)基于Root只读SDKresponse，原raw/case/result保持，不tamper或replay真实case。
- 源码证据：四批准paths字节一致、UTF8/noBOM/LF/中文/diffcheck通过，仅两个production prompts/new roles test/plan。作者7new/5old slots/6default/strict7.039秒复用；独审4/4（267.6ms）验证policy positive/default roles/multiple same-role及原missing-policy严格拒绝、零登记费用/session closed。联合policy模式提示/原生mock绑定1/1、0skip（41.0945ms），未重矩阵/compiler/Edge。
- Source44源码审批时边界（历史）：修复源码已独审集成，真实case1仍failed/manual consumed，raw/费用/closure7保留；没有newcase2登记/claim/paid或迁移验收通过，human adapter仍为未登记后继。本任务不改变COS16 frozen contract/parent10m/shared150first30/formal20012、validator/付费纠错/唯一codingrepair、G3三个closed组件及实际human NONE。
- 实际planning观察：C2 native planning policy契约通过并登记三task，[Root实际评论](https://github.com/lrfluobida/Cosmos/issues/45#issuecomment-5981248897)已POST+GET读回；PLANNING_POLICY_SCHEMA_SOURCE_READY/双SHA/offline/open保留，没有独立component acceptance时不close。后续design标识符失败不否定本阶段观察，也不是完整迁移/game/human通过。

### COS-45 · 准备第二个原生迁移案例与剩余额度准入

- 依赖/状态：已发布[#46](https://github.com/lrfluobida/Cosmos/issues/46)，id5699845444，第45个原生子任务；Root REST POST+GET/native parent45children #2–#46/新checkbox追加精确读回，原44条和三个completed[x]不改。注册时只读设计批准/实施中SOURCE_NOT_READY为历史；现独审 TRANSFER_CASE_TWO_SOURCE_READY 批准 `3bb01724f697ef600eae2e8477ee2b12f568e3e8`，合入 `d5c059a4978facefe238d92cfb23faa2eedc6320`，offline-verified-awaiting-live/open、implementationPhase source-integrated；[公共审批](https://github.com/lrfluobida/Cosmos/issues/46#issuecomment-5980855008)由Root POST+GET精确读回，C2实际失败另列，source审批不被runtime失败覆盖。Source前置COS20..44精确component stage及沿43的original foundations；44 schema/43 entry/41 semantics/42 budget的marker与reviewed/merge双祖先必需，COS16 frozen/COS18 partial scoped，outputs16/18，不形成完整closed循环。
- 固定输入/上限：计划caseId `cos20-transfer-validation-2`、declaration3/quote2；requirements/template/input hash `f52b3846140b9b46733238ec5dc2a8d243c0145326f8c4f799bffc23d4bdc78c`原样。Case5000000micro-CNY/45分钟/80calls，same design session一次semantic rewrite和一次codingrepair；五derived grants385898/1200000/2800000/2800000/2800000合9985898，仅用原parent COS16 allocation10m的剩余capacity，不新增预算。
- 准入/历史：保留D1声明/requirements/template/CLI/hash及原first授权决定/membercase1/parentAllocation ref1414。初次C2 preflight须核九consumed/stopped cases/currentC1manual、七closure各按old own declaration认证（第七笔transfer C1不是旧C8）、零unknown/reserved、writer收敛、无新root/marker/owner和44准确READY。COS22 failed-status例外仅限22，43live failure独立字段保留、sourceREADY仍有效；Source44未Ready不得任何新副作用。
- 实施/免费回归：private fixed-profile factory复用现有input/driver/run，加硬C2 wrapper/decl，不公开任意caller data/harness、不复制整个executor。计划Pure TDD验证新vector/hash/authority/九history七audits/44未Ready零effect、atomic claim append2保留wholehistory/shared capacity及默认C1身份；复用旧matrix/Edge/80loops，不重放已消费C1。
- 源码证据：九批准paths字节一致、UTF8/noBOM/LF/中文/diffcheck通过，C1 byteexact/六fixed inputs/old wrapper/README28288byte prefix和私有两个profiles保持。作者新4/4（48.5768秒）、parser1/1（0.3386秒）、旧C1default1/1（4.553秒）与strict7.499秒复用；独审2/2（34.342秒）覆盖pending44零effects、atomic claim/bootstrap group/history/first授权/shared capacity与C2正确grants、拒C1 bootstrap。联合fixedinput/vector1/1、0skip（30.3427ms），未matrix/strict/Edge/actual model。
- C2执行前边界（历史）：源码已独审集成、准备零paid、实际C2未创建；九case currentC1manual/7022725/rev1421 ledger4/45closed七audits/groupnetspent14102/rem9985898保持，parent10m/ref1414不改。真实免费准入/余额/路由/operator和bounded native仅由Root在最终source/docs独审集成后以fresh finalmain quote/funding/operator冻结执行；沿原shared150/首30/formal20012，不fakeHuman或完整经典成绩，不登记其他未来任务。
- C2结果（历史）：真实迁移C2：source c6a9/UTC2026-10-04T14:18:16.191Z→14:22:58.753Z、原deadline15:03:16.191Z，282562ms/15SDK/new161528/shared7184253；planning16206/design145322，art/code/repair0，native planning通过并登记三task。Design attempt8776311e-ac8a-4506-8ffa-6ee36d850051在原generic identifier box state onTarget失败/code_defect；semantic check1 passedtrue/rewritesRemaining0/mapVersioncos16-map-v1，但未publishFrozen/capture，art/coding未开始/无game。Root仅内存副本on-target经原validator通过，实际文件未改；current2 manual consumed/Node19451exit1/credentialCleared/owner释放/unknownreserved0。 Closure8后10cases/rev1488 ledger4/50closed八audits/group175630+9824370；TRANSFER_CASE_TWO_SOURCE_READY/原双SHA/offline/open不改，actual liveValidationStatus分列native-transfer-design-schema-failed。[真实结果](https://github.com/lrfluobida/Cosmos/issues/46#issuecomment-5981248016)与[诊断](../research/2026-10-04-transfer-design-identifier-failure.md)另存，COS46自检修复源码已审，仍无新C3，不重开C2或手改游戏。

### COS-46 · 为设计作者提供标识符约束与输出自检

- 依赖/状态：已发布[#47](https://github.com/lrfluobida/Cosmos/issues/47)，id5700347789，第46个原生子任务，Root恢复原生GET后最终body/native46children #2–#47/checkbox精确读回，无重复。注册时cos46_implementer从c6a9启动/NOTREADY为历史；现独审 DESIGN_OUTPUT_SELF_CHECK_SOURCE_READY 批准 `2b7e5091b31c7612e3451174cc7fc38fcc89f39b`，合入 `ad693d795ff4636a6a8adafff3551de208df0639`，offline-verified-awaiting-live/open、implementationPhase source-integrated；[公共审批](https://github.com/lrfluobida/Cosmos/issues/47#issuecomment-5981575000)由Root POST+GET读回。Source07/#8、18/#19 partial、41/#42、44/#45、45/#46对应已审stage，outputs16/18，不require失败任务closed；human adapter和C3声明未登记。
- 明确约束：host design/art提示 `^[a-z][a-z0-9-]{0,47}$` 与DOS reserved名，names在planning前与原semanticTool组合。只读 `validate-game-design` 空args固定designauthor workspace currentfile，复用原validateDesign/identifier/gameplay IDs校验，返回精确字段诊断并核source/window/task/signal，不接受任意路径。
- 权限/验收：同一原SDK session/attempt/grant/calls/fees/clock，不写文件/registry/ledger/audit，不猜改invalidID、不扩semanticrewrite/readonlyformatcorrection/codingrepair；strict capture须recheck，tool通过不代替publication或验收。计划免费TDD覆盖bad onTarget/DOS/合法slug、固定文件/权限信号、原semantic tool组合及capture仍拒非法输出；源码准备零paid，不重放或改真实C2。
- 源码证据：五批准paths字节一致、UTF8/noBOM/LF/中文/diffcheck通过，两个production/two tests/plan与五docs无碰撞；作者9new/old compatibility6/strict7.064秒复用，独审helper3/3（2493.25ms）+original session组合/stale capture2/2（8330.94ms）通过原task/attempt/source/window守卫。联合原strict非法/保留media字段只读helper1/1、0skip（20.5822ms），未矩阵/41cache/80counter/Edge/compiler。56行helper固定currentfile/readOnly/空args，不auto normalize-ID或maprewrite，不变budget/SDK/provider。
- Source46审批时边界（历史）：C2 design schema失败/raw/161528与closure8保留，实际C3 NONE、未新budget或human任务；10cases/7184253/rev1488 ledger4/50closed八audits/groupnet175630/rem9824370、parent10m/ref1414/shared150首30/formal20012/G3 complete/C8 accepted/human NONE保持。当前仅批准source准备，实际C3不预登记，后继真实运行需另独立声明/准入。

### COS-47 · 准备带设计输出自检的第三个原生迁移案例

- 依赖/状态：已发布[#48](https://github.com/lrfluobida/Cosmos/issues/48)，id5700732521，第47个原生子任务；Root POST+GET/native47children #2–#48/追加checkbox读回，原46对象/checkline不改。注册时cos47_implementer从2227b34实施/NOTREADY为历史；现独审 TRANSFER_CASE_THREE_SOURCE_READY 批准 `d178b09b18f959acf912a228040568f05342c977`，合入 `7bff7128b91ab706f50326ebe4d053358ee0ad74`，offline-verified-awaiting-live/open、implementationPhase source-integrated；[公共审批](https://github.com/lrfluobida/Cosmos/issues/48#issuecomment-5981888496)由Root POST+GET读回，C3实际失败另列，source审批保持。Source20..46共27精确已审component/unique marker/source+merge双祖先及沿43的original foundations；明确45 TRANSFER_CASE_TWO_SOURCE_READY与46 DESIGN_OUTPUT_SELF_CHECK_SOURCE_READY，frozen16/partial18 scoped、outputs16/18，不构造full closed循环；22特例仅22，45实际generic failure不覆sourceReady。
- 固定输入/额度：计划 `cos20-transfer-validation-3`、declaration3/quote2，requirements/template/input hash `f52b3846140b9b46733238ec5dc2a8d243c0145326f8c4f799bffc23d4bdc78c`原样；¥5/45分钟/80全SDK calls，原design semantic一次及coding一次repair。Vector369692/1054678/2800000/2800000/2800000合9824370=原10000000−spent175630；历史planning30308/design145322/others0须按role精确认证，equalTotal wrongRole拒绝，不新领10m/静默rebalance。
- 准入/历史：ledger4/十consumed stopped cases/currentC2manual、two delegations/50closed八audit/groupnet allocated committed175630/remaining9824370，sourcefirstparentref1414/firstauth与membersC1C2保持。八old receipts按各own currentCase decl/inputhash/rawbytes/opsource/roots/quote/Source祖先认证，第八笔C2不是C8；emptyRoot/markers、无writer/unknown0、pending46均在hostprepare/claim前拒绝。
- 实施/计划回归：private source-known profiles2→3，加case-three decl+run并复用共享input/driver/DAG，不copy pipeline或修改src budget/planner/46tool；C1/C2decl/inputs/wrappers/historical metadata字节不改。计划pure目标vector/hash/rolefee反例/十history八audits/pending46零effects、native planning/fullscope与atomic append历史/共享capacity保真；C1/C2默认入口拒case3baseline。46 readonly check composer与41 semantic沿原session/grant/clock，capture strict；复用旧大矩阵/Edge/80，不把free source fixture当actual C3。
- 源码证据：九批准paths字节一致、UTF8/noBOM/LF/中文/diffcheck通过，private三个已知profiles/C1C2 default bytes/原文件及README前缀保持，无注册四docs碰撞。作者5pure聚焦、旧C1+C2代表/strict7.749秒与原atomic/bootstrap/DAG/rolebudget/Edge证据复用；独审新增负例2/2（45.383秒）覆盖pending46零effect/sameTotal wrongRole拒绝。联合fixedinput/vector1/1、0skip（37.0198ms），未大矩阵/compiler/实际Browser。
- C3执行前边界（历史）：C3源码已独审集成，实际C3未claim/模型/生成、paid NONE，human adapter不属本task、未登记其他后继。原10cases/7184253/rev1488 ledger4/50closed八audits/groupspent175630/rem9824370/parent10m/ref1414、C1/C2失败/C8接受/G3 complete/human NONE与fullclassic未知保留；shared150首30/formal20012不改。真实C3须另准确source/docs审批、免费准入/资金/Root operator和冻结后执行，未Ready不claim。
- 真实迁移C3：source e8f4d4d/UTC2026-10-04T16:16:36.151Z→16:17:09.564Z、原deadline17:01:36.151Z（本地2026-10-05），33413ms/1SDK/planning14780 micro-CNY/shared7199033 / ¥7.199033，unknown/reserved0。Policy game-design/game-art/game-code及role/AC/deps正确，但taskId局部别名cos20-design/cos20-art/cos20-coding未匹配预声明current grant IDs，strict planner拒绝；registered tasks0/design-art-code-game0。Node56308exit1/credentialsCleared/owners释放、currentC3 manual consumed，原保存回复未改，非SDK账单或browser故障。 Closure9后11case/rev1495 ledger4/global7199033/55closed九audits/group190410+9809590，TRANSFER_CASE_THREE_SOURCE_READY/原双SHA/offline/open不变，actual liveValidationStatus单列native-transfer-planning-identity-failed。[实际结果](https://github.com/lrfluobida/Cosmos/issues/48#issuecomment-5982185433)与[诊断](../research/2026-10-05-transfer-planning-identity-failure.md)保留，不重开C3；COS48绑定源码已审集成、未新native opt-in、46自检未真实执行。

### COS-48 · 由主机将规划局部别名绑定到预声明任务身份

- 依赖/状态：已发布[#49](https://github.com/lrfluobida/Cosmos/issues/49)，id5701294644，第48个原生子任务，Root body/native48children #2–#49/追加checkbox及旧47前缀读回。注册时cos48_implementer从e8实施/NOTREADY为历史；现独审 PLANNING_HOST_IDENTITY_BINDING_SOURCE_READY 批准 `86460cc8aa5ba4e9ab9ec623a2710c6d99029156`，合入 `8db56b88e6067e5216eb9ecb85e080225a25ced1`，offline-verified-awaiting-live/open、implementationPhase source-integrated，[公共审批](https://github.com/lrfluobida/Cosmos/issues/49#issuecomment-5982411570)由Root POST+GET精确读回。Source07/#8、20/#21、44/#45、47/#48对应已审component，outputs16/18、不require failed任务closed；未来C4 caller/decl另task，human未登记。
- 可信mode：PlanOptions `proposalIdentity:'validation-policy-aliases/1'` 显式opt-in，仅strict validation/taskPolicies/三个unique design/art/code槽；unknownmode/human/roles错槽session0拒。六字段localAlias先strict keys/rolepolicy/acceptance/uniquealiases与slots/known deps，再host将validated policy→current declared grant ID双射、绑定ID/deps，沿原grant/coverage/cycle/budgetTaskContract/requireValidationTask；不missingpolicy guess/未验证role赋值。
- 产物/兼容：新mode plan.json含identityBinding(protocol/policy/localAlias/actualTaskId)+bound outputs；legacy五/六/default prompts/IDs/旧JSON caches/C1C2C3行为原样。Only planner.ts + tests/roles/planning-identity.test.ts + plan，不helper/pipeline/art/vector改动，不新增SDK/format retry/session/attempt/grant/price/ledger/C4执行。
- 源码证据：三批准paths字节一致、UTF8/noBOM/LF/中文/diffcheck通过，只planner/test/plan；作者25new/2focus/8default/strict6.928秒复用，独审10new edges+2default+1foreign-alias probe验证validated policy/current grant双射、错开draft顺序与foreign actual-ID别名仍正确绑定，snapshot bytes不变/零API费用browser。联合alias positive1/1、0skip（110.763ms），未矩阵/strict/old80/Edge。Legacy默认/JSON/cache/旧C1C2C3行为保持。
- 当前边界：C3 raw/身份失败/14780费用与closure9保留，source48已独审集成但新mode尚未native模型实测、C4 caller/decl未注册、不blind paid repeat。原group10m−190410=9809590/role余量354912/1054678/2800000×3仅已有剩余记录，未来C4另声明；11cases/7199033/rev1495 ledger4/55closed九audits/ref1414、旧C1C2/closure8/C8/G3/human NONE/fullclassic未知及150首30/formal20012不变。

### COS-49 · 准备由主机绑定身份的第四个原生迁移案例

- 依赖/状态：已发布[#50](https://github.com/lrfluobida/Cosmos/issues/50)，id5701574061，第49个原生子任务，Root body/native49children #2–#50/新checkbox旧48前缀精确读回。注册时cos49_implementer从935a3fa实施/NOTREADY为历史；现独审 TRANSFER_CASE_FOUR_SOURCE_READY 批准 `8e9e0eec3a46d5529da9578744323fb3cb1c6ba7`，合入 `80adb8226f94633d45b32bb1c30a6d8cdf5a9c2f`，offline-verified-awaiting-live/open、implementationPhase source-integrated；[公共审批](https://github.com/lrfluobida/Cosmos/issues/50#issuecomment-5982742381)由Root POST+GET精确读回，C4实际失败另列，source审批保持。Source20..48共29unique specific已审component+旧foundations、marker/source+merge双祖先；明确47 TRANSFER_CASE_THREE_SOURCE_READY/48 PLANNING_HOST_IDENTITY_BINDING_SOURCE_READY，frozen16/partial18 scoped、outputs16/18，不fullclosed循环或wildcard failedSourceReady，22特例仅22，43/45/47审批与live失败分列。
- 固定profile/wiring：source-known四profiles、新D4decl/run复用sharedinput/driver/run，不pipelinecopy/publicparamselection。Fixeddriver内部defaultfalse仅C4true，original planTaskDag explicit `proposalIdentity='validation-policy-aliases/1'`；legacyC1–C3声明/inputs/default wrappers/markers/hashes不加property、原bytes/default/unknownmode保持。Case `cos20-transfer-validation-4`、decl3quote2/same hash `f52b3846140b9b46733238ec5dc2a8d243c0145326f8c4f799bffc23d4bdc78c` / Flash / 5000000micro-CNY/45分钟/80全SDK、原design semantic1/readOnlygeneric current/唯一codeRepair不变。
- 原额度/准入：grants354912/1054678/2800000/2800000/2800000合9809590，old rolefees45088/145322/others0合190410、parent10m/ref1414/firstauth membersC1C2C3不变，无freshbudget/directparent changes。核11hist/currentC3 stopped、3delegations/55closed九audits/ledger4rev1495/groupnet190410/remaining9809590；九audits owncasedeclHash/sourcebytes/rootquote/祖先认证，第九C3非C8。Root/markers空、writer/unknownreserve/owners0及pending48在prepare/receipts/claim前拒绝。
- 实施/计划回归：CLI/hash/十一history九authority/wrongRoleFee/pending48零effect/atomic C4 append保留旧预算authority+members/sharedcap/新planning bootstrap scope。真实planTaskDag mock别名绑定C4 exact IDs/deps，读取identityBinding后stop author DAG不重整DAG；cross/defaultC3与旧Source48/harness/Edge证据复用，source准备不当actual native新mode通过。
- 源码证据：九批准paths字节一致、UTF8/noBOM/LF/中文/diffcheck通过，C4内部flag/explicit48mode只作用新profile，C1–C3默认option/旧src/decl/wrappers/req/template原bytes不变，无四docs碰撞。作者7new/oldC3/strict7.728秒及原admitAtomicBootstrap/Source48核心/consumer80/Edge证据复用；独审realdriver→realplanTaskDag/consumer.validateTasks/identityBinding和C3 defaultalias拒绝2/2（104.5835秒）为synthetic-only。联合fixedinput/vector1/1、0skip（42.8052ms），未104/78秒矩阵/strict/default/真实Browser。
- C4执行前边界（历史）：C4源码已独审集成，仅sourceReady、actual C4/paid NONE，未更改11cases/global7199033/rev1495ledger4/55closed九audits/parent10net190410rem9809590/C1C2C3失败/C8G3/human NONE/fullclassic未知/150首30/formal20012。最终source/docs独审集成后Root另fresh免费准入/资金/路由/operator/source-mainfreeze才运行，不重开旧case或提前claim。
- 真实迁移C4：source e609a16/UTC2026-10-04T18:03:20.961Z→18:26:18.115Z、原deadline18:48:20.961Z（本地Oct5），1377154ms/24SDK/new214694/shared7413727 / ¥7.413727；planning14294/design200400/art-code-repair0，unknown/reserved0。Local aliases实际绑定、generic design与transfer map host capture通过；validate-game-design1 passed/errors[]、validate-transfer-design1 passed/rewritesRemaining0/mapVersioncos16-map-v1。独立design review changes_requested，65readonly toolcalls查找capture/.../files/authors/design/*.json，但实际immutable文件为_cosmos/design.json与_cosmos/transfer-design.json。No game/build/browser/art/coding，不改生成文件或自动提升。 免费closure10由Root于UTC2026-10-04T18:50:22.312Z应用：afterrev1602/ledger4/12cases/currentC4manual/60closed十audits，released9594896只回原parent10m组；groupnet405104/rem9594896，role历史planning59382/design345722/others0、余量340618/854278/2800000×3，shared effectiveallocated90488261保持/费用7413727不变。Paidparent24440/nativeexit1/key cleared；owner close曾对launcher30020 non-ESRCH，随后两PID ESRCH/CIMempty、原SnapshotStore.recover成功且snapshotbytes不变，owners释放后Root解冻。私有恢复回执不由记录作者读取。 TRANSFER_CASE_FOUR_SOURCE_READY/原双SHA/offline/open不变，actual liveValidationStatus另列native-transfer-design-review-changes-requested。[实际结果](https://github.com/lrfluobida/Cosmos/issues/50#issuecomment-5983277683)与[诊断](../research/2026-10-05-transfer-capture-path-failure.md)保留，source50读取契约已审、未新native验证、不改或重开C4。

### COS-50 · 明确作者输出与捕获产物的角色读取路径

- 依赖/状态：已发布[#51](https://github.com/lrfluobida/Cosmos/issues/51)，id5702273122，第50个原生子任务，Root body/native50children #2–#51/新checkbox与旧49前缀精确读回。注册时cos49_implementer在e609/NOTREADY为历史；现独审 CAPTURE_LAYOUT_CONTRACT_SOURCE_READY 批准 `59c3420774cb2c5fb68b2840cb36bc41e931695e`，合入 `3f655630a230aa5fb9fc2711eb3a5399e8429d93`，offline-verified-awaiting-live/open、implementationPhase source-integrated；[公共审批](https://github.com/lrfluobida/Cosmos/issues/51#issuecomment-5983520295)由Root POST+GET读回。Source07/#8、09/#10、36/#37、38/#39、41/#42已审集成component，修复COS49实际失败并反馈16/18，不fullclosed循环。
- 输出/契约：free explicit capture-path contract，告诉独立reviewer/art/coding何处读取作者workspace输出、何处读取immutable capture及其实际文件清单/引用。C4实际_cosmos/design.json、_cosmos/transfer-design.json不可被capture/.../files/authors/design/*.json假设替代；保持真实evidence/provenance绑定，不手改原产物。
- 约束/验收：只角色读取路径说明/契约，不factory/schema/layout/permission/retry变更，不复制移动生成game、添加示例game或降低host/indep review条件；计划free回归核capture现有结构/角色prompt边界/old outputs不变，源码未审不得main合入。
- 源码证据：四批准paths字节一致、UTF8/noBOM/LF/中文/diffcheck通过，仅角色读取契约；作者3new（31.061秒）/2legacy（4.081秒）/strict7.627秒、独审transfer四refs/retained capture version2/2（28.887秒）/0failed0skip证据复用。联合仅transfer scoped packet读取4design refs/两个plan根1/1、0skip（27477.3003ms），未全suite/Edge。以上synthetic source验证不代表actual native新case成功。
- 当前边界：C4 host captures通过而独立review changes_requested/无game，owner恢复与closure10已Root完成，12cases/7413727/rev1602 ledger4/60closed十audits/group405104+9594896/parent10m、原150首30/formal20012/旧病例C8/G3/human NONE/fullclassic未知不改。本task读取契约源码已审集成，仅sourceReady，后继实际case另声明与准入，不重开C4。

### COS-51 · 准备带捕获路径契约的第五个原生迁移案例

- 依赖/状态：已发布[#52](https://github.com/lrfluobida/Cosmos/issues/52)，id5702464218，第51个原生子任务；Root body/native51children #2–#52/新增checkbox及旧50前缀精确读回。注册时cos51_implementer从3f65563 source-free实施/in-progress/SOURCE_NOT_READY为历史；当前独审 TRANSFER_CASE_FIVE_SOURCE_READY，reviewedCommit `9d8d95e781b4f041fa4f290a9887d79522fceb91`、mergeCommit `0b3c06e0791f83d2939ef3ebfa631e1c212d9c6b` 均为main祖先，[公共源码审批](https://github.com/lrfluobida/Cosmos/issues/52#issuecomment-5983731799)精确读回；offline-verified-awaiting-live/open、source-integrated，actual C5已结束失败，live另列。Source20..50共31精确已审components/unique marker/source+merge双main祖先和原foundations、Source50 CAPTURE_LAYOUT_CONTRACT_SOURCE_READY必需；frozen16/partial18 scoped、outputs16/18，不fullclosed循环。
- 固定输入/权限：计划 `cos20-transfer-validation-5`、decl3quote2/原requirements-template-input `f52b3846140b9b46733238ec5dc2a8d243c0145326f8c4f799bffc23d4bdc78c`/Flash/¥5/45分钟/80全SDK、原design semantic1与coding1；capture读取契约用现有immutable布局和scoped refs，不改grant/session/clock或权限。Identity protocol C5true/C4true/C1–3 defaultfalse，旧四decl/inputs/wrappers/metadata保持。
- 执行前余量/准入（历史）：grants340618/854278/2800000/2800000/2800000合9594896=原10000000−405104，planning历史59382/design345722/others0与sourcefirstparentref1414/first授权members保真，不新预算。核ledger4/currentC4 consumedstopped/12cases/4delegations/60closed十audits、旧four cases/各own declaration/input/quote/ancestor/closure与新root-marker absent、writer/unknownreserve/owners0/pending50零effect；不能换路径或复用旧window绕过准入。
- 源码证据：九批准paths字节一致/UTF8/noBOM/LF/中文/diffcheck及README原35324字节前缀保持；作者5focused/C4+C3兼容2/2（111.911秒）/strict8.354秒，独审3/3（168.692秒）/0failed0skip，联合仅同总额错role预算代表1/1、0skip（43115.9673ms），全为synthetic source验证。
- 当前边界：原source审批/双SHA/offline-verified-awaiting-live/open保持；actual C5 coding截止取消、design/art passed但无game/accepted/repair。C5结束时（历史）13cases/rev1884 ledger4/global8530730/65closed十一audits/group1522107+8477893/parent10m；旧C1–4失败/C8/G3/150首30/formal20012/human NONE/fullclassic未知保持，manual consumed不重开。[实际结果](https://github.com/lrfluobida/Cosmos/issues/52#issuecomment-5984507618)。

### COS-52 · 将迁移验收与角色 host 纳入生产运行库

- 依赖/状态：已发布[#53](https://github.com/lrfluobida/Cosmos/issues/53)，id5702655827，第52个原生子任务；Root body/native52children #2–#53/新增checkbox精确读回。cos52_implementer owns cos02 worktree的codex/cos52-production-transfer-runtime，注册时从c3d43e1实施/SOURCE_NOT_READY为历史；当前 PRODUCTION_TRANSFER_RUNTIME_SOURCE_READY，reviewed `2ca0f244c52d9280729986ac4b5583829395cbde`、merge `b6b784c79035591b9466b23a4434680b2d0f7f59`，offline-verified-awaiting-live/open/source-integrated，[审批](https://github.com/lrfluobida/Cosmos/issues/53#issuecomment-5984507866)精确读回。Source07/09/35..41/50对应已审集成component源码前置、outputs16/18；Source51案例证明单列，不要求完整任务closed。
- 范围/产物：将九个transfer helpers与必要Source32 diagnostics/type依赖迁入 `src/runtime/adapters/transfer`，旧probes为thin reexports；input/declaration/driver/run/fixtures仍在probes。核production静态闭包、source/compiled dist实际加载和必要owned worker相对URL，保留design oracle/bindings/四outputs/persistent八段/media/一次feedback repair/Source50捕获读取语义。
- 源码证据/边界：23paths/十wrappers，独审AST九same-body/83files583edges及source-DIST-compiled host-owned worker3/3（26.512秒），作者legacy4/strict6.830秒复用；组合hidden preparation字段不得持久化/授权确认1/1、0skip（49.3122ms），批准字节/UTF8/LF/中文/diff通过。C5主线9e7未包含本源码，source证据不倒写为C5已使用或迁移通过；public human CLI/connector未接，actual human NONE。

### COS-53 · 保存运行时设计前的需求草稿与访谈模式

- 依赖/状态：[#54](https://github.com/lrfluobida/Cosmos/issues/54)，id5702920916，source18 partial/35/36/38/52已审component；HUMAN_PREPARATION_DRAFT_SOURCE_READY，reviewed final `6d5ba4b6bc08b208505784be62eaa7577a52b9df`（9b3f4c prep question额外字段/伪确认P2已闭）、merge `5fd3aaeb96905229d9365494b3cfc3ce258c21f0`，offline-verified-awaiting-live/open/source-integrated。[公共审批](https://github.com/lrfluobida/Cosmos/issues/54#issuecomment-5984508097) Root精确读回。
- 范围/边界：可信caller在effect前选择cos16-input/1，区分browser/preparation draft、旧默认六字段wire保持；真实brief/questions/answers/全部六T16+两stage/unsupported，无scenario/map/solution/path/placeholder/fakeconfirm，模型不能切换模式。Intake模式/源版本/回答/修改/展示/拒绝或确认/冷恢复维持原统一ledger与唯一激活clock；browser host拒未接preparation、operator原路径不变。只内部API，public flag/human host connector后继，actualhuman NONE。
- 源码证据：11paths、六focused3.243秒0skip，initial18new/47old/operatorCompiled2/type与作者18+47+两repro/五affected复用；组合hidden字段拒绝1/1（49.3122ms）。零实际模型/费用/用户确认。

### COS-54 · 为角色提供准确输入引用的文件清单

- 依赖/状态：[#55](https://github.com/lrfluobida/Cosmos/issues/55)，id5703465426；source07/09/50/52已审集成，C5为诊断来源，注册时SOURCE_NOT_READY为历史；当前 ROLE_FILE_INVENTORY_SOURCE_READY，reviewed `fc9aa8f56131f55d46c89c9e2ea01576695c3b16`、merge `a75c6147ecb09097492489be877b9384503a4abf`，offline-verified-awaiting-live/open/source-integrated，[公共审批](https://github.com/lrfluobida/Cosmos/issues/55#issuecomment-5985063159)精确读回。
- 源码证据：五批准paths/UTF8/LF/中文/diff字节一致，独审10/10（37.620秒）与TEMP EISDIR/nonENOENT/hardlink拒/production required input保留；旧59与strict复用，联合missing reference不猜文件1/1（85.0988ms）。仅source/TEMP，未产生新native通过。
- 范围/验收：冻结packet只从当前inputs/interfaces及reviewer获准artifacts/evidence列准确artifactId/version/location、文件/目录类型和排序relative paths；中文/两个plan根/当前v2区分，模板四configs与作者index/src write范围明确。仅现有read方法，不遍历宽泛ownership/任意目录、不增权限/目录read工具、不暴露ledger/session/父路径，清单非审查证据。Source/TEMP代表，不重开case/手改game。

### COS-55 · 接通编码作者原会话的可信编译检查

- 依赖/状态：[#56](https://github.com/lrfluobida/Cosmos/issues/56)，id5703466429；source07/09/11/35/38/40/52已审集成，54可并行，注册时SOURCE_NOT_READY为历史；当前 CODING_BUILD_FEEDBACK_SOURCE_READY，reviewed `018e02130d1678c35034748e64f3dff236eb1318`、merge `46dc52387a69c95720687375a92da1b7d66b4e5b`，offline-verified-awaiting-live/open/source-integrated，[公共审批](https://github.com/lrfluobida/Cosmos/issues/56#issuecomment-5985108515)精确读回。
- 源码证据：八批准paths/UTF8/LF/中文/diff字节一致；独审3/3（27.67秒）覆盖strict空参/非coding隔离、phase input漂移在Vite前拒、compiled真实tsc失败→同作者修复→成功/两TEMP目录/config-media/PID退出/零新request。与54组合actualfactory工具隔离1/1（2269.008ms），旧source/compiled证据复用；Windows参数签名375723字符改64字符digest仍绑定完整排序paths+bytes。旧base仅测试expectation的preparation错误词修正及零snapshot/calls/config副作用证据已复用，不改capture/QA/独立review/promotion/oneRepair。
- 范围/验收：SDK初始化前声明/实现仅coding作者的空参固定tsc/Vite；原session/attempt/write/grant/calls/费用/deadline/signal保持。准确template/config/media/current源码装配至独立task/attempt/check TEMP，runOwnedNode/controller ticket/PID/env白名单/source-input-version/停止/unknown前后守卫；stale/错scope/停止拒，无shell/命令/任意path/env，不复用draft-N/既有builds/task目录。仅advisory真实编译诊断，不capture/proof/indepapproval/accepted/promotion、不占增linked repair；TEMP owned compiler错误→原作者修改→成功及source/compiled入口代表，零模型。

Root POST+GET/native parent55children #2–#56/checkbox精确读回。原验证150/首30/COS16原10/formal20012/优化1006、旧八native与五迁移结果/closure11/human NONE保持，当前无盲paid重跑计划。

### COS-56 · 复用已通过阶段的固定产物与评审来源

- 依赖/状态：[#57](https://github.com/lrfluobida/Cosmos/issues/57)，id5704091506；source12/35..42/43/52/54/55已审对应component，输出16/18，frozen16/partial18 scoped而非完整closed循环。源码已独审集成：`e5cfa78f2fcda111bb6457bfa4f9c41b4229b260`→`384fbd2e59186857113cddc284050490fac389da`，[公共审批](https://github.com/lrfluobida/Cosmos/issues/57#issuecomment-5986525798)；HISTORICAL_PASSED_STAGES_SOURCE_READY/offline-verified-awaiting-live/source-integrated/open。修复独审1/1（67.482秒）与merger代表1/1（1.8417ms），旧未改验证复用。Root真实C5只读内存manifest核对2个passed阶段/7captures通过，ledger字节不变、未落盘manifest或新paid。
- 来源认证：Root-owned manifest绑定C5 window/source/inputHash/原task IDs-contracts-roots/完整capture refs及原origin/author/capture/verified/review-started/review字节digest、time/signature/inputVersions/evidence与author/reviewer/context独立approved。新operator receipt固定sourceRef中的expectedSHA仅是元数据；可信readScope须实读manifest并核exact path+bytes/hash，在claim前后、cold resume、工具/dispatch和promotion复核。
- 历史只读：历史design audit只核原started/result/raw时间hash链与sealed map，不调用旧active seal/author workspace/design grant。原journalRoot验证旧origin/receipt字节，导入用独立root-mapping auth receipt，不改TaskJournal.open原origin、不放宽journal。只认manifest精确旧design/art IDs，不把旧任务加入current dispatch bindings/register/save/dispatch/charge；closed C5 grants永久拒派，repair validatedDependencies由同一历史验证器播种。
- 当前装配：generation/cold resume/repair author前await bindPreparedTasks，分别绑定sourceProfile/sourceRequirement/currentScope，artifact选择/三role topology-finish与Source55 role()/boundTask/compile guards认识inherited stages、普通全current不变。保留完整capture闭包，只stage一个template，旧duplicate-destination冲突严格拒；当前execution requirement独立文件名，不覆盖旧_cosmos/execution-requirement.json。由未改accepted map派生current task/candidate/origin的v1/v2 plans，原四outputs/旧plans字节保持，new plans/coding inputs在context/signature前封存。
- 完成/验收：旧design/art来源真实passed加current coding实际build、同候选八段/media、独立coding approved和exact promotion；报告inherited，不伪造新planner/design/art通过。Source/TEMP TDD认证篡改/原fee-task-grants保真/zero planner-design-art SDK/current repair仅自身一次/cold resume不重派或重计时/stop-unknown/compiled host/54清单55编译，复用未改Edge/预算/80counter；ledger4/snapshot3/decl3/quote2不变，不冒human formal continuation，C5 partialcode可省略而不复杂replay。

### COS-57 · 准备仅编码的第六迁移案例与剩余额度准入

- 依赖/状态：[#58](https://github.com/lrfluobida/Cosmos/issues/58)，id5704092753；source54/55/56已审集成、原foundation exact markers/reviewed+merge双main祖先，outputs16/18；源码已独审集成：`d7d7e8a4cabe039b99ce41e4d53717e72bde7383`→`9ffd5e2f1c3d81ff80e2d8e8874293e320d359a3`，[公共审批](https://github.com/lrfluobida/Cosmos/issues/58#issuecomment-5987110904)；TRANSFER_CASE_SIX_SOURCE_READY/offline-verified-awaiting-live/source-integrated/open。独立raw终局1/1 pass、164签名匹配，current源码路径22分13.365秒为synthetictransport，merger代表1/1（3.1878ms）/UTF8LF/diffclean。固定cos20-transfer-validation-6已实际执行：682889ms/13codingauthor/12settled135531µ+unknown974882µ、120s流取消externalservice失败，无candidate；Rootmanifest已持久化固定SHA4acd4d03…；[公共结果](https://github.com/lrfluobida/Cosmos/issues/58#issuecomment-5988185502)，旧窗口consumed/不重开。
- 固定额度/准入（C6执行前历史）：原ledger4/snapshot3/13 stopped cases/currentC5manual/5delegations/65closed十一audits、65settled+1准入前取消、unknown/reserved0/owner idle及COS16 parent index4/refrevision1414/hash/source/首授权成员保真。原groupnet1522107/rem8477893；五正grants planning323680/design598538/art2633322/coding2122353/repair2800000合8477893，只原parent10余量，planning/design/art不dispatch SDK、unused仍原审计关闭；current planning HOST bootstrap仍有当期权限，zero planner仅指zero planner SDK。
- 驱动/恢复：免费preflight clean/pushed exact HEAD、source gates、Root manifest实际bytes/digest及C5receipts/captures；wrong role/source/member/fee/missing audit/owner等免费拒。旧可信topology派生新coding PreparedTask/自己的policy-role-tools-grants-expectedOutputs-journal，依赖保留旧passed IDs，不伪造新planned/passed或调用planner。不可变derived execution receipt支持原C6内cold resume，不重claim/重计时/重付PASS；56封存new plans/current requirement/loopback origin/source-copy闭包，native pi/Flash仅coding及自身合格一次repair，54/55工具有效。
- 边界/验收：source/TEMP TDD fixed declaration-parser/history-manifest-rolefee/source拒/只读preflight byte-mtime-file保真/原子claim+host bootstrap/inherited refs/cold resume pending与当前coded failure自身repair。原case¥5/45分钟/80/一次coding repair、design原permission/shared150首30/group10/formal20012/优化1006保持。实际manifest/账本/key/paid仅Root在最终source/docs批准后fresh preflight/funding/operator执行；当前不运行C6、不重开C5、不假human/public CLI/fullclassic通过。

Root按两个独立架构评审修订并POST+GET精确读回上述正文、native parent57children #2–#58与新checkbox，原55前缀保持。

### COS-58 · 接通公开 CLI 的推箱子准备模式生成与恢复

- 发布状态：[#59](https://github.com/lrfluobida/Cosmos/issues/59)，id5704951453；源码已独审集成：`6137cd77940953ab795f2b427e759625330a602d`→`1d300b3e31959911fa95bb3cf5639dcd3d8c2db9`，[公共审批](https://github.com/lrfluobida/Cosmos/issues/59#issuecomment-5988520016)；PUBLIC_HUMAN_PREPARATION_SOURCE_READY/offline-verified-awaiting-human/source-integrated/open。全部18paths审查，P1补实际工具/Playwright固定来源，freshcompiled1/1与mergerparse1/1通过，原未改证据复用、实际human NONE。

#### 目标

让公开 Windows CLI 在真实用户确认后，使用已有推箱子准备模式生成游戏，并在原正式运行窗口内冷恢复。此项验证 Cosmos 的迁移能力，沿用原产品目标；完整经典植物大战僵尸基准与最终体验仍按既有任务验收。

#### 已有依赖

复用 COS52 的生产 transfer helpers、COS53 的准备型草稿与模式持久化、COS54 输入文件清单、COS55 原编码会话编译自检、COS56 固定当前任务绑定。COS57 的源码装配和独立审查作为接线依据；这些依赖按各自批准 SHA / merge SHA 核对，不要求把未完成的 COS16/COS18 或完整经典基准标为 closed。

#### 范围与约束

- 公开 `new --adapter sokoban --brief ...` 映射到已有固定内部 `cos16-input/1` 准备模式；参数在存储和 provider effects 前严格解析。默认 browser 契约保持。原 `resume` 从保存的模式装配 host；任何显式选择必须与原模式一致。
- 复用现有真实 stdin 问答、草稿展示和 `confirm <revision>`。范围超出该有界 adapter 时保留 unsupported；不得把用户要求自动缩成推箱子、制造确认、地图、解法或已通过结论。
- 新 source-owned human preparation factory 直接接收真实确认的 RequirementContract 与匹配草稿。核对原 run/ledger/确认资料实际字节/当前 authority/停止与未知费用；保留 human profile、原 ¥200 总账与一次激活的 12h 时钟。底层 prepared scope/binding/lifecycle 和 transfer design-validation 一并接入 human 路径，使用原任务 workspace 与 executionAuthority。
- 运行时 design 在自己的原会话生成地图，沿既有 oracle、独立评审、固定四输出和原一次语义重写权限；art/coding 读取准确 capture 版本。接入既有八段 persistent consumer、媒体载入观测、build diagnostics 与精确 promotion。
- initial / cold resume / 既有策略允许的 linked repair 在作者派发前 await bindPreparedTasks。当前 task / candidate / origin 的计划与输入先封存，再计算 context 和签名；同原 human run 的恢复使用原 journal，已通过阶段不重派或重付。规划前只准备固定 artifact refs；规划返回后封存实际 design/art/coding 身份与按既有 continuationTargets 规则预留的 coding repair ID，然后派发设计。地图通过后封存两个计划，再启动后续作者；冷恢复读取原绑定。同窗口自动 coding repair 保留，公开 continue 的拒绝只针对额外 formal continuation。
- 记录并核对实际执行的 source 或 compiled 模块及固定依赖来源；Git HEAD 和声明 sourceVersion 仅辅助溯源。沿用现有工具权限、owned work、listener 清理和当前预算门禁。
- 本项先支持 new/resume。准备模式的 formal continuation 在确认、窗口激活与新增费用前拒绝；后续扩展另卡。不会把 validation profile、operator 决定或历史 C5 验证记录改写成 human 确认。

#### 文件归属

主要为 src/cli/index.ts、session.ts、continuation-session.ts，src/runtime/entrypoint.ts、entrypoint-host.ts、entrypoint-preparation.ts 与 adapters/transfer 必需帮助器。只补 human scope、可信模式装配和当前绑定；不重排普通 browser / validation 流程，不写目标游戏，不引入通用工作流系统。

#### 免费验收

1. source 与 compiled 代表入口：公开参数、stdin 问答/展示/精确确认、human host 装配与运行时设计来源。
2. 未确认、EOF/cancel、旧版本确认、未知 adapter、模式/确认字节篡改、错 scope、停止或未知预留，均零生成派发。
3. 真实 host + fake SDK 的新建、冷恢复、同候选八段 consumer 与一笔合格 coding repair；正确 task/plan/version、通过阶段零额外作者/评审调用、原账本和截止连续。
4. 准备模式 continue / resume --window 在 effects 前拒；默认 browser 与未改 Edge、费用和生命周期证据复用。
5. 实现者报告 exact SHA、受影响测试、UTF-8/LF/中文与已知差距；独立 reviewer 检实际 diff 后由本批唯一 merger 集成。

#### 状态与预算

PUBLIC_HUMAN_PREPARATION_SOURCE_READY / source-integrated / source-and-TEMP-only；产品实现已独审，真实human验收NONE。真实 human 端到端结果单列；不据此关闭 COS16/COS18 或宣称完整经典游戏通过。未启动新付费运行、未创建额度。共享验证 ¥150（首阶段 ¥30，COS16 原 ¥10），正式 ¥200/12h、目标 ¥100/6h 保持。

父任务：[spec #1](https://github.com/lrfluobida/Cosmos/issues/1)
稳定任务 ID：COS-58

### COS-59 · 为长编码响应设置原窗口内的可信请求时限

- 发布状态：[#60](https://github.com/lrfluobida/Cosmos/issues/60)，id5706469248；in-progress/open/SOURCE_NOT_READY，cos59_implementer从已审1d300独立cos02分支实施。

#### 问题与真实证据

真实 COS16 迁移 C6 在批准主线 `6b8aa15f5d029b313f82fdf98c5ae4b847a5f461` 上执行。编码作者可输出65536 tokens，但统一的120000ms绝对请求时限在流仍已开始后取消请求：首响应352.2225ms，120005.8155ms后 aborted，无 provider usage。13次请求中12次已结算135531 micro-CNY，最后一笔974882 micro-CNY保持unknown预留。20次读取无工具错误；没有写入、编译自检、捕获、浏览器、评审或接受候选。原C6已停止并消费，不能重开。

只读源定位确认：src/providers/pi.ts 的 body timer 在dispatch前启动、流进展不重置，同值传给SDK timeoutMs；entrypoint-host.ts所有角色统一120秒；factory暂无作者按角色timeout配置。未知usage不能用SDK默认0清账。

#### 最小范围

- 仅 coding author 增加可信源码配置的请求时限，初值600000ms；其他作者、reviewer、规划和intake沿原120秒。
- 每次请求将有效时限裁剪到原当前窗口deadline剩余时间减既有清理余量。body timer与SDK timeoutMs使用同一有效值，controller/caller stop和预算/调用计数边界继续有效。
- 配置由可信角色factory提供，模型/游戏不能选择或延长。coding repair仍属于同窗口coding author，使用其真实current authority。
- 不增加自动重试，不把unknown清为0，不改变billing/schema/余额/ledger版本，不增加请求或修复次数，不延长任何case或正式窗口。
- 预计生产文件仅src/roles/factory.ts、src/runtime/entrypoint-host.ts、src/providers/pi.ts，及必要定向测试/计划；避免重构流式SDK或全仓库哈希。

#### 免费验收

1. 合成流持续进展，超过旧短时限后在新的可信coding allowance内正常完成；缩放时钟或短测试配置，避免等待10分钟。
2. coding override有效，其他角色/reviewer/intake保持原值。
3. deadline或stop仍及时取消；无usage保持unknown、阻止新付费派发与工具；没有自动重试。
4. body/SDK timeout有效值一致，剩余清理时间不足时在发送前拒绝；原stalled-SSE/取消/预算证据仅按影响范围复用。
5. 独立review实际diff、exactSHA、UTF-8/LF/中文和受影响source/compiled代表；由同批唯一merger集成。

#### 状态与边界

CODING_REQUEST_TIMEOUT_SOURCE_READY / source-integrated / source-and-TEMP-only；`b912f0e1751ea49e3749a487dd97759efbea43e4`经专属独审APPROVED，合入`4139a822d87c9ed8f819d22bd051148c45da45a0`；[公共审批](https://github.com/lrfluobida/Cosmos/issues/60#issuecomment-5988885202)精确读回。作者28source/1compiled/typecheck/strict/build、独审5TEMP和merger1/1通过，未改证据复用。新策略须以新的、获准案例验证；旧C6失败、unknown预留和原14案例历史保持。Root等待provider账单/usage核对，不能重付或伪造结算。共享验证¥150/首阶段¥30/COS16原¥10、单案例¥5/45分钟/80请求、正式¥200/12h与目标¥100/6h保持。

源码前置：COS03 pi/provider、COS06调度/取消、COS55编译自检、COS57仅编码入口的已审源码；无需等待未完成的完整经典基准或把COS16/COS18标closed。
父任务：[spec #1](https://github.com/lrfluobida/Cosmos/issues/1)
稳定任务 ID：COS-59

### COS-60 · 准备带编码时限的第七迁移案例与已核实余额准入

- 发布状态：[#61](https://github.com/lrfluobida/Cosmos/issues/61)，id5707067158；native parent已关联。最终`a8d4f97bc61e84d0579df952bd39703aabcab2d3`独立整体APPROVED/TRANSFER_CASE_SEVEN_SOURCE_READY，合入`5a15510a1201482d9fa629096a17449463176d31`，21批准文件/UTF8-LF/diff/parser1/1核对通过；[公共审批](https://github.com/lrfluobida/Cosmos/issues/61#issuecomment-5990992898)精确读回。Source/TEMP13focused、source/compiledmutation1/1及current/cold/tool1/1通过，991机制26min1/1与314archiveSHA独审复用；实际main免费preflight期望拒unknown且ledger bytes/mtime/files不变，实际C7/paid/human NONE。

## 目标与当前事实

为修复后的编码请求时限准备新的固定迁移案例 `cos20-transfer-validation-7`。COS59 已独立批准 b912f0e1751ea49e3749a487dd97759efbea43e4 并合入 4139a822d87c9ed8f819d22bd051148c45da45a0；原 C6 在 120 秒流时限失败并停止，不能重开。

当前共享账本仍有一笔 974882 micro-CNY unknown 预留，14 stopped cases、6 delegations、65 closed grants、11 closure audits。本任务只实施源码和 TEMP 验证；真实账务核对与第12笔 allocation closure 由 Root 另行执行，当前不能 claim 或付费。

## 范围与契约

- 新案例拥有自己的固定 ID、root、marker、manifest、声明、operator source、任务和执行回执；不复活原 C6、不修改历史结果或调用原未完成 coding 输出。
- 只在原14案例已停止、原六次 COS16 delegation 保真、所有费用真实核实且 unknown/reserved 为0、原70 grants/12 closure audits完整、所有 owners 空闲后，免费 preflight 才能允许新 claim。当前 unknown 状态必须只读拒绝、零 SDK、零写入。
- 新声明的五角色额度从原 COS16 ¥10 的固定角色初始容量与六案例实际已结算费用确定性推导；coding 不能假定未知账款为0，也不能把其预留当作实际费用。校验原 parent index4/refrevision1414/hash/首授权、全部 member case IDs 和每角色费用归属，拒绝重复/外来条目或非正余量；不得从其他角色借款或新增额度。Root真实核对前不填写“最终剩余额度”。
- 新旧所有 grants 之和、预算组的派生净额与剩余容量一致；quote 覆盖准确 snapshot revision/bytes、声明、角色额度、manifest digest 和 source身份。quote 生成后账目、费用或声明变化即拒绝旧 operator 决定。
- 原 C5 两个独立 passed design/art 阶段和七 capture 继续按 COS56 完整校验；新 C7 manifest 绑定原 C5 来源与新 root。零 planner/design/art SDK；当前 planning grant 仅承担可信 host bootstrap。复用 COS57 已审的 coding-only contract、原生 pi/Flash、生产 consumer、角色文件清单和编译工具。
- 只有 current coding author 及原窗口内合格的一次 coding repair 可调用 SDK。使用 COS59 600000ms source cap、每请求当前原 authority/deadline 减5000ms裁剪；其他 role/intake、预算/调用计数、maxRetries0、unknown阻断及旧声明前缀保持。
- 新初始派发和 cold resume 都核对准确当前 source、实际 reuse digest、自己的 current requirement/plan/task IDs、原窗口和 source+compiled 执行闭包。过期、停止、错误case、额外重试或历史coding/session输入拒绝。
- 单案例 ¥5/45分钟/80请求/一次 coding repair；共享验证 ¥150、首阶段 ¥30、COS16 原 ¥10，formal ¥200/12h 和目标 ¥100/6h 均不变。

## 文件与方法

预计 `probes/transfer/validation-case-seven-*`、必要的可信内部复用 seam、对应 `tests/transfer/` 和实现计划。先写并独立审查计划，再由专属 implementer TDD；用最小内部接口复用已审链路，避免复制整条编排器或重构 unrelated 代码。旧 C1–6 包装、输入哈希和行为必须有原样保持证据。

## 免费验收

1. 原 C6 unknown/预留、未closure12、活跃owner、错误history/source/parent/grant/member/cost均免费拒绝；snapshot bytes/mtime、历史文件和目标root/marker不变。
2. TEMP 构造两种不同的合法最终 C6 核实费用，按实际 ledger 得到不同但正确的 coding余量；未核实不得推导可执行额度。新 quote对金额变化失效。
3. 合法停止与关闭的14案例基线原子 claim C7一次，不修改旧14案例、六delegation、12audit和原费用前缀；source gates必须包含 COS57/59准确review+merge祖先。
4. 初始和cold恢复保留两个历史 passed 阶段、新 requirement/任务/plan/source闭包；只当前coding SDK、独立评审和合格一次同窗repair。复用旧重型通过证据，仅运行新的边界与一个必要组合代表。
5. 独立 reviewer 检查实际 diff、exact SHA、source/compiled代表和UTF-8/中文；同批唯一 merger 集成。合成 transport及正常浏览器输入证据如实分列，不能冒充实际付费生成或human确认。

## 状态

TRANSFER_CASE_SEVEN_SOURCE_READY / source-integrated / source-and-TEMP-only；整体源码已独审，当前实际main preflight拒unknown，真实C7 NONE。真实 C7 claim、closure12、provider调用、费用和human体验均 NONE；旧 C6 unknown974882 保持，等待真实费用核对。源码准备可以继续，真实运行不越过门禁。

源码前置：COS56/57/59 的独立批准集成；结果用于 COS16，公开 CLI 和完整经典目标沿原验收标准。
父任务：[spec #1](https://github.com/lrfluobida/Cosmos/issues/1)
稳定任务 ID：COS-60

### COS-61 · 接通准备模式首个显式编码追加窗口

- 发布状态：[#62](https://github.com/lrfluobida/Cosmos/issues/62)，id5708959437；native parent已关联、当前61children。专属implementer只读穿刺已完成，计划准备中，SOURCE_NOT_READY。

## 目标与只读穿刺

接通公开 CLI 推箱子准备模式的首个显式编码追加窗口。COS58 已接入 new/resume，但 continue 和 resume --window 在 CLI/runtime 显式拒绝；现有 human scope 只承认原 ¥200/12h、windowId=null 和原任务绑定。只移除拒绝会误用旧授权、旧候选计划和旧来源，不能达到原 COS18 的续跑契约。

仅覆盖原 human 准备运行中 design/art 已独立 passed、来源完整可验证、恰一个有效 coding target 未完成的情况；有效 source 可以是原已登记 coding repair。设计或美术未通过、无有效编码目标、第二个追加窗口在报价确认和激活前明确拒绝。最终试玩等待计时阶段另行实现。

## 必须复用的授权与历史

- 沿用 buildContinuationQuote、真实 stdin 的 confirm <quoteId>、activateContinuation、executeContinuation/resumeTaskDag、原统一账本与 owner 生命周期。没有确认的 quote、cancel、EOF、陈旧报价不得激活或产生模型费用。
- 原 run/ledger、需求确认资料的实际字节与来源、原 ¥200/12h 成绩、费用、失败、stop 和原两个 passed 阶段完整保留。新增金额、时间和窗口结果单列，不能把追加后的成功计为原上限内成功。
- 新窗口严格沿既有 continuation policy：每个目标一次新尝试，自动语义修复0。原已登记 repair 仅作为明确有效 source，不新增隐含 repair 或复活旧任务。
- 付费访谈、设计与美术不重跑；当前新增 SDK 只属于新 coding 尝试及其独立 reviewer。原 design/art 的 journal/capture/approved review/signatures/地图/素材字节仅用于认证复用；不能把 operator_validation 的 C5/C7 身份伪装成 human 或重新授予旧阶段活动权限。
- 原 human scope 与新 continuation scope 分离：新 scope 核对准确 window/grant/deadline、原确认版本及新的真实 operator source；unknown/reserved、停止/过期、未收敛 owner/child 和来源漂移必须拒绝。不能靠候选版本字符串推断权限。

## 计划、执行与恢复

- 复用原固定地图与素材，生成准确绑定新 coding task、candidate、loopback origin 的当前两张计划。新计划引用在 immutable ContinuationPlan、prepared task/context、inputFiles、签名与独立评审输入中提前封存。
- 现有 continuation-plan 会保留原 coding inputs，continuation-inputs 又要求精确依赖映射。专属计划须明确最小可信扩展（固定 current preparation inputs 或 context.interfaces 均可评估），不能派发后 append、沿用绑定旧 v1/v2 的计划或降低原六T16/八段 consumer 条件。
- 当前 source/compiled、实际 SDK/browser/build 执行闭包、plan、candidate、loopback、task binding 和执行回执存入该窗口自己的固定命名空间。原 human source/tasks/prepared/origin 回执不覆盖。冷恢复与每次 dispatch/tool/promotion重新核对当前来源和原 passed lineage。
- 覆盖激活后 plan 前、plan/origin 后、部分注册后的中断；恢复同一 window、deadline、ledger 和原回执，不重复 claim、收费或消费 passed 阶段。
- 准确接通公开 quote/continue/resume --window/stop、原-session编译工具、同候选 consumer、独立 code review 和 exact promotion。清理须 await listener、受控子进程及 owner idle 后确认停止，不能提前报告成功。

## 方法与文件

先专属 implementer 提交实现计划，独立 reviewer PLAN_APPROVED 后 TDD。最小可能范围：src/cli/index.ts/session.ts/continuation-session.ts；src/runtime/entrypoint*.ts、continuation-plan.ts、经测试证明必要的 continuation-inputs.ts；transfer runtime-host/loopback-origin 与有限历史 design audit helper；定向 tests、README/quickstart/计划。具体以只读源证据和计划明确，不重写原执行器或借本卡实现全部不同游戏、第二次追加或最终等待阶段。

## 免费验收

1. 默认 host 和准备模式原 new/resume 行为保持；符合上述仅编码 lineage 的首个 quote/confirm/activate 正常，非法范围/陈旧/未确认免费拒绝并保持 snapshot/旧原始文件。
2. 真实命令入口加模拟 stdin 覆盖 quote、准确 confirm、cancel/EOF、激活后的 cold resume --window 和 stop；测试来源明确为 fixture，真实 human 尚无。
3. 一项 source/TEMP 组合：原 design/art 真实合成 passed 验证；新 coding/new plan/source/current authority，正常 consumer/independent review/exact accept；仅当前 coding/reviewer 调用，原 passed0重复收费、自动 repair0。
4. 激活/计划/部分注册中断，以及 source/plan/input/origin/candidate/费用/owner 变化拒绝；恢复保持窗口、旧回执 bytes/mtime、当前绑定和费用连续性。
5. source/compiled 实际依赖闭包变更拒绝和 listener/child/owner清理代表。复用已过 Edge、大矩阵、编译工具、预算与生命周期证据，新增检查仅覆盖本卡变化。
6. 独立审实际 diff，按规格再质量，UTF-8/中文/readback和exactSHA证据，唯一 batch08 merger 集成；不将合成试玩当实际生成或最终经典验收。

## 状态与预算

SOURCE_NOT_READY / source-and-TEMP-only / plan-in-progress。当前真实 C6 的974882 micro-CNY unknown、65 closed/11 audits保持；真实 C7/closure12均未执行。本卡实施无模型费用和真实用户确认，不触 Root 的账本、凭据、会话或参考安装。共享验证¥150/首阶段¥30/COS16原¥10、案例¥5/45min/80，以及 formal原¥200/12h/目标¥100/6h不变；追加仅在未来真实用户明确决定后生效。

源码前置：COS18已有 formal continuation、COS52生产transfer host、COS53准备草稿、COS58 public human准备模式的独立批准集成；COS59 coding时限和COS60 execution-source闭包证据可复用，不要求未完成的COS16/COS18或完整经典基准先closed。
父任务：[spec #1](https://github.com/lrfluobida/Cosmos/issues/1)
稳定任务 ID：COS-61

## 5. 任务与上下文包模板

以下是字段约定草稿，COS-02 将其变成可验证 schema；凭据与完整历史对话不得写入任务包。

```yaml
task_id: COS-XX
kind: platform_development | runtime_generation | evaluation
run_id: 运行标识；平台任务与游戏运行分别记录
spec_version: 已确认版本
acceptance_ids: [固定验收条目]
objective: 单项可检查结果
depends_on: [任务 ID 与所需状态]
inputs: [{artifact_id: 产物标识, version: 固定版本, location: 位置}]
context: {rules: 相关规则, interfaces: 接口, known_failures: 已知失败}
ownership: {write_paths: 允许路径, read_only_paths: 只读路径}
outputs: [{type: 产物类型, schema: 契约版本, destination: 目标位置}]
acceptance: {steps: 验证步骤, expected: 通过标准, evidence: 证据位置}
budget: {ledger_id: 共享账本, allocation_cny: 本任务预留, deadline: 原运行截止时间}
state: 未开始 | 可执行 | 执行中 | 待审查 | 需修改 | 通过 | 失败 | 等待用户 | 已取消
attempts: [{attempt_id: 尝试标识, session_ref: 会话位置, outcome: 结果}]
handoff: {completed: 已完成, remaining: 剩余, uncertainty: 未决, resume_from: 恢复点}
review: {context_id: 独立上下文, input_versions: 固定版本, verdict: 结论}
```

预算账本至少记录请求 ID、供应商、计价版本、预留、已结算、未知状态和对账证据。运行记录保存初始起点、截止时间、已用费用、人工决定及产物引用；任务额度是总额内分配，不创造新额度。

## 6. 发布前检查与待定边界

- [ ] 主 spec 已同步 ¥150 验证总额、¥200/12h 完整运行硬上限、¥100/6h 优化目标、硬停止、音频与最终试玩要求，历史调研算例标为历史建议。
- [ ] pi SDK / TypeScript / Phaser / Playwright 已写为初始实施基线；供应商与凭据可用性、pi SDK 接入和图像服务能力按验证任务检查。
- [ ] COS-01 已记录用户准备可运行经典 PC 参考版的前置条件；验收值引用整体验证后的 spec 第 4B 节，迁移用例在执行前固定。
- [ ] 所有任务保留“调查完成 / 切片通过 / 正式完成”的区别；没有把未经核实的精确数量当最终事实。
- [ ] 父子 issue 关系、依赖、负责人上下文与文件归属可发布；发布动作由主线程执行，本文不进行 GitHub 修改。
