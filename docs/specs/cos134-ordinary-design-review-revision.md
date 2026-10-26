# COS134：普通设计独审后的有界修订

状态：独立 `ordinary_design_revision_reviewer` APPROVED_PLAN，两项P1/P2已闭合、无remaining；Root批准最终工程设计与免费源码实施。源码pending，尚未独审或集成，本文件不授权付费运行。

任务：[COS134 / #135](https://github.com/lrfluobida/Cosmos/issues/135)，原生父COS18/#19、未勾；原生依赖[COS132 / #133](https://github.com/lrfluobida/Cosmos/issues/133)及[COS133 / #134](https://github.com/lrfluobida/Cosmos/issues/134)，无反向依赖。实现者 `ordinary_design_revision_implementer`、独立源码reviewer `ordinary_design_revision_reviewer`、唯一merger `public_agent_batch_merger`。

- 批准规格输入 SHA256：`8fb15b4c083734640ef6b9e6f2c83be1fd05b78379d616d19d9045626d2629ea`
- 批准计划输入 SHA256：`c9ba2def9250403c2bfd64c4e66acd83facd4a1943bbe30e4e8e96a6e10e5f67`

实际实施基线：隔离组合 `5a17b5671da33282ad9a1a117621fea7189107bc`，分支 `codex/budget-media-revision-integration`；main仅metadata，三卡源码等最终审批与必要组合通过后一次发布。[配套计划](../plans/2026-10-27-ordinary-design-review-revision.md)。

状态：Root已选择下述预算方案②方向；固定工程规格与计划已独立APPROVED_PLAN并获Root批准免费实施。此文档不授权实际付费，不提升旧运行结果。COS132/133/134作为同批组合门禁，必要adaptive能力及组合检查通过前不向main发布已知不可派发codingrepair的新默认，也不启动新actual。

## 目标与边界

有效、固定来源完整的普通设计 `changes_requested` 最多交回一次新设计作者；新输出重新 capture、结构检查、独立评审，通过后美术和编码才消费新版本。重复拒绝、没有文件变化、来源不可信或资源不足均有界停止，保留原始差距。

本卡面向通用 Pi 2D 游戏 agent。完整原需求、确认、客观与体验条目不增删；不重访谈，不让 reviewer 提示成为用户授权，不手工修目标游戏。room12 v2 的完整 12 AC / 4 EX / 原 SHA 保持；所有旧 actual 永久 failed / closed / settled。原 ¥5 / 30min、共享 ¥150、phase ¥30、每个作者 session 32 请求均不增加。

源码调查基线 main `4578d83fd3766774be7fe3093b4123eebff5ca14`，发布 runtime `ac1c745eb0be016f8a556edbadabad013fbf61bd`。预算候选为 COS132 `e2df1148e1f49f213b893efbcffff9b0a5726b5f`；报价读取的媒体候选实际为 COS133 `084543c10f1aab3e96b999b8f2b8a0fc0642c42e`。实施从两卡最终批准组合开始，不把旧文档 source-pending 字样当作当前源码状态。

正式实施基线已固定为已审组合 `5a17b5671da33282ad9a1a117621fea7189107bc`（`E:/CodexData/.codex/worktrees/cos-01-reference/Cosmos`）；main `bf59366f` 只含metadata，runtime未发布。下述P1/P2受影响接口探针直接使用该组合。

## 已核实的 RED 与接口

免费 RED：`C:/Users/26557/AppData/Local/Temp/cos134-review-red-a69fa9b344cc4330a406f93b3f72c736/probe.mjs`，同目录 `result.json`；运行目录 `C:/Users/26557/AppData/Local/Temp/cos112-G8HD0E`。命令 `node --experimental-strip-types <probe.mjs>` 退出 1，唯一目标断言为 design author sessions 应为 2、实际 1。

- 使用仓库 `ordinaryHostFixture` 和真实 ordinary host / capture / journal / entrypoint；provider 和 browser 为 synthetic，网络、模型费用为 0。
- 固定设计 host evidence 为 `passed`；设计状态 `needs_changes`，独审 `changes_requested`，原 finding 保存在 `journal/task-design-task/review.json` 与 handoff。
- `failure.json` 仍为 `independent_review / insufficient_evidence`；自动报告明确 `Bounded continuation blocked: insufficient_evidence`。
- art、coding 都为 `waiting_user`，0 attempt，0 author session。不能把这个拒绝链称为自动返工。

真实接口约束：

1. `orchestrator.ts` 在 capture 前关闭 author；review receipt 保存独立 reviewer/context、完整 `inputVersions`、evidenceIds、completedAt、内容 signature。`persistFeedback(undefined)` 不知道语义缺陷。
2. `repair/feedback.ts` 明文禁止把模型文字、工具结果包装成 `HostFailure`。`assessRepair` 对上述记录返回 `collect_evidence`；本卡保持该结果。
3. `planTaskDag` 只固定原始 native proposal，尚未注册任务；`executeTaskDag` 才创建 origins 并调用 `registerTasks`。因此可以先执行设计，保持下游尚未注册。
4. `validateTaskUpdate` 固定 inputs、outputs、budget、dependency IDs；`TaskJournal` 每任务每阶段 write-once。不能改注册任务的 v1 输入，也不能重开原 session 或覆盖原 receipt。
5. 当前 `allocateRepairGrants` 把未分配余额按全部替代任务加权分配，旧 allocations 不回收。COS132 的 450000µ 会分成 design125000 / art125000 / coding200000；唯一 `repair-plan.json` 还会挡住后续 coding repair。
6. registry 已接受固定 v1/v2 输出，`ordinary.approved` 已认证 capture、原确认、独立 review 和完整 signatures；复用这些检查，不建立新产物注册器。

## 方案选择

| 方案 | 依据与代价 | 决定 |
| --- | --- | --- |
| 把 findings 转成 code_defect，再原样用现 successor | 违反 HostFailure 来源边界；125000µ 不够；消耗唯一 coding repair，且下游原 grants 被闲置 | 拒绝 |
| 保持或恢复原 author session，在原任务里循环 | 当前 session 已 close；任务输出固定 v1；journal 每阶段 write-once；要改 task / capture / recovery 语义，并容易重置 32 次计数 | 拒绝 |
| 新 ordinary 固定两路执行：先设计，最多一次新设计修订，再首次固定下游版本 | 利用尚未 register 的原 plan 草稿，复用 journal、registerTasks、registry 和原 coding repair；需明确新预算分支 | **采用** |

这是 ordinary 三角色图中的固定分支；没有任意节点、用户定义转移、通用工作流或语义解析器。

## 固定版本与执行顺序

新入口持久化 `ordinaryDesignRevisionPolicy: "independent-review/1"` 到 HostInput / `execution.json`，同时要求 COS132 `ordinaryDesignBudgetPolicy:"review-reserve/1"`。COS133 的字段按它自己的版本继续绑定。未知值、错能力或恢复时变化拒绝；旧 undefined 原样走旧行为，不自动迁移。

只适用普通三任务、无 validation / preparation / human / inherited / modular 的原执行。模块和固定 transfer 图保持原路径。首次规划仍只要求现有三个角色；修订身份由 host 从已固定设计 task 派生，不让模型发放任务或预算。

1. 固定原 `execution.json` 和 native plan 后，仅向现 orchestrator 提交原 design。art/code 不创建 task、allocation、origin、工作副本或请求。
2. 首轮 approved：认证原独审，write-once 发布 `ordinary-design-selection.json`，选择 v1 及原 art/code 草稿，然后首次注册下游。
3. 首轮有效 changes_requested：认证下述完整来源；保留原 failure.json。发布只读 `ordinary-design-review-feedback/1`，再 write-once 发布 `ordinary-design-revision-plan.json`，固定 sourceTaskId/sourceAttemptId、一次修订 task ID、新作者/context、v2 capture、预算、原 deadline 和导出的下游草稿。此 plan 的存在即消耗唯一修订机会，换 task ID 无法重置。
4. 新 revision task 使用原 objective、acceptance、原完整 requirement sources、原 inputs；只将独立artifactId的feedback加入只读 `task.inputs`，旧 `design@v1` 保持原registry引用并放入 `task.context.interfaces`。新输出仍为 `design@v2`。因此host evidence.artifactVersions和review inputVersions的inputs+artifacts只有一个design ID；不改全局唯一性，不给旧capture创建alias或批准身份。它不调用 `createLinkedRepairTask`，不伪造 knownFailures，不调用 `assessRepair` 作为语义缺陷证明。`registerTasks` 只追加这个新 task/grant。
5. host 在固定 `continuations/<revisionTaskId>/workspace` 中从已认证旧 capture seed 原作者文件位置，沿用现 `materializeTaskInputs` 对该路径的限制。该函数同时复制inputs与context.interfaces并检查源/副本一致；原 capture 不改，原可变 author 目录不作为来源。原 write scope、工具与 schema 保持。复用 `createGameDesignCheck`、`TaskJournal` 和现文件工具，使用现 bound workspace 接口的 ordinary 窄分支。
6. 作者读取固定原需求、旧输出和反馈，实际 edit/write，调用现自检，返回合法 handoff。新 capture 永远是 v2。与旧 capture 的设计文件和计划逐字节相同则记录 `no_output_change` 并停止，不再次花费独审费用。修改字节不证明语义进展。
7. v2 重新走实际结构检查与新的独立 reviewer。该 reviewer 与两次作者均不同 actor/context；仍检查完整原需求，不能只核对 findings。任意再次拒绝即 `design_revision_limit`，不解释文字相似度、不再产生第三作者。结构通过绝不等同 approved。
8. v2 approved 后才发布 selection。它绑定原 execution/native plan、revision plan、当前 approved design task/capture/receipts、完整 derived art/code contracts。下游原 task IDs 可以保留，因为从未注册；只将原 design v1 和原 design dependency 精确替换成 v2 / revision task ID，并应用下述固定分支预算。其余 objective、acceptance、write scope、输出 v1、工具和需求来源不变。
9. `entrypoint-successors.ts` 的既有 coding repair 接受已认证 selection 作为 effective base DAG，核对它的原 execution 来源；不改原 execution 文件。仍使用唯一 `repair-plan.json`、DEFAULT_REPAIR_POLICY 的一次 repair / 两 logical attempts / 一次无进展限制。设计修订不能占用或重置这个 repair 槽。

首次设计若没有合法 handoff、结构失败、review 协议无效或缺来源，就保留原失败并停止该阶段；本新 policy 不把这类结果转成独审修订，也不消耗 coding repair。原 policy 的行为保持。

## 模型反馈的来源与权限

反馈的 authority 固定为 `independent_model_review`，内容是审查建议。可信 host 仅证明“这份建议确实来自该固定输出的独立审查”，不证明建议正确。

派发前必须复用 `TaskJournal` 和 registry 检查：

- 原普通 profile、完整 confirmed draft / confirmation / requirement capture 实际字节和原 requirement 一致。
- source task 与原 native proposal / execution 的 immutable 字段一致，只有一次已完成 author attempt；state=needs_changes、review=changes_requested，host evidence 全部仍满足结构验收。
- registry capture 的 task、attempt provenance、dependencies、版本与输出一致；通过 `recoverCapture` / registry 实际检查。
- 原 author、capture、verified、review-started、review receipts 完整；reviewer/context 独立，started 与 review、task.review 完全匹配，completedAt=attempt.endedAt；原协议纠正记录按 `requireCorrectionIdentity` 校验。
- verdict 的 inputVersions 精确等于原 inputs+artifacts，evidenceIds 非空、无重复且每项引用有效的当前host evidence；不要求模型枚举所有host事实。当前ordinary设计只有一份host evidence；完整verified evidence与verified/review signatures由可信host独立认证，并重新核对原inputs/capture/raw evidence字节。
- findings 为 1..32 个非空字符串，总 UTF-8 不超过 65536B；不静默截断。空、空白、缺 verdict、错绑定、tamper、同作者/context、未知字段等不派发修订，保留原拒绝和固定 blocked reason。

固定 feedback 使用独立身份（如 `ordinary-design-review-feedback-<sourceTaskId>`），保留来源身份、旧capture的原引用、原verdict全字段、完整原review signature、来源receipts的SHA256和所有原输入引用。新增身份只表示反馈文件，不是旧capture的alias。原review原文不改。

签名覆盖分工固定如下：新author signature**直接覆盖**task.inputs中的原inputs与feedback文件；新verified/review signature在此基础上再直接覆盖新design@v2及当前evidence。旧design@v1因位于context.interfaces，**不直接出现在这些新阶段签名中**。它通过已签名feedback内绑定的原review signature间接固定。可信host必须再次打开原TaskJournal/registry，验证feedback与原receipt一致，并用 `requireSignature` 对原inputs+旧capture+原evidence实际字节复验；仅核feedback自报hash不够。

在seed前、capture前后、新review派发前及完成后、selection/恢复时执行上述原来源复验。作者和reviewer的现scoped reader / inputFiles均支持context.interfaces，host.verify现有copyRefs也会复制这些interfaces到独审快照。对已materialize的作者只读副本及review副本，用现snapshot/regularFile逐文件比较已认证旧capture，拒绝额外/缺失/变化文件；不能只验证run根目录而让模型读取另一份变化的副本。新作者写域与这些只读路径不相交；旧registry仍保持原身份、字节与拒绝状态。

免费兼容探针：`C:/Users/26557/AppData/Local/Temp/cos134-review-fixes-648ff98ea71a479d8edd33efd505d793/{probe.mjs,result.json}`，在5a17b567上exit0、network0。真实ordinary capture/host evidence/review链中，原v1保持needs_changes，新v2在synthetic review下passed；作者和reviewer均用真实scoped read读取feedback与旧interface，作者实际edit；evidence IDs唯一，新signature直接包含feedback而不包含v1。源字节和mirror篡改负例均拒绝。完整host链使用既有root workspace，另以现materializeTaskInputs验证了上述isolated mirror；COS134新task/workspace绑定仍是待实施项，探针不冒充已实现完整修订policy。运行需设 `COSMOS_TEMPLATE_ROOT=E:/develop/Cosmos/templates/2d`，只复用已安装模板依赖，无网络。

自然语言 findings 不进行语义分类。若建议要求删 AC、改变确认、降低阈值、跳过正常输入、增加预算或外部权限，它没有这种授权：工具写域拒绝需求/确认/registry/journal；作者规则要求对照原需求纠正或在 handoff.remaining/uncertainty 说明冲突，后者停止。新独审必须继续按原完整要求拒绝遗漏。synthetic 越权案例必须证明实际写入被拒、源字节不变；不能宣称 host 能识别所有恶意自然语言。可阅读的建议也不意味着一定正确或被模型理解。

## 预算、请求数与时间（Root已选择②）

原预算池定义保持，新增策略只在原总额内选择固定分支。未注册草稿的预算可以在 selection 中按固定 policy 导出；没有旧 grant 回收、追加授权或历史账目修改。

不把每笔最高预留额当作实际结算费用。准入逐笔按当前native输入、实际settlement和原hard cap执行；下表不保证任意模型输出都能完成。保留两方案比较，实际实施只用Root已选择的②，不能运行中改份额。

| 选项/分支 | 首轮设计 | 修订设计 | 美术 | 编码 | 未分配 coding repair |
| --- | ---: | ---: | ---: | ---: | ---: |
| ① 首轮批准 | 25% | 0 | 20% | 35% | 20% |
| ① 一次修订 | 25% | 20% | 15% | 20% | 20% |
| ② 首轮批准（推荐） | 25% | 0 | 25% | 40% | 10% |
| ② 一次修订（推荐） | 25% | 20% | 20% | 25% | 10% |
| ② ¥5、pool4500000µ 修订分支 | 1125000 | 900000 | 900000 | 1125000 | 450000 |

① 保留900000µ codingrepair，原65536输出报价524288µ后有375712µ输入余量；首轮art900000、code1575000。需改COS132新policy常量/文档及affected测试；原已审25/25/40/10尚未发布为默认时才允许整批统一选择。修订分支code900000，未承诺固定cap能容所有后续大输入，必要时仍用已有adaptive floor。

② 保留COS132已审首轮份额和主要实现，补齐所有普通art/code/repair的既有adaptive floor；首轮art1125000、code1800000，修订分支art900000/code1125000，codingrepair450000保持。它为首轮正常生成留更多空间，变化范围更小；repair最大空间较①少，必须证明实际首请求的floor可付、后续每次继续检查。**推荐且Root已选择②**，不另建调账或预分配系统；①仅保留为已比较的替代方案。

按整数 floor 计算前四项，尾差归未分配 repair；先证明完整所选分支总额不超过原池。修订分支明确降低未注册art/code的初始额度，但不压到只够极小合成输出来换取整链最高预留保证。一次codingrepair仍独立计数。

修订900000µ完全复用COS132作者8192..32768、1/3 review reserve：作者最多使用600000µ，至少留下300000µ供独审；保留额不是独审的独立上限，reviewer可使用该任务全部实际剩余额度，输出仍4096..8192。沿用预算串行区、reserved/unknown/settled计入、实际reserve前复核。没有新增reserve比例/预算接口或固定修订cap。新session仍最多32次，压缩和纠正继续原规则、原会话累计和原一次机会。

②必要的容量配套：仅该新 execution policy 下，所有art/coding（含原一次 coding repair）启用**已有** `authorBudgetOutputLimit`，floor8192、原cap65536；不增加请求数或分配。65536输出自身报价524288µ已大于450000µ repair grant，固定cap会让repair永远无法派发。8192输出报价65536µ；450000µ空grant可容的原生输入上限为192232B（公式2B+65536≤450000），再逐笔扣除已结算/预留/未知费用。必须用最终实际codingrepair packet实报首请求B，不能只用此阈值声称通过。动态选择不低于8192，floor不足明确停止。本卡不新增压缩算法、不改变旧undefined policy的art/coding。

现 `createRoleFactory` 的runtime guard硬性要求有floor时cap≤32768；上述免费probe对art和coding的8192..65536配置都真实抛错，不能只改host配置或TypeScript类型。最小必要改动是在RoleFactoryOptions传递同一个已持久化的 `ordinaryDesignRevisionPolicy`，constructor仅在该字段严格等于`independent-review/1`、COS132原budget/compaction绑定有效时，允许art/coding的**固定**floor8192/cap65536组合；这份新配置必须同时覆盖art和coding。其余role仍cap≤32768，design的8192..32768 compaction guard保持；未知marker、65537、design/cosmos65536、缺失配套字段都拒绝。旧undefined带floor的65536仍按原guard拒绝，旧undefined无floor的原固定65536行为不改。

host只有在确认输入证明属于普通三角色scope时才启用此marker，作者派发前再核对已固定execution/selection；validation/modular/preparation/human/inherited均不传。误将新marker用于validation author必须在session/provider创建前拒绝。planning/reviewer继续原输出策略，codingrepair必须认证现repair-plan继承相同新marker，不能凭taskId后缀得到宽cap。复用原selector/预算钩子；不增加预算接口或模型可控制参数。验收同时覆盖真实constructor和实际role requestOutputLimit选择，不能用绕过constructor的mock证明可用。

初始作者和新修订作者每 session 最多32次，摘要、格式纠正均计入各自原生累计；新task绝不复用原session。整个原逻辑设计最多两次 author sessions / 两次独立审查，其中新修订只能一次。此上限明确允许一次新的受预算约束修订会话，不能通过改 task ID 获得第三次。新 reviewer 仍遵守原review会话请求上限和一次格式纠正；恢复不重置已用计数。

时间保持原 originalStartedAt/deadline。修订准入至少沿用现 successor 的60秒/任务加5秒cleanup，即设计修订与两个未开始下游合计185秒剩余门槛；这是保守停止规则的最低时间门槛，不是完成时间保证。实际每请求和host阶段仍受原deadline/OwnedWork/取消约束，不创建新30分钟窗口。unknown/reserved未清时不派发；budget/deadline/cancel stop保留原finding和当前已执行事实。

### 免费原生报价证据

目录：`C:/Users/26557/AppData/Local/Temp/cos134-revision-quote-20261027-b19c7e/sequential/`。实际COS132 factory/Pi/SDK、COS133生产规则，transport synthetic、fetch=0。五个完整read→两个实际edit→下一请求validate-game-design→下一请求合法handoff；随后reviewer六个完整read→拒绝。全部读取无截断，工具无错，结构passed；修改仅用于报价形状，未声称修好实际语义遗漏。

| 请求 | 原生输入B | 作者8192 / 独审4096报价µ | 原作者32768 / 独审8192报价µ |
| --- | ---: | ---: | ---: |
| 作者read | 22551 | 110638 | 307246 |
| 作者edit | 135498 | 336532 | 533140 |
| 作者check | 140309 | 346154 | 542762 |
| 作者handoff | 140912 | 347360 | 543968 |
| 独审read | 21184 | 75136 | 107904 |
| 独审verdict | 117315 | 267398 | 300166 |

作者8192四次共1140684µ；独审4096两次342534µ，8192两次408070µ。若每笔都按最高预留结算，总floor报价1483218µ，900000短583218；保持原作者32768则总最高报价2335186µ。这是必须保留的预算不足负例，不能据此宣称任何900000µ修订都不可行。

可测的完整SOURCE结算假设：transport明确回报author四次实际费用16000/64000/64000/64000µ、review两次16000/64000µ（fixture合成usage，非实际模型价格预测）。作者每次剩余额度为600000/584000/520000/456000µ，分别能容上述floor；前两次可用原32768cap，后两次由原adaptive选择。作者合计结算208000µ后，review第一次可用任务余额692000µ；第一次review结算16000µ后，第二次可用676000µ，两次8192报价均可付。第二次review结算64000µ后任务余额612000µ。300000µ仅是作者必须保留的最低额度，不能在作者结束后再次扣除或限制reviewer。真实完成链应记录每笔reserve/admit/settle、工具顺序和最后额度，证明没有超额或隐性借钱。此假设尚待实现后的完整SOURCE链核证，当前报价探针没有冒充完成这项验收。

实现后用最终规则/feedback字节核对这些最低准入，再跑上述明确结算模型的完整SOURCE链和最高费用不足负例；另实报art/code/repair首请求。复用不变输入，不把本候选报价当最终native内容。

这是固定synthetic路径逐次最高报价的容量证明，不是实际费用预测、任意修订的最低费用或成功保证。实际费用可能更低；额外反馈、更长输出、多轮修改仍可能不足。每次都按实际native input和已结算费用准入；付不起就停止，不从art/code/repair临时借钱。

## 恢复与完成判据

所有decision/feedback/plan/selection均write-once。写plan在注册/调用之前；注册仍由原controller原子append。允许恢复“plan已写、无attempt/请求/未知作者输出”的准备阶段；先逐字节核对已seed文件和只读输入，再补缺origin或一次registration。registered却无plan、冲突origin、部分未知输出或paid author/review started但无可信完成receipt，均保留现场并阻断，不重发。

已完成author/capture/verified/review沿现resumeTaskDag规则复用。已存在selection只认证后使用，不再次选择；v2 passed恢复不会重复first author、revision author或review。coding repair恢复继续自己的唯一plan与预算。停止/永久closed的旧运行没有迁移入口。

有限GREEN必须经过真实ordinary host控制链：synthetic reviewer指出一个原确定缺项→新author实际read固定feedback并修改自己副本→v2 capture与结构检查→新独审approved→art/code packets、capture依赖、candidate plan字节均只选v2，旧v1/拒绝仍可查。coding随后由可信host构造实际失败时仍只获得一次原codingrepair，且不会回到设计。

必要负例：第二次拒绝、零变化、空/空白review、错误版本/签名/身份、需求越权写入、源字节改变、预算floor不足、剩余时间不足、unknown/reserved、取消、各持久化边界恢复不重复调用、旧undefined保持旧行为。SOURCE synthetic只证明控制流、真实文件与准入/恢复边界，不能证明真实模型发现遗漏的概率或目标游戏完成。

## 实施文件边界

- 新 `src/runtime/entrypoint-design-revision.ts`：ordinary固定两路计划、来源认证、feedback/selection、一次token和恢复；不做模型语义判断。
- 改 `src/runtime/entrypoint.ts`：保存/恢复policy、先执行design、再执行selected图、报告原拒绝及停止原因。
- 改 `src/runtime/entrypoint-host.ts`：revision固定workspace/seed、精确角色/output绑定、下游固定分支budget/output策略。
- 改 `src/runtime/entrypoint-successors.ts`：仅增加认证selection作为codingrepair原图的读取路径。
- 改 `src/roles/factory.ts` 的必要runtime guard/marker条件与对应类型，仅允许上述新policy普通art/code的8192..65536；`author-output-budget.ts`、`provider-budget.ts`继续复用，不改reserve比例、selector算法或预算接口。host负责完整scope和固定execution/selection/repair-plan认证。
- 测试集中在新 `tests/runtime/ordinary-design-review-revision.test.ts`、相关ordinary fixture、现author budget测试。原则上不改contracts、ledger schema、registry、浏览器/媒体执行器、用户需求文件、transfer COS41路径。

独立implementer在独立managed worktree实施并提交精确SHA；独立reviewer读实际diff，先规格再质量；唯一merger集成通过的SHA并做受影响组合验证。只完成免费SOURCE，不运行全仓、付费模型、旧run或真实游戏修正。
