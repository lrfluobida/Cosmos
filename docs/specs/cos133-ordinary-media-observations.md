# COS133 · 普通游戏逐步骤媒体观测契约

状态：固定规格/计划已由独立 `media_observation_contract_reviewer` APPROVED_PLAN、无P1/P2，Root批准工程设计及免费源码实施；source pending，尚未独审或集成。

任务：[COS-133 / #134](https://github.com/lrfluobida/Cosmos/issues/134)，原生父COS18/#19、未勾选。实现者 `media_observation_contract_implementer`，独立源码reviewer `media_observation_contract_reviewer`，唯一merger `public_agent_batch_merger`。

- 批准规格输入 SHA256：`810046fed3c73222614f5cac01be15084c740f2176f91ecc74970edda7d94c34`
- 批准计划输入 SHA256：`6c9e2b9722018b08dee4f3f3924be46edee075087b25a5f617db86123f2b31b0`

登记/实施基线：`844df4c7e09d7bbbad0b1a4d0cf2e3006801d9fd`；已发布runtime `ac1c745eb0be016f8a556edbadabad013fbf61bd`。下文设计诊断基线按批准原文保留。[配套实施计划](../plans/2026-10-27-ordinary-media-observations.md)。COS132/COS133并行，不互设阻塞；最终组合的实际reviewer报价为下一次付费前置。本次仅免费源码实施，旧reuse-1永久failedclosed，不操作真实run/ledger/coordinator。

状态：已独立APPROVED_PLAN并获Root批准免费实施；源码pending。基线 `7b5d837636d8f58394182fdad78c51b3806ebdb7`，已发布 runtime `ac1c745eb0be016f8a556edbadabad013fbf61bd`。

## 问题与范围

当前真实运行在设计作者请求准入处结束，未进入独审、art 或 coding。本卡不把它归因于媒体执行器。其最终设计和计划通过结构校验，但遗漏了若干原需求顺序；结构成功不能代替独立语义批准。

现有能力可复用：

- `src/acceptance/plan.ts` 已允许 `debug` 标量相等断言；`browser.ts` 只读取不可配置、不可写的 `cosmosDebug`，拒绝嵌套 getter/setter。
- `validateBrowserScenario` 仍要求每项客观 AC 有正常点击后的可见断言，媒体 debug 可以补充，不能替代它。
- 编码规则已要求 `decoded/started` 来自实际 Phaser 缓存与成功播放，并明确禁止常量、要求独审查源码。host 并非只有 DOM 观测。
- 两阶段 host 对各文档采集媒体观测，末端 coverage 证明每个媒体曾加载/播放；它不证明某一步静音、首次点击顺序或当前循环。
- 普通设计规则却只介绍 `text|visible`；编码规则仅暴露累计布尔量，因此作者用 `#audio-state` 文案代替实际音频证据。

目标：复用原 plan/debug/runner/raw report，为普通设计、coding 及其独审提供同一小型媒体状态约定。保持全部原客观要求、体验要求、预算、时限与一次真实浏览器重开。本卡不实现新执行框架、不增加计时要求，也不改已确认需求或旧生成游戏。

## 契约选择

沿用 `ordinary-acceptance-plan/1`、现有 `Observation` 和 `media.audio` 数组，不新增格式版本、动作、表达式、脚本或接受器。新增 `media.audioById` 只读同源视图；每个键映射到同一实际音频记录，并提供下列补充字段：

| 路径 `media.audioById[clipKey].…` | 类型 | 来源与含义 |
| --- | --- | --- |
| `id/decoded/started` | 原类型 | 保持原含义；与 media.audio 数组中同 ID 的记录同源，数组仍按实际 manifest 顺序。 |
| `playing` | boolean | 该 ID 任一实际音频实例当前正在播放，暂停/停止/结束后相应实例为 false。 |
| `looping` | boolean | 任一当前播放实例的实际引擎 loop 状态为 true；不能复制 manifest 的 loop 声明。 |
| `outputActive` | boolean | 任一正在播放实例的实际输出链启用：AudioContext 为 running，实例和 manager 的实际 mute/gain 均允许非零输出。 |
| `outputActivations` | 非负安全整数 | 当前文档累计进入上述可输出状态的次数，保存短音效已结束前发生的事实；具体计数规则见下。 |

### 数据来源与计数

1. 标准 Phaser WebAudio 路径读取实际 sound 对象、manager/context、实际 gain 节点或对应真实 getter；不读取按钮文案、业务 `soundEnabled` 布尔、期望值或 manifest 常量作为输出证据。Phaser 3.90.0 的实例/全局 mute 和 volume getter 本身读取 gain.value，PLAY 在实际创建并启动 buffer source 后发送。
2. 对每个 ID 的全部实际实例跟踪 PLAY、RESUME、PAUSE、STOP、COMPLETE、DESTROY，以及实例 MUTE/VOLUME、manager GLOBAL_MUTE/GLOBAL_VOLUME 与 context statechange。必须在可触发播放前建立跟踪；不能仅在 `cosmosDebug` getter 中加一，也不能仅在下一帧采样，以免漏掉短音效。
3. 每次实际 `sound.play(...)` / `sound.resume()` 是一个同步启动事务：在调用真实方法前进入实例事务，期间 applyConfig 的 MUTE/VOLUME 等中间事件只更新事实、不计数；在真实方法成功完成、buffer source 已启动的终点，用最终实际输出状态结算至多一次。必须保留真实方法的 this、参数、返回值与异常；未成功启动不得凭 isPlaying=true 加一。Phaser 的 BaseSound 先设 isPlaying=true，WebAudioSound 再依次 mute→volume 配置、source.start、PLAY/RESUME，因此不得在内部 MUTE(false) 时读旧 volume=1 误计，也不得同时按配置事件和终点双计。可用生成代码中包围实际实例 play/resume 的窄包装落实；所有播放通路须被覆盖，getter仍只读 plain data。
4. 事务之外，正在播放实例由不可输出变为可输出记录一次；一个成功的重播/RESUME 终点按最终输出状态记录一次，循环周回不增加，重复读取不增加。停止/静音/暂停/失去 context 后更新实例当前输出状态。事务到真实 play/resume 返回即结束，不能把外层后续 `sound.play(); manager.mute=true` 合并成“从未输出”。直接操作未纳入观测的原生节点、额外音频通路、延迟/自动化 gain 必须提供同等真实来源，否则独审报告证据不足，不能填常量凑数。
5. getter 只把这些事实转为冻结 plain data。原累计字段和计数跨 scene 保留；新浏览器文档重新从实际初始状态开始，不把观测计数写入游戏存档。
6. 内部 `play()` 在全局静音或音量 0 下成功是允许的：`started` 可以为 true、`playing` 可以为 true，但 `outputActive=false` 且该次不增加 `outputActivations`。包括实例初始 volume=1、首次 `play({volume:0})`：配置中间态不算输出激活。不得要求“静音时绝不调用 play”。
7. 这些字段证明软件输出链状态与事件，不是操作系统扬声器录音，也不是每个采样点的波形证明。源码独审必须核对事件来源、覆盖的实例、连线和执行顺序。瞬态同一 JS 回合的播放再静音不能仅凭一次事件计数宣布已被人耳听到；存在无法解释的输出顺序时报告证据不足。最终听感仍由用户试玩确认。

### 稳定 ID 视图

设计早于 art，不能猜测未来 manifest 顺序。现有 art validator 比较 ID 集合且允许重排；不为观测新增 art 顺序约束。只在既有 getter 中提供同源映射 `media.audioById`，原 `media.audio` 数组按实际 manifest 顺序保持。

键规则唯一固定为 `clip_` + `id.replaceAll('-', '_')`。现有媒体 ID 只允许 `[a-z][a-z0-9-]{0,47}`，本身无下划线，转换无碰撞；前缀使 `constructor`、`prototype` 等 ID 不会成为 debug 禁止的路径段。例：`bgm-soft` → `clip_bgm_soft`。原 ID 仍留在记录的 `id` 字段，设计在每个文档首次读取该键前断言 ID。每次 getter 先由实际实例构造一次冻结记录，再将同一记录放入数组和 ID 视图；不得独立维护第二套状态、以设计下标去取实际对象或改写原 manifest。增加这个映射是因为原 debug path 只接受固定键、无按 ID 查找表达式，且原 schema 禁止连字符键；不扩大路径语法。

## 设计与独审如何使用

- 计划语法明确允许 `{kind:"debug",path:["media","audioById","clip_bgm_soft","outputActive"]}` 等补充断言；`expected` 仍是标量，`assert/wait-for` 与 1..200 步上限保持。
- 每个 AC 的可见断言保持。媒体 debug 仅补充真实媒体事实，不开放任意游戏隐藏状态作为玩法正确性依据。声音按钮显示“关”本身不证明实际静音。
- 首次输入前可读取就绪和媒体状态，但不能先点击 Restart、Continue 或其他控件再称下一次为“首次点击”。有重开时两阶段各有自己的首次输入；不得增加额外浏览器重开。
- 开启后的首次有效输入：先保留可见结果，再观察相关实际 ID、decoded、BGM 的 playing/looping/outputActive，以及短音效的 outputActivations。设计依据自身明确的触发语义给出有限绝对计数；不要求用户指定引擎细节。
- 首次点击关闭声音及关闭期间的实际收集/开门：观察所有相关 clip 的 outputActive=false，并用关闭前后累计记录核对期间未出现额外输出激活。内部播放策略可不同。不能先播放后补写“静音”文字。重新开启后，使用尚未收集的实际物品触发新音效；计数须体现新增事件。
- 循环检查使用当前 playing/looping/outputActive；不以等待若干秒推断循环，也不新增最短播放时长。短音效无需在读数时仍处于 playing，累计事件用于保留证据。
- 设计独审对照完整确认问答和 AC/EX，检查每条输入的前置状态、顺序、预期和来源；不能因 validate-game-design passed 自动批准。编码独审检查实际媒体对象到 getter 的来源，拒绝硬编码计数/布尔量、遗漏实例或仅修改 DOM。相同 task.context.rules 已进入两类 reviewer packet，不再新增 reviewer 通道。
- 本轮真实语义遗漏作为评审代表：部分存档后必须有未保存变化再重开；重开首次输入必须遵循原声音开关要求；不能增加重开前当前为 0/3；胜利后的 save/sound 等原控件要求不能遗漏。修正须由运行时 design 作者在既有反馈/修复链内完成，host 不代写游戏或修改验收。

## 文件边界与兼容

生产仅 `src/runtime/entrypoint-host.ts` 的普通 design/coding 规则，以及 `src/runtime/entrypoint.ts` 的固定版本选择/恢复接线；优先原地最小补丁。与 COS132 的预算/compaction/final-handoff 接线按行段协调，不改 `roles/factory.ts` 或预算文件。本卡不需要修改 art 规则、`acceptance/browser.ts`、runner、媒体 coverage、report reader、`entrypoint-acceptance-plan.ts` 或浏览器协议 schema。

新增约定只在新 ordinary task context 中产生。旧来源、旧计划、旧规则、已捕获报告与已批准媒体只按其原契约读取，不追溯要求新字段，不把旧 passed 改成新逐步证明。无音频普通任务无需附加媒体步骤。legacy/固定 validation 路径保持原规则。

### 固定运行规则版本

旧 ordinary+modular 恢复会重建 host policies，随后精确比较已持久化 `task.context.rules`；直接追加当前规则会破坏旧恢复。因此在现有 `execution.json` 增加独立可选字段 `ordinaryMediaObservationPolicy: "audio-state/1"`，并以 `HostInput` 同名可选字段传递可信选择。它与 COS132 的 `ordinaryDesignBudgetPolicy` 各自独立，任一字段不暗含另一字段。

- 新 ordinary 原始运行（普通三任务或五任务）由 `executeGeneration` 在创建 host/规划前选择新值，创建 execution 时写入同一值；不是模型输出或新 CLI 开关。非 ordinary 不选择；带值但 host capability 非 ordinary 或在不匹配模式中出现时拒绝。
- resume 在创建 host 前读取原 execution：缺字段精确选原规则，有已知值选新规则，未知值/错误类型拒绝且不派发；不按平台当前默认值升级历史运行。已完成报告的只读复用仍按原证据，不重新生成任务。
- host 保留原普通规则文本/顺序的 legacy 分支；只在新值分支替换本卡受影响规则并追加补充规则。旧 modular 的精确比较保留，不忽略或重写 task.context.rules，不以“当前规则差不多”放行。
- 同一原运行的 bounded repair 继承其原 task rules。显式 continuation 创建 host 前从同一原 execution 读取媒体选择，不重新默认为新值；不增加 repair/continuation schema 字段或更改 frozen bytes。原有 execution/plan/任务身份核对仍执行。
- 针对本卡版本独立测试缺省/新值/未知值，以及与 COS132 预算字段各自存在/缺省的组合，不需展开成整套恢复矩阵。

## 验收与边界

1. 结构正例接受“可见断言 + 合法媒体 debug”；debug-only、非法路径/非标量仍拒绝。新普通设计、coding 和独审 packet 使用一致字段及 ID 键规则；legacy prompt 不被扩展，art 无顺序约束。
2. 受控 TypeScript/Phaser fixture 用原锁定 tsc/Vite 编译；真实 Edge 通过原 acceptance/persistent lifecycle 执行两段普通输入，仅重开一次，留 raw steps、每个字段实际值及进程退出证据，无模型网络调用。
3. 正例覆盖：首次点击关闭、静音播放调用允许、初始volume=1的实例首播play({volume:0})仍计0、正常首播恰好计1、重播及pause→resume各至多新增1、重新开启后短音效、BGM 当前循环、重复读取计数稳定、scene 切换累计不丢、文档重开计数重置。art 数组重排、含连字符/保留词的合法 ID 均能按固定键读取正确对象。不得靠延长音效把短音效变为长播放断言。
4. 最小负例：UI 声称关闭但实际输出开启；重新开启后漏掉音效触发；BGM 实际未循环；ID 视图错误绑定到另一实际记录。真实 getter 保持从引擎派生，不能把测试故障写成“故意返回错误 expected”。原 host 必须失败于相应实际步骤。
5. 对常量伪造的 getter，debug runner 本身无法识别其真伪。另用现有独审拒绝链代表，核对实际源码/原需求在独审输入，拒绝反馈被保存，art/coding 下游不获批准；合成 reviewer 测试只证明链路，不声称模型一定识破所有伪造。
6. 本卡通过仅为源码/受控浏览器能力；不证明真实模型完成游戏，不更改已失败实际 run，人工体验仍 not_confirmed。
7. 一个真实生产恢复代表读取旧无媒体标记的 ordinary modular execution，按原字节 rules 通过原精确 host 校验；新标记的恢复重建新 rules，未知值在模型/浏览器派发前拒绝。不得用去掉精确校验的 fixture 假造兼容。

## 已做只读核对

2026-10-27，本机 Node22 stdin probe 调用真实 `validateOrdinaryAcceptancePlan`：合法媒体 debug 补充接受，移除可见断言后拒绝。对当前 host 规则检查结果 `promptDocumentsStepDebug=false`、`promptDocumentsOutputState=false`，命令 exit 1，建立提示缺口的 RED。未调用模型、未修改 run/ledger/游戏。

同日第二个 stdin probe 通过真实媒体 identifier 与 `validatePlan` 核对 `bgm-soft/constructor/prototype/a-b/ab` 的固定键，得到 `clip_bgm_soft/clip_constructor/clip_prototype/clip_a_b/clip_ab`，`issues=[]`、无碰撞、exit 0。这只验证现有路径能力，不是浏览器或真实性验证。
