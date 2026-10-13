# COS79 有界编码上下文压缩实施计划

> 使用 writing-plans、TDD 和 verification-before-completion。`cos77_implementer` acting COS79 implementer；`cos76_implementer` 在完成 COS78 后独立 review COS79；`batch75_76_merger` 为唯一 merger。COS78 仍由 `cos77_implementer` 独立审查，其最终 diff 审查优先。本计划先审，生产实现另等设计实验后的独审批准。

**目标：** validation coding 作者及同角色 repair 作者，在成功工具回合之后、下一次普通请求准入之前，能够在原费用、请求次数和时限内使用原生 Pi 压缩，并继续同一 attempt。

**基线：** 初始计划 `e0248f70d96257a7fcac15cb6c8d8e7ad3db2a69` 已获初阶段 PLAN_APPROVED；实验设计及no-op修正 `b4918b89a525c0ffb97eb0b2b2c01e948b8cde96` 已获独立 PRODUCTION_PLAN_APPROVED。实验与生产基于 COS78 已审集成953f0eb；随后合入docs-only adfcd64及 `2f4177deb6f2a1aa47c6e293ab6e64bf87006b91`，最终review以2f4177d为base。managed `cos74-frozen-template/Cosmos`，分支 `codex/cos79-coding-compaction`。COS79 [#80](https://github.com/lrfluobida/Cosmos/issues/80)，id5835178325，父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)。实现待最终exact独审，未启动实际C9。

## 已核实调用链与窄设计

SDK 0.99.2 的成功工具回合在 `agent.prepareNextTurnWithContext` 进入现有 `_compactBeforeNextAssistantResponse`；native threshold compaction 经 `_runDefaultCompaction → compact → completeSummarization → agent.streamFunction → ModelRuntime.streamSimple`，仍经过当前 Pi budget/window guard。原生 `compact()` 会先 abort 当前 run，不能从 busy 工具回合调用。

只为目标角色提供可信可选配置。adapter 保存 `SettingsManager.inMemory`，包装公开的 `session.agent.prepareNextTurnWithContext` 并调用原 hook。已完成、未失败/取消的工具回合且确有下一普通请求时，可信 host 策略评估上下文字节和当前 authority；触发时临时 `applyOverrides` 设 enabled=true、reserveTokens=model.contextWindow、keepRecentTokens 保持，await 原 hook 后 finally 恢复 disabled。正常 post-run/overflow 自动恢复保持关闭，不直接调用 private SDK 方法，不增加第二套摘要器或消息重试。

临时 reserveTokens 也会抬高 SDK 摘要请求值，所以独立摘要上限必须先接通：目标角色原生摘要的有效上限不超过 `min(8192, 原配置cap, SDK本次有效maxTokens)`；SDK maxTokens 无效时拒绝。仍使用 COS77 收缩策略、实际 inputBytes/hasImages 和原报价，不降低字节保守估算。原生 split-turn 可能串行两次摘要，逐笔使用原 author grant、ledger、request count、deadline，均不得绕过费用守卫。

订阅 native compaction_end，失败/取消锁定 session failure，原 hook 返回前检查，防止 SDK 内部 catch 吞错后发送普通请求。摘要 length/unknown/非法工具调用不能成为已保存 summary；第一笔已收费而第二笔拒绝时保留第一笔真实费用，不退款、不写残缺摘要、不继续。固定系统包与工具 loadout 由原 hook 恢复；task、attempt、author/context 身份、文件权限、handoff 与 capture 验证不变。

## 第一阶段：免费设计实验，生产文件不改

- [x] 初始PLAN_APPROVED后，在SOURCE/TEMP使用真实Pi/session/controller与fake provider实验；fetch禁网。仅新建合成会话，不读取真实/旧session、thinking、ledger、key。
- [x] 从公开AgentSession.prompt测试注入点安装公开hook，通过已有可信requestOutputLimit限制cap；摘要必须经native请求的fake provider返回和usage/保存路径，不注入compaction entry或extension summary。
- [x] 合成read/toolResult和142685字符thinking序列，在251339 bytes/1069753µ、普通65536仍可预留1026966µ时提前触发；没有先制造预算失败再重试。
- [x] 测定输入字节、余额压力、增长间隔和无收益处理；实际1/2笔摘要、quote/settlement、后续输入及同attempt继续见下节。
- [x] 摘要不足、第二笔失败、unknown、deadline/stop、race、length、工具调用、相同投影与无收益、固定包/工具/中文文件/真实registry捕获边界通过。
- [x] 保存原始TAP和每mode JSON，提出下述固定设计。
- [x] 独立reviewer批准实验后设计及no-op增量，随后进入生产TDD。

## 实验后固定设计（已独审）

1. Pi新增可选可信 `requestCompaction` 异步判定能力，元数据只需普通cfgcap、投影inputBytes/hasImages；factory仅为当前validation coding author/同role repair接线，每次核对原case/window/deadline/max-cap和最新admissionAllowed。没有配置则不安装hook；模型、CLI不能选择阈值。
2. hook只处理成功toolUse后的完整批次（至少一项toolResult且全部非isError）、非readonly格式回合、无失败/取消。用公开 `session.sessionManager.buildSessionProjection().messages → convertToLlm → normalizeContext`，按UTF-8 JSON字节计算投影，图片沿Pi原规则检测。实验的实际普通stream元数据与投影吻合；此值仅供触发，实际发送仍独立重算context与费用。
3. 同时满足两项才触发：inputBytes至少131072；按原普通cfgcap及hasImages调用 `validationReservation` 的预留额大于最新remainingMicroCny的一半。每个成功边界最多一次native compaction操作；内部双摘要分别准入。大输入但余额充裕时不压缩，不等普通预算失败后补救。
4. 本session内保存上次尝试的投影序列化值，相同则跳过。只有本次native成功事件或新增compaction entry才能判为成功；成功后至少再增长32768 bytes才允许再次触发，且保守需求未下降时本session停止后续自动压缩（本实验无图时等价afterBytes>=beforeBytes）。`prepareCompaction` 无内容时会在start事件前直接返回；无entry且无失败是no-op，只保留本次投影去重并恢复settings，不更新成功增长基线、不置noBenefit、不新prompt/continue或同边界重试。普通请求照常走原guard。状态仅在内存，不改写旧session或新增扫描/哈希框架。
5. 保存原compaction设置，临时enabled=true、reserveTokens=model.contextWindow，await原公开hook后finally逐项恢复，默认disabled。只走native threshold(false)，post-run/overflow保持关闭；不调用private SDK方法、manual compact、新prompt或continue重试。
6. 目标配置下的native摘要有效cap为 `min(8192, cfg.maxOutputTokens, SDK options.maxTokens)`；SDK值须positive safe integer，再交COS77收缩。临时reserve使本机SDK实际请求384000，实验发送8192；SDK较小值4096实际发送4096，不能只依赖SDK默认摘要cap。普通请求原cap保持，不增ledger字段或role/purpose。
7. 复用native `generateSummaryWithUsage` / `generateTurnPrefixSummary` 保存前toolCall拒绝。初审的 `getSummarizationFailure` 仅检查error/length是局部函数事实，完整链随后还检查toolCall；非法write摘要已实测0entry/0工具执行，不需新schema框架。compaction_end失败/取消仍调用Pi原failure latch，原hook返回后检查；保留更早的incomplete/usage_unknown/cancelled原因，防原生catch吞错继续。
8. 摘要完整成功后只由SDK追加记录；原hook恢复固定包和工具loadout。task/attempt/author/context、固定输入、写权限及handoff/capture保持。第一笔已结算而第二笔被拒时不退费、不保存局部summary；原requestWindow、reserve原子核验、request count和maxRetries0保持。

## 免费证据

完整脚本及每mode JSON：`C:/Users/26557/AppData/Local/Temp/cos79-compaction-design/experiment.mjs` 及同目录。使用真实Pi/factory/controller/native compaction与fake provider，全部network0；金额均为合成usage/账本，不是供应商收费。初阶没有改生产文件。

- `design-matrix-green.tap`：16/16、0skip、10663.064ms，涵盖单/双摘要、toolCall/length/unknown/首笔不足/第二笔不足/race/deadline/cancel/非法SDKcap、关闭策略、宽裕余额、较小SDKcap、无收益与相同投影重入。命令为 `node --experimental-strip-types --test C:/Users/26557/AppData/Local/Temp/cos79-compaction-design/experiment.mjs`（当时16条）。
- `summary-cost-boundaries.tap`：仅新增的峰值结算/过大摘要输入2/2、0skip、3811.0374ms，同脚本加 `--test-name-pattern='summary peak|oversized native'`。当前脚本共18条，新增两个mode不改变前16行为，旧证据复用。
- 独审no-op finding增量：初实验在原hook返回后无条件更新成功基线；新增真实native no-op代表有效RED（`native-noop-red.tap`，169080不等于0，3096.2048ms）。只在新增entry后更新成功基线的修正后1/1、0skip（`native-noop-green.tap`，3302.1986ms）。该新mode把固定system包增至160000字符、会话历史仍小于keepRecent，触发条件为真但SDK无start/end、0summary/0entry；同投影再次进入时trigger=false、0新增请求，成功基线0/noBenefit=false/settings disabled。两个普通请求仍真实准入（下一输入169080 bytes、cap65536、quote862448），network0。仅跑 `--test-name-pattern='native no-op'`，此前18项复用；当前脚本19条，`noop.json`保存原数据。
- 保留 `native-initial.tap` 1/1与`matrix-initial.tap` 14/14。`initial.tap`是ESM-only包被require.resolve错误解析的环境失败，不算RED。新增registry断言的`design-matrix.tap`为11/16：初fixture误用尚未生成的design/art依赖，capture正确拒绝；随后另构独立coding契约，注册前固定inputs仅为真实已有requirements capture。未改生产/C9依赖或捕获验证；此fixture输入合同变化后完整16项重跑通过。
- 每mode JSON包括实际input/cap/quote/usage/ledger、native事件和边界；split带`-split`。关键文件为 `success.json`、`success-split.json`、`summary-peak.json`、`summary-too-large.json`、`budget-second-split.json`、`unknown.json`、`no-benefit.json`、`disabled.json`。不含真实会话或真实thinking。

| 合成场景 | 观察与结论 |
| --- | --- |
| 提前触发 | 251339 bytes/1069753µ时，普通reserve1026966仍可承担；summary输入5583/4175 bytes、cap8192、quote76702/73886，把普通输入分别降至134861/151929。5普通+2摘要，同attempt写入中文文件并由真实registry捕获；摘要各合成结算10µ时末cap55223。 |
| 摘要全部预留结算 | 两笔分别结算76702/73886µ，仍继续并capture；末普通cap36402、剩595064µ。 |
| split与第二笔失败 | 首操作按10261/5583 bytes串行两摘要（quote86058/76702），完成后才保存1entry；第二笔失败变体只发送/结算第一笔10µ，0entry/0后续普通，剩100µ不变。 |
| 非法工具/unknown | native保存前拒绝write，已结算10µ保留；unknown保留76702µ预留。均0entry、无工具write/后续普通请求。 |
| 无收益/重复 | 251339→251550，下一回合252283不再摘要；相同新投影重复调用公开hook为0新增请求。 |
| 摘要自身不可承担 | native摘要503390 bytes，仅输入1006780µ已超过剩1000000µ，0摘要发送/0entry。不能假定压缩必定省钱。 |
| 关闭策略/充裕余额 | 关闭后第4普通响应留下394808-byte下一输入、剩745662µ，拒第5请求；充裕组5普通/0摘要并capture通过。 |

394808 bytes来自合成小write，不冒充Root真实C8的405672；匹配的提前触发边界为251339/1069753。所有普通请求完整固定包字符串、active tool names、task/attempt与中文文件字节均断言保持。registry只验证独立fixture文件与固定来源，不证明C9游戏、build/browser、独立验收或human。原始数据保留首次实验与fixture修正，不把诊断当实际生成效果。

## 第二阶段：经实验设计批准后才实施

- [x] Pi接入可信判定、公开hook、摘要cap和失败锁；native成功事件才更新成功基线，no-op保持去重且恢复settings。前后需求用同一既有estimate函数报价，仅比较投影、不reserve或增加请求次数。
- [x] factory仅接validation coding author/同role repair，非目标角色和无配置路径保持；预算仍由既有provider-budget/controller处理。
- [x] 新原生生产测试先RED后GREEN，保留真实SDK/工具/controller/capture，移除实验中的策略实现；source、compiled及受影响回归证据见下。
- [x] C9新增COS79准确marker，沿用reviewed/merge双祖先；未增加case10。旧C9 fixture仅补合成marker；新增门禁测试与原runtime测试放同文件，串行使用同一保存seed，单独选新增测试运行。
- [x] typecheck/build、affected strict、UTF-8/LF/中文回读、diff check；准备提交exact SHA。
- [ ] reviewer最终规格→质量审exact实现，sole merger集成并更新共享tracking。

## 生产实现验证

以下raw TAP均在 `C:/Users/26557/AppData/Local/Temp/`，不含真实会话或keys。测试只有fake provider/合成ledger，真实C9未消费。

- `cos79-production-red.tap`：生产首条有效RED，旧入口在后续普通请求报admission_rejected；`cos79-production-first-green.tap`修后1/1。早先Python版本不支持write_text(newline=)导致fixture未生成，仅环境错误，单独留`cos79-fixture-write-error.tap`，不算RED。
- `cos79-production-source.tap`：原生生产18/18、0skip、13308.401ms。真正生产hook负责触发/上限/失败锁，fixture只观察；较实验加强noBenefit：超过32KiB增长后仍不再次摘要。随后新增readonly及相关no-op/noBenefit代表3/3（4789.2277ms，tool原输出），新角色/正式/真实claimed repair策略接线3/3（4365.5ms，tool原输出）。
- 自审补充：policy await期间直接close，SDK吞裸AbortError可能让pending prompt看似成功；`cos79-close-red.tap`有效RED。最小requireActive检查经Pi原fail锁记录cancelled且保持已有首因，close/cancel/length/no-op4/4、4495.8353ms，`cos79-close-green.tap`。当前生产测试20个场景有通过证据，未重复整矩阵。
- `cos79-production-compiled.tap`：dist Pi/factory下核心、readonly、toolCall、第二笔预算、无收益、no-op、峰值结算7/7，7887.5564ms。close修正后重build，仅affected close/cancel compiled2/2，3663.054ms，`cos79-close-compiled.tap`。
- `cos79-affected-regression.tap`：Pi原生、COS77实际cap、request-window、manual compaction、factory scope共61条，60/61；唯一旧400ms墙钟断言在并行build时614.5249ms失败。原源码/断言未改，单独复跑该项1/1（254.7914ms），`cos79-window-focused.tap`；其余60复用。新增factory阈值131071/131072与恰好半额/过半、unknown拒绝，以及非目标scope断言均通过。
- C9新marker有效RED为未批准标记未被拒（`cos79-c9-marker-red.tap`）；缺模板依赖的前次环境错误另存`cos79-c9-marker-env-error.tap`。复用本机已有template node_modules junction，无安装/源码依赖变化。GREEN1/1、12821.0695ms，`cos79-c9-marker-green.tap`：未批准、reviewed非祖先、merge非祖先均拒，合法标记free preflight paidRequests0；每次snapshot bytes/mtime/filelist不变，finally恢复保存的SOURCE snapshot。只复用COS78归档history-1，没有新增费用、claim或重建旧历史。
- 新门禁逻辑后来仅移至 `validation-case-nine-compaction.fixture.ts`，由原 `validation-case-nine-runtime.test.ts` 注册，以避免两个独立test文件并发改同seed。测试体不变，已过准入证据复用；当前定向命令 `node --experimental-strip-types --test --test-name-pattern='C9 requires reviewed compaction' tests/transfer/validation-case-nine-runtime.test.ts`。不执行旧4分钟runtime主体。
- `cos79-c9-compiled.tap`：现有compiled C9代表1/1、11028.579ms（TAP15075.3526ms），验证新JS闭包、JS worker路径选择与修改compiled代码拒绝；worker transport合成，无实际build/browser。
- `npm run typecheck`、`npm run build`及affected strict（`tests/roles/validation-output-limit.test.ts`、`tests/transfer/validation-case-nine-runtime.test.ts`，NodeNext/ES2022/allowJs/checkJs false/noEmit）退出0。仅三份生产文件；旧中文、LF/UTF-8及CNY账本实现保持。

## 修改范围与状态

生产改动仅 `src/providers/pi.ts`、`src/roles/factory.ts`、`probes/transfer/validation-case-nine-entry.ts`；其余为必要provider/role/marker测试和自有文档。不改SDK依赖、ledger schema、自动重试、author capture或其他框架。独立reviewer已只读预审稳定生产diff无finding，最终exact与全部测试证据仍须正式审查。

Root反事实背景：用同一C8元数据和历史费用从1233190µ开始，前14请求cap仍65536，之后只剩745662µ；下一405672-byte普通请求的输入预留811344µ、加4096输出844112µ均不可承担。这不预测随机C9，也不证明native摘要一定不可承担或必能省钱。C8保持停止；C9未消费，paid暂不开始。当前 SOURCE_NOT_READY / PRODUCTION_PLAN_APPROVED / IMPLEMENTATION_REVIEW_PENDING，仅源码与免费fixture范围。
