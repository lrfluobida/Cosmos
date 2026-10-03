# Cosmos 父任务与子任务发布稿

状态：2026-10-04 更新。[主 issue #1](https://github.com/lrfluobida/Cosmos/issues/1) 与 34 个原生子任务已核实；[发布映射](github-issues.json) 保存实际编号、链接和依赖。任务尚待逐项实施与验收。

补充任务：[COS-18 / #19](https://github.com/lrfluobida/Cosmos/issues/19) 承接原 R4/R11 已确认的需求访谈与 Windows CLI 入口要求，A/B 已部分集成，整体验收与缺口仍保持 open。[COS-19 / #20](https://github.com/lrfluobida/Cosmos/issues/20) 承接原 R4/R5/R12，修复真实失败暴露的角色交接格式、截断诊断与输出配置；当前离线实施，不改变范围或预算。

新补充：[COS-20 / #21](https://github.com/lrfluobida/Cosmos/issues/21) 在原开发验证授权和预算内准备显式 validation profile 与新有界 case；源代码审查、集成及准入完成后才由协调者执行。正式生成 ¥200/12h、验证合计 ¥150 和首批累计 ¥30 保持不变；原窗口和已消费 case 不重开。

失败修复：[COS-21 / #22](https://github.com/lrfluobida/Cosmos/issues/22) 承接首个 native case 暴露的 Windows 模板 capture 原子 rename 失败；沿原 R5/R11 免费诊断并修复，不扩大范围或预算。

调用实验：真实Case7已进入host/browser，但第005步和HUD元素错误导致insufficient_evidence，后续skipped、无独立codingreview/repair/accepted；54请求新增¥1.223114、共享¥5.459031。Case6原paid run仍author_handoff失败，未改v1的独立免费Edge111步诊断保持通过。COS30/COS31源码审批与offline-verified-awaiting-live/open保持；第五笔C7未用容量closure已完成，不重开旧案例或追加预算，新case8未claim；COS32/COS33源码已独审集成，COS34仍SOURCE_NOT_READY。

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
- [ ] [COS-10 由 Cosmos 生成真实端到端切片](https://github.com/lrfluobida/Cosmos/issues/11)
- [ ] [COS-11 实现受约束的修复与重新规划](https://github.com/lrfluobida/Cosmos/issues/12)
- [x] [COS-12 验证取消、异常退出与恢复](https://github.com/lrfluobida/Cosmos/issues/13)
- [ ] [COS-13 验证并行调度与长时执行边界](https://github.com/lrfluobida/Cosmos/issues/14)
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

- 依赖/状态：G2；仍使用全部验证共享的 ¥150 余额。
- 输出/范围：`probes/e2e/` 与独立运行产物；从通用模板出发，由运行时完成有资源、冷却、波次、胜负及重开的一个关卡。
- 工作：串起需求、设计、生成代码/原创动作/音频、集成和独立自动验收；平台实施者不手写该关卡补齐证据。
- 增补测量：拟先在累计不超过 ¥30 的有界探针额内测一组不同机制与一次修复，费用仍计入共享 ¥150 验证账本；按固定开销、机制族、资产类、集成与验收外推，不按关卡数简单线性放大。
- 通过：正常输入覆盖胜利、失败、资源不足、冷却边界与重开；费用和耗时完整，产物可独立启动，人工介入逐项披露。
- 失败/证据：只有预制样例运行、外部手写游戏冒充 Cosmos 生成或缩减验收后过关即失败；保留完整运行链与失败报告。
- 边界：此关通过只证明端到端链路；完整内容清单和最终还原目标保持不变。

### COS-11 · P1 · 实现受约束的修复与重新规划

- 依赖/状态：COS-10；复用其产物与证据，不无故重新生成。
- 输出/范围：`src/runtime/repair/` 与失败分类、修复交接、无进展终止规则。
- 工作：反馈携带复现、期望、实际、产物版本及验收 ID；分别处理代码缺陷、服务异常、需求冲突和依据不足。
- 通过：预置缺陷可转给正确角色，定向修复经独立复核；重复无进展或预计超限会停下并交付差距。
- 失败/证据：作者删除失败用例、降低容差、无限重试或把缺少依据当代码缺陷绕过即失败；保存每次尝试与费用。
- 边界：重试次数按验证结果固定并写入配置；需求/预算变化由用户决定，常规修复不增加人工签收点。

### COS-12 · P1 · 验证取消、异常退出与恢复

- 依赖/状态：COS-06、COS-09、COS-11。
- 输出/范围：`src/runtime/recovery/`、故障注入场景与恢复报告。
- 工作：覆盖生成中取消、落盘前后崩溃、付费请求已发送但返回丢失、已完成产物尚未登记等边界。
- 通过：恢复仅派发未完成工作；核对未知请求后再决定重试，已验收产物保留，费用预留与截止时间连续。
- 失败/证据：取消后继续写入交付、同一结果重复付费、孤儿任务被当成功或预算静默重置即失败。
- 边界：无法核对的请求标记等待处理并保留保守额度；不能由模型猜测成功/失败后继续消费。

### COS-13 · P1 · 验证并行调度与长时执行边界

- 依赖/状态：COS-07、COS-08、COS-12。
- 输出/范围：`src/runtime/scheduler/` 与长链路/并发验证记录；依赖调度、进度摘要与资源限额。
- 工作：注入并行资源冲突、服务退避、长上下文压缩和临近截止时间的运行；保留已通过任务并重派受影响部分。
- 通过：无重复执行和漏任务；并发预留不超额；到时停止新工作并收敛在途任务；用户能据状态继续处理。
- 失败/证据：有任一失联付费任务未记账、失败依赖仍被使用或报告“完成”但证据不齐即失败。
- 边界：可用模拟时钟验证 12h 硬截止边界，但必须标为模拟；少量真实长链路用于测量，不能声称已实际跑满 12h。

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

- 依赖/状态：COS-10、COS-13、COS-18；用例先固定，可与完整基准工具准备并行。
- 输出/范围：`probes/transfer/`；一个区别于塔防规则的小型 2D 需求、运行产物及平台改动记录。
- 工作：使用相同角色契约和通用模板生成，检查需求、代码、素材与验收能否重新组合，不依赖塔防专属编排分支。
- 通过：按事先固定的功能和正常输入场景完成；报告新增的平台通用能力与人工修改，不能预制该游戏再套运行记录。
- 失败/证据：必须手改编排器才能替换核心规则，或调用量超出共享验证余额即记录失败/阻塞并说明原因。
- 边界：付费部分仍计入 ¥150 验证总额，先预留再开展；迁移通过不增加对任意 2D 游戏都能成功的承诺。

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

- 第五笔真实closure：root在source `2404982d075cf7f69c914eb1ad41e9162807747c` 于`2026-10-03T16:17:34.316Z`应用realcoordinator/operator_validation_allocation_closure；revision1079→1080/ledger3保持，仅新关闭C7五grants/released19,776,886，累计35closed/5audits。Allocated108,715,555→88,938,669/unallocated41,284,445→61,061,331，shared费用5,459,031/unknownreserved0不变；run/tasks/requests/stop/seven histories、ledger entries/allocamounts、旧30closures/4receipts/events-prefix逐项deepEqual。Node3.284秒/exit0/model0/ownerReleased，不清费或刷新旧窗口，current为stopped7、新case8未claim；quote/decision精确值见mapping actualAllocationClosure5，前四笔原记录保持。

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
- 实际路径证据：C7原coding两uncertainties经scope澄清仍保留，真实build/v1capture后已进入host/browser，证明新host证据路径实际被调用；browser第005步失败、后续skipped、没有独立codingreview/accepted，不能记全部HostAC或逐项ConcernResolution通过。原source marker/source/merge/offline/open保持，失败单列在COS31。

### COS-31 · 验证主机证据驱动的完整原生生成

- 依赖/状态：已发布 [#32](https://github.com/lrfluobida/Cosmos/issues/32)，id5689873259，第31个原生子任务、父checkbox已读回；offline-verified-awaiting-live/open。`8a07e66d065ba6ddec719ea29e6b519898276c23`（base `8d23a9e8319a7d1b235e1c0abaa6ba0a7ea10e62`）获独立 CASE_SEVEN_SOURCE_READY，合入 `21218fd0624034f6d8abad38bd7de2cc8341606c`；这是执行前源码审批，[公共源码审批](https://github.com/lrfluobida/Cosmos/issues/32#issuecomment-5970626041) 已精确读回，实际C7失败另列。Source前置COS-20..30为独立已审集成源码，精确approval marker及reviewedCommit/mergeCommit双frozen-main祖先，不要求failed任务closed；产出反馈COS-10/COS-20。
- 输入/约束：newfixed `cos20-native-validation-7`，declaration-v2/80/同9inputs/model/outputcaps/五grants¥21/newcase¥5/45分钟/一次codingrepair/shared¥150/首批¥30保持；nativepolicy强固定 authorProtocolCorrections:1、codingHandoffClarifications:1、hostEvidencedCodingHandoff:1。旧六cases/声明/hash/quotes/40或80/日期/费用/permission保持，不修改原C6game或用free111改其accepted状态。
- Case7执行前准入/证据（历史）：当时Current为manual-stopped6、prior1..6均停止收敛，30closed grants/four真实closure记录精确认证；COS29 CASE_SIX_SOURCE_READY及COS30 HOST_EVIDENCED_HANDOFF_SOURCE_READY 精确审批/source+merge双SHA须通过，SOURCE_NOT_READY不准执行。Source30接口、caller和新decl均已独审集成；复用作者31focused与唯一strict noEmit、独审tempFS6/6/0skip，九逻辑/十物理批准路径字节一致、UTF8/noBOM/LF/diffcheck通过，联合固定声明/opt-in policy代表1/1/0skip（1.7087ms）。当时最终文档批准后root fresh exactmain quote/资金/operator/freeze再执行。
- Case7实际结果：source `2404982d075cf7f69c914eb1ad41e9162807747c`，UTC`2026-10-03T15:47:24.285Z`开始/原定`16:32:24.285Z`截止/`15:56:47.389Z`结束，563,104ms；54calls=planning1/design10/art17/coding26/repair0，费用micro-CNY=15,106/113,027/526,943/568,038/0，新增1,223,114/shared5,459,031/unknownreserved0/snapshot1079/ledger3。design/artpassed、codingbuildpassed/v1captured、scope澄清后两uncertainties保留且host/browser已进入；111plan前三checks和startinputpassed，第005步“准备开始”!=“防守中”failed，后续skipped。pageerror指出`[data-testid="wave"]`缺失，原index strong只有id="wave"而hud.ts要求data-testid=wave；报告3错误/局部boundedDeadlineError/Edgeforcedexit，diagnosis insufficient_evidence，无独立codingreview/repair/accepted，不是111passed。Node32584/Edge31536 dead、exec27393 exit1/keyclear/锁absent后root解冻；closure5只归还未用容量，费用及旧六案例不变。
- 通过/边界：全部原HostAC/additionalchecks、按每个concern绑定当前版本证据的独立review、normal input/accepted candidate齐备才写native通过，不以旧free诊断或fixture代替新版本证据。当前源码审批保持，C7失败已停止、不重开或手改原game，新case8未claim；G3/G4与完整classic/用户体验仍未通过。

### COS-32 · 区分游戏断言超时与浏览器故障并触发有界修复

- 依赖/状态：已发布 [#33](https://github.com/lrfluobida/Cosmos/issues/33)，id5691425244，第32个原生子任务、父checkbox/原生关联已精确读回；offline-verified-awaiting-live/open。独审 BROWSER_DEFECT_CLASSIFICATION_SOURCE_READY 批准 `af883ba936806003034ea5015dfc3d1ce11939a8`（父 `2031bd073cb3ecd126c875daa7194ee1957fd0af`），合入 `bc24755518abe5c2f8c02e6fbf1add6414c72f33`；source前置COS-07/08/11/13/20/30为独立已审集成源码，验证产出COS-10/COS-20/COS-31，不要求失败任务closed。 [公共源码审批](https://github.com/lrfluobida/Cosmos/issues/33#issuecomment-5972022726) 已精确读回。
- 输入/范围：C7实际第005步失败、HUD selector缺失、局部等待超时与强制退出记录；作者先≤300词设计交root审阅，再以TDD修runner/diagnostics的失败分类与既有有界repair路由。原C7生成文件及报告保持，不手改旧游戏。
- 通过/约束：区分游戏断言超时和真实浏览器故障，保留足以判断原因的pageerror/步骤/进程证据；可判定的游戏缺陷反馈沿已有一次coding repair，不能因清理时强制退出而抹掉已有游戏错误，也不将真实浏览器/基础设施故障假归为已修复。原HostAC、独立review、金额/请求/截止和unknown费用守卫保持，不新增semantic repair或把部分计划写为通过。
- 源码证据/当前边界：四批准路径逐字节一致、UTF8/LF/中文/diffcheck通过；复用作者23pure、首P2修正10pure、termination20/shared6、两不同真实Edge fixture各1/1及初次/增量types证据，独审增量6/6、2.92秒、0skip/exit0。联合仅运行局部观察race归类代表1/1、0skip（7.2949ms），未重复Edge/compiler/长driver。两实际保存报告在新可信事实下诊断为code_defect（1），原C7保存报告仍为insufficient_evidence（2）；原C7失败、费用和closure5不被回写，新case8仍须caller自身独审、最终metadata/preflight/operator/freeze后才能执行。

### COS-33 · 验证浏览器缺陷反馈后的完整原生生成

- 依赖/状态：已发布 [#34](https://github.com/lrfluobida/Cosmos/issues/34)，id5691425850，第33个原生子任务、父checkbox/原生关联已精确读回；offline-verified-awaiting-live/open。独审 CASE_EIGHT_SOURCE_READY 批准 `d5df6e3d7ed8258356af4316d496acdb5e1f99c9`（base `bc24755518abe5c2f8c02e6fbf1add6414c72f33`），合入 `887d51459ef8e5b55a9ed10a6f83a45fd6017567`；source前置COS-20..32的精确审批marker/reviewedCommit/mergeCommit均须独立已审并为冻结main祖先，验证产出COS-10/COS-20，不要求failed任务完成关闭。 [公共源码审批](https://github.com/lrfluobida/Cosmos/issues/34#issuecomment-5972107850) 已精确读回。
- 输入/范围：固定全新 `cos20-native-validation-8`，沿用declaration-v2/80、同9inputs/model/outputcaps、五grants合¥21、新case¥5/45分钟/一次codingrepair、shared¥150/首批¥30；当前prior1..7已停止，35closed grants/五笔真实closure记录须精确认证，COS31/COS32及caller源码已独审集成，尚未claim或paid。
- 准入/验收：pureFS声明、caller和七历史/35closures/五audits/source门槛已独审通过；作者31focused与唯一strict7.202秒/importClosure exit0、独审6/6/0skip（71.592秒）复用。八逻辑/九物理批准路径（含test git mv）字节一致、UTF8/LF/中文保持/diffcheck通过，authorProtocolCorrections/codingHandoffClarifications/hostEvidencedCodingHandoff 均保持1，host文件原字节保持；联合固定声明代表1/1、0skip（2.0592ms），未重矩阵/compiler/Browser。最终docs批准后root用准确finalmain做免费preflight/资金核对/真实coordinator决定并冻结，再执行；全部原HostAC/additionalchecks、逐concern当前版本证据的独立review与normal-input/accepted candidate齐备才记通过，保留真实失败与有界repair证据。
- 当前边界：源码已独审集成，仍无case8 root/marker/paid结果，不重开C7、修改原game、清费用或扩总额。C7 failed、C6 free111诊断及旧七历史与closures均保持，G3/G4和完整classic/用户体验未通过。

### COS-34 · 持久化最终用户体验决定并绑定交付版本

- 依赖/状态：已发布 [#35](https://github.com/lrfluobida/Cosmos/issues/35)，id5692013242，第34个原生子任务、父checkbox/原生关联已精确读回；in-progress/open/SOURCE_NOT_READY。source前置COS-08/11/18的已审集成源码，COS18仅部分源码就绪，不要求其任务closed；产出反馈COS-18/COS-17/COS-15，补既有COS18/R17缺口，不扩大产品范围。
- 范围/已审方案：作者先≤300词设计交root批准，再pure TDD实现正式generation最终体验决定；用户只显式approve/reject/cancel，host内部绑定准确交付hash、report/current candidate/attempt及独立review，使用owner短锁和一次性write-once receipt，保留等待用户体验阶段。Validation案例不作为最终用户体验确认，决定入口不调用模型、费用为零。
- 通过/约束：持久记录真实用户的明确决定及其对应交付版本，恢复和状态读取保持同一身份/来源；缺少当前版本的客观验收或独立review、错版本或不可持久化不得冒充认可。Reject/cancel不写最终体验通过，不以fixture、coordinator授权或model输出伪造human决定；等待用户试玩单独记录，原费用/截止/预算不重置。
- 当前边界：设计已审不等于源码批准；作者独立分支TDD进行中，无批准source/merge SHA或真实用户体验通过记录。Case8主线冻结期间可继续独立准备，未获独审不合main；父目标、G3/G4和完整classic仍未通过。

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
