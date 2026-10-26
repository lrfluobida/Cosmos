# COS133 Ordinary Media Observations Implementation Plan

状态：固定规格/计划已由独立 `media_observation_contract_reviewer` APPROVED_PLAN、无P1/P2，Root批准工程设计及免费源码实施；已最终独审并集成，仅source-scoped完成。

任务：[COS-133 / #134](https://github.com/lrfluobida/Cosmos/issues/134)，原生父COS18/#19、父[x]。实现者 `media_observation_contract_implementer`，独立源码reviewer `media_observation_contract_reviewer`，唯一merger `public_agent_batch_merger`。

- 批准规格输入 SHA256：`b13aa0d9808a79c8fe3991fb10f669f799808462f81d4a72e7fe9be03caab51d`
- 批准计划输入 SHA256：`1bc0f7ee579ac06b9037a22129756a3bb22bd50e5c89981e06139edb0a9495e1`

登记/实施基线：`844df4c7e09d7bbbad0b1a4d0cf2e3006801d9fd`；已发布runtime `ac1c745eb0be016f8a556edbadabad013fbf61bd`。下文设计诊断基线按批准原文保留。[配套技术规格](../specs/cos133-ordinary-media-observations.md)。COS132/COS133并行，不互设阻塞；最终组合的实际reviewer报价为下一次付费前置。本次仅免费源码实施，旧reuse-1永久failedclosed，不操作真实run/ledger/coordinator。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. 每个任务由独立 implementer 和 reviewer 完成；本批唯一 merger 集成。

**Goal:** 普通设计、coding 与独审使用同一逐步骤实际音频观测约定，复用已有只读 debug 执行器。

**Architecture:** 补齐普通任务规则，并在原 execution 固定独立媒体规则版本，保留旧任务的精确恢复。媒体状态继续由生成代码从真实音频对象导出，使用原 static plan/debug 标量读取和原 raw report；原末端媒体 coverage 保持。

**Tech Stack:** TypeScript、Node22、锁定 Phaser3.90.0/tsc/Vite、Playwright Edge，全部 SOURCE/TEMP、无模型调用。

2026-10-27 已批准澄清（[公开记录](https://github.com/lrfluobida/Cosmos/issues/134#issuecomment-6427444470)）：独立media_observation_contract_reviewer APPROVED_CLARIFICATION，Root批准以真实音频API已接受的即时控制态解释outputActive/outputActivations；滞后getter不覆盖已提交目标，不等同PCM/系统音量/人耳听感。仅已确认/声明的媒体和触发适用，collect/open是条件例。原来源、单次重开、schema/runner及未知通路拒绝保持。

本批三卡SOURCE组合已通过并统一发布；COS134 adaptive容量保持原repair额度，真实生成仍按原门禁核验。

源码结果：获批源码 `084543c10f1aab3e96b999b8f2b8a0fc0642c42e` 已独立APPROVED_SOURCE_SCOPED，无剩余finding；三卡统一合入main `06709f34e11512f62fc83d2b1ef4591f9c467f32`。[精确批准](https://github.com/lrfluobida/Cosmos/issues/134#issuecomment-6428869316)、[SOURCE完成关闭](https://github.com/lrfluobida/Cosmos/issues/134#issuecomment-6428875427)及父[x]已GET核证。 最终typecheck/build exit0，art留槽1/1及公开复用→设计v2→真实编译/Edge10步/clean delivery1/1分别通过、均0skip；独立APPROVED_INTEGRATION_SCOPED。完整native及171步/四故障有效证据复用；真实模型与人工体验仍未验证，paidAuthorized=false，父COS18仍open/partial。

## 0. 边界与依赖

- 先读相邻 `spec.md`、AGENTS.md、CONTEXT.md、ADR0004。基线 `7b5d837`；此设计不处理 COS132 的请求预算、压缩和最终 handoff。
- 生产修改：`src/runtime/entrypoint-host.ts`，原 ordinary 规则段约 1377–1385，加普通 coding 的补充规则；`src/runtime/entrypoint.ts` 的 HostInput、创建 host 前的原execution读取/选择、execution写入及 continuation传递。只加独立可选 `ordinaryMediaObservationPolicy:"audio-state/1"`；不改 art 规则、共有 legacy 媒体字符串及浏览器schema/runner。
- 单测新增：`tests/runtime/ordinary-media-observations.test.ts`。
- 浏览器测试新增：`tests/acceptance/ordinary-media-observations.integration.ts`、`tests/acceptance/fixtures/ordinary-media-observer.ts`，以及仅确有需要的同名 HTML fixture。
- 复用 `tests/runtime/ordinary-design.fixture.ts` 的 sessionFactory 覆盖接口、`tests/acceptance/media-observations.integration.ts` 的实际 Phaser/owned browser 模式和 `generic-persistent` 的两段机制。无需提取新通用框架或改 package scripts。
- 若新 fixture 要求额外文件，先解释其职责；不得把游戏业务源码写入生产模板，不改真实案例文件。所有写入先验 UTF-8，再最小补丁并复读中文。

## 1. 锁定 schema、提示与独审输入 RED

- [ ] 新测试构造小型普通 draft/plan，保留正常点击后的 visible/text 断言，再加入 `media.audioById.clip_bgm_soft.id/playing/looping/outputActive/outputActivations` debug 断言；真实 `validateOrdinaryAcceptancePlan` 应接受。移除所有可见断言、非法 path 和非 scalar expected 应仍拒绝。这些是已有兼容能力检查，不假称都是新修复 RED。
- [ ] 用 `ordinaryHostFixture` 获取实际 host policy 与 author/reviewer packet；断言普通设计描述 debug 语法与字段、coding 描述真实来源/事件/稳定ID映射、reviewer 含相同 task.context.rules，art 仍允许原集合重排。当前缺契约应 RED。
- [ ] 限定一个 legacy/validation policy 代表，原字段规则保持；无音频 ordinary 不能被新增硬性音频步骤要求拒绝。复用原 legacy fixture，不增加真实费用授权。
- [ ] 增加一个旧普通模块化 execution 恢复代表：先用未改基线的modular fixture生成免费TEMP原状态/规则作为oracle，保留无标记的原 task.context.rules 字节，经过实际 executeGeneration→createBrowserHost→validateTasks；未版本化直接追加新规则应 RED。不能用新规则生成后仅删除标记冒充历史状态。再覆盖已知新标记恢复，以及未知值在 sessionFactory 被调用前拒绝。测试只验证受影响恢复接线，复用已有 modular fixture，其余执行可受控。
- [ ] 运行 `node --experimental-strip-types --test tests/runtime/ordinary-media-observations.test.ts`，保存具体缺失规则断言；不运行全仓测试。

## 2. 固定版本并实现最小普通规则补丁

- [ ] 在 HostInput/execution 的现有类型加入独立可选 `ordinaryMediaObservationPolicy?: 'audio-state/1'`；在 entrypoint 中用小型局部选择函数校验 unknown 输入，只有 undefined 与字面量有效，不建注册表。新ordinary默认选择，非ordinary不选；选择与实际host capability不一致时规划前拒绝。
- [ ] resume 在创建host前读取原execution，复用同一解析对象及媒体选择进入后续原校验；缺字段用原分支，不新写历史文件。explicit continuation同样从原execution读取并传递，未知值不得生成新host派发；repair继续继承已固定task规则，不新增repair/continuation格式。
- [ ] 保留原ordinary规则文本/顺序的无标记分支；新标记分支才应用下面提示修改。不得移除或放宽host对旧modular task.context.rules的精确比较。COS132的预算标记由其作者维护；两个字段不能互为开关，分别覆盖四种存在/缺省组合的选择，不重跑完整矩阵。

- [ ] 修改 ordinary 设计计划语法，将 observation 由 `text|visible` 扩充为原已支持 `text|visible|debug`，限制用途为本卡媒体证据，保留每 AC 点击后可见断言和原 200 步、timeout 限制。
- [ ] 修改原“static visible equality / hidden state unsupported”说明：允许固定媒体只读 debug 作为补充，任意游戏隐藏状态、随机观察分支、严格时间区间仍不支持。
- [ ] 在新标记 ordinary code policy 追加精确 getter 契约：保留原数组，新增同源 ID 视图；记录含原字段 + playing/looping/outputActive/outputActivations；说明真实实例/manager/context 来源，以及API已接受的即时控制状态：后续修改前读实际节点初始化，成功setter事件更新已提交目标，滞后getter不覆盖。保留每文档累积、所有实例与事件、循环不重复计数、静音 play/volume0 可合规。必须说明play/resume启动事务内配置事件合并、实际成功终点结合context.running只结算一次，外部后续mute不合并；manager事件名为GLOBAL_MUTE/GLOBAL_VOLUME。仅标准即时通路可据此证明控制状态，不是PCM/操作系统音量/听感证明。不要自动生成或插入游戏实现。
- [ ] 设计和 coding 共同使用 `clip_` + `id.replaceAll('-', '_')` 固定键规则，覆盖连字符/保留词；每文档首次观察某键须断言对应 id。由同一实际对象记录组成数组/ID视图，不要求 art 顺序，不放宽 debug path。
- [ ] 设计/编码同一 rules 文本包含对应独审职责：首次输入顺序、实际状态与短音效证据、反对文案/常量替代、完整原要求，源码结构 passed 不代替语义批准。
- [ ] 与 COS132 作者协调 host 不同段，以及 entrypoint 的同一execution对象上两个独立字段；不改其 factory 配置、budget/compaction/maxRequests/final-handoff。merger按已审 SHA 组合，字段各自恢复/拒绝规则保持。
- [ ] 复跑第 1 节受影响单测 GREEN，执行 `npm run typecheck`。规则不需要新 schema 版本或历史报告迁移。

## 3. 真实媒体 fixture 与有限正负代表

- [ ] fixture TypeScript 使用原 Phaser SoundManager 的实际加载与 WAV（复用 synthesizeWav），按钮只有播放、开关、简单收集/存档/恢复；调试 getter 按 spec 从实际对象及API成功提交状态取值，不把业务标记作为证据。含一个 loop BGM 与一个短 SFX；在后续修改前读实际节点初始化，Phaser成功setter事件更新即时控制目标，不让滞后getter覆盖。包围真实实例play/resume同步调用，将内部applyConfig中间事件合并到实际成功终点；manager采用GLOBAL_MUTE/GLOBAL_VOLUME，事务外状态转移仍正常记录。包装保留this/参数/返回值/异常，不改变引擎行为。
- [ ] 复制锁定 template 到独立 TEMP，写 fixture src/main.ts/index.html，使用已有本机 node_modules 和锁定 `tsc --noEmit && vite build`；不得 npm install 或网络下载。测试报告记录实际编译退出值和构建路径。不要用 transpile-only 冒充编译。
- [ ] 用 `src/runtime/entrypoint-persistent.ts` 的 `createGenericPersistentSeries` 和 `src/acceptance/persistent.ts` 原 owned lifecycle 跑正例，两段共享 origin/profile，中间仅一次真实浏览器进程退出重开；第一段含正常音频、静音、重新开启和存档，第二段的首次点击为关闭声音，再真实恢复。使用既有 checkpoint 可见断言，不重造存档harness。
- [ ] 正例的静音阶段实际调用 play，同时分别覆盖 manager.mute 与 volume=0，证明未把“无内部 play”变成要求。计数从实际成功事件更新；短音效结束后仍可读到记录。无需等待一个循环周期或添加精确时长判断。
- [ ] 在同一真实浏览器正例补三项有区分力的断言：实例初始volume1→首次play({volume:0})累计0；正常首play累计恰好1；重播与pause→resume分别只新增1。保留普通play后外层立即mute的独立事件记录，不能合并掩盖其已启用过输出。旧按每次MUTE/PLAY各计的fixture应在这些计数断言RED，修正事务后GREEN；不另开整套浏览器矩阵。
- [ ] 保留已出现的false-volume0真实Edge trace：API提交0后立即getter仍1，约18ms后0且短SFX已结束。按Root已批准澄清修同一正例的提交值来源后，再执行原四个负例；不增加固定等待、不以延长音效或读取UI值绕过，不新增schema/录音/框架。
- [ ] 正例核对当前 BGM playing/looping/outputActive，正常启动与再次触发计数，重复 debug 读取不改变数值，scene 变更累计保持，新文档从0开始。fixture 将 art 顺序相对 design 重排，仍按稳定ID读取正确对象。所有通过都有真实 raw step actual/expected、编译与清理事实；providerCalls=0。
- [ ] 从同一 fixture 只加四个有限故障选项，保持记录真实：忽略静音而 UI 显示关；忽略开启后的收集音效；实际 sound.loop=false；ID视图错误绑定另一实际记录。复用已有 plan，每个负例须在实际字段/ID断言失败。不要用 stub browser 或字段常量构造“失败”。
- [ ] 浏览器基线 RED：旧只有 decoded/started 的 fixture不能满足新计划指定字段；补齐真实 observer 后正常版本 GREEN。故障版本的 RED 是能力负证据，不是生产代码又修了一遍。
- [ ] 命令 `node --experimental-strip-types --test --test-concurrency=1 tests/acceptance/ordinary-media-observations.integration.ts`。若现有浏览器环境缺组件，复用 COS130 已验证的本机路径/受控 ffmpeg 文件，不扩大生产环境白名单、不恢复凭据；保留首次失败，不用重复跑掩盖。

## 4. 语义遗漏的独审拒绝与反馈代表

- [ ] 只用一个合成来源/实际 host 链路代表：正常结构完整但把“重开第一次点击关闭声音”前面插入 Continue，或用声音文案替代实际字段；在确认问答/AC中保留该要求，测试不能修改已确认真实 room。
- [ ] 使用 ordinaryHostFixture 的 sessionFactory wrapper：独审从原固定需求和捕获计划读取实际差异，返回具体 `changes_requested`；核对独审只读工具、不同 context、落盘 findings 与既有 failure feedback、拒绝时 art/coding 尚未派发。允许修改 fixture 增加一个可选最小 draft/scenario 参数，默认值保持；不重写既有fixture。
- [ ] 来源造假另核对同一个拒绝机制：getter 若写常量而非真实对象，独审输入包含该源码/媒体/真实 report；不声称 debug runner 会识别完全一致的谎报。可复用已有拒绝链证据，只新增本卡 packet 内容断言。
- [ ] 原错误包括存档后缺未保存变化、重开前额外0/3、胜利控件遗漏，列入 reviewer规则的通用检查职责；不为本轮游戏添加固定选择器硬编码或一套需求语义解析器。
- [ ] 此测试只证明独审信息与拒绝反馈链存在，不证明真实模型 reviewer 的召回率。不调用模型重新跑整矩阵，不更改真实失败结果。

## 5. 审查、合并与证据

- [ ] 执行 `npm run typecheck`、`npm run build` 和第1/3/4节有限受影响测试；原 coverage/旧report 仅跑一个字段不变代表，其余有效证据复用。
- [ ] 重读所有编辑文件确认 UTF-8/中文，无真实run/ledger变化。提交专职分支，报告 exact SHA、文件清单、RED/GREEN命令/退出值、fixture roots、未证明边界。
- [ ] 独立 reviewer 先审 spec 一致性，再审实际 diff/fixture 真实来源、静音合规、首次输入顺序与 legacy范围；不得把作者总结代替源码审查。
- [ ] 唯一merger验证批准 SHA、合并 COS132/COS133 的host片段与独立execution字段，最小 typecheck/build、旧modular恢复代表和一个实际新字段正例；复用已有效的负例/旧验证。登记 source-scoped 完成，不标记真实生成或用户体验通过。

## 不触碰

不读写真实密钥；不改真实 run、ledger、确认问答或旧生成游戏；不改末端媒体统计和旧报告格式；不加 PCM录音/任意脚本/浏览器框架；不把 DOM文案、fixture成功或原source通过说成真实游戏生成成功。
