# 普通设计候选携带作者 concerns 进入独审

状态：独立 `design_candidate_review_reviewer` APPROVED_PLAN、无P1/P2，Root批准固定设计、免费源码实施与登记；源码已最终独审并集成，仅source-scoped完成。原文待审/未授权源码或登记字样属于批准前记录，当前状态以本段为准；未授权真实模型、旧run恢复或费用操作。

任务：[COS137 / #138](https://github.com/lrfluobida/Cosmos/issues/138)，原生父COS18/#19、父[x]；原生依赖COS134/135/136。作者 `ordinary_design_revision_implementer`，独立reviewer `design_candidate_review_reviewer`，唯一merger `public_agent_batch_merger`。

- 批准规格输入 SHA256：`5360db3938ca50b7ca9bb57bdc7b9d99669e2ddfc59d15c69386bd8ec61e87af`
- 批准计划输入 SHA256：`5fe65fa49422ae7616334331ab02a8b973b3920244e1422f32744f02e86e3340`

Root批准的计划Task3权限解释：先持久化完整review，再由system依据固定回执派生attempt/handoff；reviewer只保存review/state/evidence，不获得改写作者报告或直接清空handoff的权限。

工程基线 `14adda9a795de23111dc9e407b9219473306b75f`，源码组合 `aa50ecd1a18fc88fed5a27e8966cdcdddde34a38`。[reuse-3实际结案](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6434074975)保持：只读收尾实际成功但游戏仍incomplete，原run永久关闭，不resume或重复settle。本卡只改新策略评审准入与来源证明，不改原预算、次数、验收或旧execution。

状态：私有固定草案 v1，2026-10-27；供 Root 与独立 reviewer 审查。仅获准编写本 spec 和配套 plan，尚未批准源码实施、GitHub 登记或新的真实运行。

基线：`14adda9a795de23111dc9e407b9219473306b75f`。配套文件：[正式计划](../plans/2026-10-27-ordinary-design-candidate-review.md)。

源码结果：COS137 / #138已源码范围完成；[精确批准](https://github.com/lrfluobida/Cosmos/issues/138#issuecomment-6436182327)、[完成关闭](https://github.com/lrfluobida/Cosmos/issues/138#issuecomment-6436182896)及父[x]已GET核证。独立design_candidate_review_reviewer批准 `0487e6946b1d904599cf26ed3cffb850443dbffe`，无P1/P2；17批准文件精确、无冲突合入发布 `b287e812f8994e23466297f63ca4454a935eb67d`。

main typecheck/build exit0，5项短代表5/5、0skip、TAP88517.1685ms：/1旧门禁、/2冻结候选与concerns准入、原唯一revision/freshreview、冷恢复首次capture时间戳、原文/当前capture/host证据绑定。仅真实首次capture补实际capturedAt，已有缺时间回执仍阻断。原proposal与来源保留，完整review先落盘、system再派生attempt/handoff；reviewer只保存review/state/evidence。

当前F3复用完整budget_finalization三份作者来源、10文件170142B/完整read152817B、7concerns及11条工具结果与最终HTTP内容一致的已审证明；仅fetch提供fake SSE，原streamSimple保持。normal为changes_requested、余382513µ；fullquote正常路径同样changes_requested、余2523µ。density3纠正（floor446628µ/余382511µ）与fullquote纠正（floor446720µ/余2501µ）均在transport/reserve前拒绝；density6/cap5389的一次纠正成功仅是乐观合成敏感性，不是tokenizer预测或必过保证。每分支SOURCE指纹及最终冷恢复delta等价已审，新tracked normal亦含最终源码；旧简化作者/早无指纹报告不计当前证明。 仅SOURCE范围完成；R3原候选的六项语义缺口仍为changes_requested负例，真实模型召回、游戏完成和人工体验未获证明。既有有效旧证据复用，未重跑Edge/media/完整历史矩阵，未启动真实run/付费或改账本。原reuse-3永久结案保持，总137/root100/父31个源码子项完成，COS18整体仍open/partial。

## 1. 问题与证据边界

COS136 已成功完成 reuse-3 的预算内只读收尾。普通请求因 `author_review_reserve` 未发送后，同一作者会话禁用全部工具并使用原唯一 correction 槽，返回合法 proposal；host 随后捕获 design@v1。现有 `orchestrator.ts:426` 因 remaining/uncertainty 非空，在 host verification 与独审前停止。这是现有契约的结果，不是 COS136 收尾失败。

原始材料根目录为 `E:/develop/Cosmos/.cosmos/public-validation/room-20261027-reuse-3/run`，以后简称 R3。该 run 已由 Root 永久 stop/settle：child129、shared3370，29 笔费用 567610µ，释放 4432390µ。禁止恢复、改回执、补政策、重新结算或将其用于真实派发。本卡仅可只读复制必要材料到免费 SOURCE 的 TEMP 根目录。

已核实的原始事实：

- native `sessions/e52a09dc-ee8e-4002-9c45-fe2447d7738b/author/2026-10-27T02-10-52-650Z_01a17b1f-ee69-7306-9115-94d219183be9.jsonl` L48 是最后 edit，L50 显式 validate-game-design 为 passed；之后仅 read，没有再次修改。
- 成功 write/edit 的纯内存重放，与 workspace 和 capture 逐字节相等。design.json 为 23534B、SHA256 `3b8d88f2d4a5c8dcd462b7d98b1d7d524c27e5606fc6e64c5710c14132c190dc`；acceptance-plan.json 为 44489B、SHA256 `6be9ac8755910019a1dc9ca6996a777e1a19c2e8c4352f3b35c1639f4b81e269`。
- 作者的“最终修改后未自检”与上述事实不符；L53 压缩摘要也仍描述已完成的步骤为待办。保留其原文，不把作者自述变成主机失败证据。
- 最终 proposal 有 3 条 remaining、4 条 uncertainty。实际计划仍存在首击关声顺序、音频匹配 id、隐藏目标点击、0/3 与完整读档覆盖、成功继续后音乐观测、额外重开前置状态等缺口。当前候选只能作为独审 changes_requested 的语义负例。
- 现 host capture 校验结构和固定需求引用；完整 host verify 仍须在当前 capture 上执行。二者均不证明全部语义、实际游戏或人类体验通过。

需求与证据：R3 `registry/captures/requirement-bundle/v2/files/_cosmos/requirement-draft.json`；最终两文件位于 `registry/captures/design/v1/files/_cosmos/`；原作者报告及收尾来源位于 `journal/task-design-room-game/`。原始工具记录只用于核查事实，不给新执行授权。

## 2. 目标与不变条件

让新的普通 design 执行中，结构有效且已冻结的候选携带作者原始 remaining/uncertainty，经过现有 host 检查和独立全范围设计评审。真实缺口由评审给出 changes_requested，消费 COS134 已有的一次 revision；只有最终完整批准才放行下游。

本卡只改变评审准入与证明传递，不要求作者先声明完美。remaining/uncertainty 不自动等价于缺陷，也不自动等价于可忽略检查。检查它们的职责由固定主机校验和独立 reviewer 承担，不新增分类模型。

以下保持：

- 原确认需求、全部 AC/EX、媒体观察与正常输入契约、验收阈值、最终用户体验判断。
- 原 run/task grant、报价与实际计费、独审保留、deadline、清理余量、资源不足时停止。
- 每个 design 作者原 32 请求；既有 reviewer 原 16 请求；原一次作者 format/budget follow-up 共用槽、原一次 reviewer protocol correction。修订仍是原有最多一次 design revision，各自会话计数不重置。
- 原作者与 reviewer 独立身份/上下文，冻结工作区、固定输入和捕获版本，先 host verify 后独审。
- 无新作者澄清会话、无额外 reviewer、无增量分配、无额外 revision、无错误后盲跑。
- art/coding/planning、fixed validation、preparation、modular、追加 continuation 不获得带 concerns 放行的新权限。既有 coding concern 路径不变。

## 3. 版本选择

| 选择 | 影响 | 决定 |
| --- | --- | --- |
| 扩展 `ordinaryDesignRevisionPolicy` 为 `independent-review/2` | 同一政策负责原 design、独审、唯一 revision、selection 认证；旧 /1 可精确保留 | 采用 |
| 新增独立 candidate-review flag | 与 revision/finalization 组合出更多持久状态，仍需修改同一认证链 | 不采用 |
| 静默改变 /1 或按 proposal 内容猜测 | 改变旧 execution 的解释，无法区分旧证据与新批准规则 | 不采用 |

新可信普通入口在整条 SOURCE 验证通过后选择 `/2`。resume 必须保留 execution 的实际原值，不能把 truthy 值重新写成最新版本。缺省和 `/1` 保持旧门槛及旧回执形态；null、未知值、范围不兼容、execution/host/origin 不一致在角色创建前拒绝。

`ordinaryDesignFinalizationPolicy:"budget-followup/1"` 与 `ordinaryDesignBudgetPolicy:"review-reserve/1"` 保持各自含义。本卡不借 finalization 字段承载评审语义。

复用原 `execution.json` 字段、revision-plan/selection/repair-plan 的 `policy` 或同名字段；将枚举扩展为 /1|/2 并精确相等。既有 revision-plan/selection 外层 formatVersion 不变，因为字段结构未变。不得到处用新的布尔开关表达同一选择。

### 3.1 Origin 与范围绑定

- 只对 `/2` 选定的初始 design 和其合法唯一 revision，在现 RecoveryOrigin 中镜像同名 `ordinaryDesignRevisionPolicy:"independent-review/2"`。仍为原 formatVersion1；/1、缺省及其他角色继续省略，保持旧字节。
- origin 同时满足可信 ordinary execution、当前 task/attempt、原需求、原预算/时钟、角色 design、非 executionWindow/validation。镜像是认证记录，不是单独授权令牌。
- orchestrator、COS134 origin、prepareDesignOrigins、coding repair 祖先读取、continuation 的历史来源读取必须使用同一派生规则。历史合法 /2 design 可以被认证；当前 repair/continuation 角色不能因此获得候选评审豁免。
- execution、origin 或完整回执单边增删/修改该字段均拒绝。新代码不补写旧 origin，不升级旧 execution，不恢复已停止 run。

## 4. 最小数据与作者来源

新增一个局部模块 `src/runtime/repair/design-concerns.ts`，负责候选来源认证、原文字段索引、review schema 与恢复重算。复用 coding-concerns 的证明规则思想；不把 coding 的 validation authority 或 remaining 必须为空的条件搬到普通 design。

每个 /2 design attempt 在完整 capture 后写一次 journal stage `design-concerns`。没有 concerns 的 /2 candidate 也写同一种记录，减少“空数组例外”分支。记录最少包含：

```text
formatVersion: ordinary-design-concern-review/1
policy: independent-review/2
taskId, attemptId, authorId, contextId
proposal: 原 author.json 中完整 summary/remaining/uncertainty
proposalSha256
capturedAt, capture: 当前固定 artifact reference
concerns: [{concernId, field: remaining|uncertainty, index}]
authorSources: 原 author / 可选 correction-started / correction-response 的路径及字节签名
signature: 固定要求、inputs、interfaces、capture 的现有 ContentSignature
```

- 按 remaining 后 uncertainty、原数组顺序生成稳定 ID；重复文字、空字符串等原协议允许值也逐项保留，不去重、不分类、不改写、不挪进 summary。通过 field/index 得到精确 text，proposal 只保存和发送一次。
- reviewer resolution 必须回传 concernId 与精确 concernText；host 对照原 field/index 校验。文本里的指令只作待评材料。
- 原 author/correction 回执原封不动；若存在格式纠正，保留并在 reviewer packet 提供原 `originalReply`，避免隐藏纠正前自述。原文不能解析时不推断新结构化 concerns，reviewer 仍需读取它并审查完整范围。预算收尾无先前合法 proposal，保留其 unsent/native 来源认证及原 response。
- 复用 `recoverAuthorProposal`/`requireBudgetFinalizationSource` 核验现有完整纠正来源；不从磁盘重建活会话权限，不新发收尾请求。原 reply/identity/input/workspace/native 签名与 proposal 不一致即阻断。
- capturedAt 使用真实 capture 回执的时间/身份，核对 attempt 边界，不在恢复时用当前时间补造。
- 不把作者疑问包装为 HostFailure、passing evidence 或独审 findings；不向任意 journal/session 目录扩大 reviewer 读取权限。
- reviewer packet 嵌入上述固定 proposal、concern 索引与必要原文；其普通文件读取范围仍是冻结 requirements/artifacts/interfaces/真实 host evidence。原回执保留供主机认证，来源哈希不是语义证据。

这是一份候选审查记录，不是新的 execution policy、任务输入版本或独立授权文件。不改变已规划 task.inputs；输入/输出来源仍由现固定 refs 约束。

## 5. 新执行顺序

1. 作者沿原会话产出严格合法 proposal；不合法时只使用现有一次 correction，仍不合法则停止。
2. 原 capture 验证必需文件、结构、输入引用和计划支持范围，捕获到预定版本。缺文件/结构失败不进入 reviewer。
3. 对 /2 的合法普通 design 建立并冻结 design-concerns；校验实际 capture、原作者来源及固定输入。对缺省、/1或非design继续原 handoff 门槛。
4. 运行现 host verify，生成当前 task/attempt、capture 版本绑定的实际证据。失败、不完整或来源漂移时停止，不能调用 reviewer 来洗白失败。
5. 建立原独立 reviewer 会话。packet 显式含 concerns、原报告、全部固定任务验收/规则、固定输入和捕获、真实 host evidence；必须读取完整确认问答/AC/EX与完整最终两文件。审核范围不缩小到 concerns。
6. 通过扩展 schema 的真实 reviewer proposal 才落 `review` 回执。其身份、输入、证据、concern resolutions 与签名全部合格后，再按现 reviewer 写入权限产生 reviewed task 状态。
7. approved 才能进入原 selection；changes_requested 只能进入原一次 revision 或在额度/时间不足时保留 incomplete。下游注册、分配、角色创建仍由 selection 控制。

review 前不得清空原报告或 task 中的作者未决信息。review 后的 task.handoff 是当前核实结果：approved 可依据完整 resolution 把当前 remaining/uncertainty 置空；changes_requested 保留 reviewer findings 及尚未解决的 concern 文本。该状态推导不回写 author.json，不改作者自述。完整 review 先持久化，恢复按同一回执重算，不能留下“已清空但无独审来源”的可接受状态。

## 6. 独审协议与批准条件

复用原四个字段 `verdict,inputVersions,evidenceIds,findings`，仅在 /2 design reviewer 中增加 `concernResolutions`：

```text
{concernId, concernText, status: resolved|unresolved,
 basis: fixed_input|captured_output|host_evidence,
 rationale, acceptanceIds, inputVersions, evidenceIds, evidenceRefs}
```

- 每条 concern 恰好一次；ID、原文字节、数量、索引全部匹配，禁止遗漏、重复、替换或未知字段。
- 顶层 inputVersions 仍精确等于原 parser 要求的固定 task inputs+artifacts；现 verdict/evidence/findings 验证继续执行。
- 每条 acceptanceIds 是当前固定任务验收的非空子集。设计任务可能只有 COSMOS-DESIGN；rationale 还必须指明其所核对的原 gameplay/experience ID、文件和具体条目/步骤，不允许只说“看起来完成”。
- fixed_input：引用实际固定需求或任务输入/接口；evidenceIds/evidenceRefs为空。只适合需求解释、职责边界等结论，不能凭“下游将来会检查”证明设计缺失已解决。
- captured_output：引用当前固定捕获，rationale 指明内容位置及与原需求的对应关系；evidenceIds/evidenceRefs为空。允许 reviewer 对最终文字、顺序与计数推理做独立判断，不能把判断伪装成已运行游戏证据。
- host_evidence：只引用当前 capture 之后实际产生、当前 task/attempt/版本匹配且 passed 的 host evidence；ID及sources必须与现证据完全一致。旧通过、未执行、模型自述、缺失/失败证据均不能引用为通过。
- 引用的 refs 必须属于固定白名单；当前产物结论不能仅引用旧 design 接口。每种 basis 的非空引用要求由 parser 核实，rationale 是否证明语义由独审承担。
- approved 必须全部 concerns resolved、findings为空、全部原固定验收满足、host evidence完整通过。即使 concerns 全解决，发现其他真实缺口也必须 changes_requested。
- changes_requested 必须有实际未满足要求的非空 findings；所有 concerns仍逐项回答，未解决项标 unresolved并在findings中说明需要修改或缺证。不得因数组不好填而把疑问直接宣告已解决。
- 空 concern 集合仍用完整全scope独审与空 resolution 数组，不能跳过 reviewer。
- schema错误仍只使用现原 reviewer 同会话一次 protocol correction；correctionPrompt 包含新schema与原concern约束。资源错误不转协议纠正、不新建会话。

## 7. COS134 唯一修订与历史认证

`authenticateDesign()` 必须按 execution.policy分支。/1保持现原空数组及四字段规则；/2必须核验 design-concerns、原proposal来源、真实host证据、扩展review以及review后派生handoff，不再要求原作者数组为空。

- `/2 needs_changes` 是已完成一次真实评审的候选；原作者不确定可保留，其合法性由逐项review回执建立。不能仅删除原 `task.handoff.uncertainty.length` 或 `author.proposal.remaining.length` 检查。
- 现 feedback 的 authority继续是 `independent_model_review`；携带经认证的完整review和原concern来源。它是模型建议，不是用户新授权或HostFailure。
- 现 receipts map增加当前 design-concerns及存在的author correction回执签名；selection、revision-plan、feedback依赖这些精确字节。未知/缺失/篡改回执拒绝。
- revision workspace仍由原已捕获design逐字节种子化；只改自己的design输出。原requirements、旧capture、反馈和原作者报告只读。
- revision必须有实际文件变化；no_output_change仍在第二次review前停止。真实变化不代表已修好，随后重新capture、host verify、fresh独立review，使用同一/2协议。
- revision的packet还必须携带原feedback与旧design接口。原拒绝findings需由新review核对是否解决；即使修订作者给空arrays，也不能绕过原拒绝点。
- revision再次changes_requested/invalid/host失败/资源不足即停止，无第三作者或第三设计review。原code repair槽仍只归coding，不消费为第二设计修订。
- completed delivery、readDesignSelection、supported continuation、coding repair祖先认证必须读取实际/2证明；不能只因task.state=passed而接受。

## 8. 冷恢复与失败

复用原 write-once journal和阶段规则，不新增自动重试循环。

| 中断点 | 恢复规则 |
| --- | --- |
| author未完整或correction只有started | 保留阻断；不重发作者/收尾 |
| capture已完成、concern记录尚无 | 仅在原有完整capture可认证且未有后继review记录时，从固定author+capture确定性建立同一记录；不猜测缺失来源 |
| concern记录存在 | 精确重算身份、索引、原文与签名；不匹配即阻断 |
| verify-started无完整verified | 按原规则阻断，不能将作者自检充当host证据 |
| 完整verified、review未started | 在仍有效的原执行权限/预算/时限内，沿原阶段首次启动review；这不是新评审轮次 |
| review-started/协议纠正started，缺完整review | 保留原未知状态；不新建review或补发纠正 |
| 完整review，task更新或selection未完成 | 校验同一回执后只完成确定性状态/selection；零模型请求，不重跑已通过host检查 |
| revision/selection已存在 | 原始policy、execution bytes、native plan、所有来源签名及唯一revision身份一致才复用 |

历史/1记录与预算收尾回执不因新代码得到/2权限。已停止、过期或永久闭账run不恢复。测试中的历史认证必须使用新的TEMP根和自有合成控制器，绝不能打开R3真实controller。

## 9. 实际完整输入与预算验证要求

reviewer可用的是原task未用余额，而非固定375000µ上限。R3在收尾完成后的grant为1125000µ、已结544313µ、未决0，故**580687µ**可用于原独审。375000µ是作者阶段保留底线，不是reviewercap。本卡不调整任一数值。

必须做一项独立命名的免费SOURCE容量验证，使用R3完整23534B+44489B两文件、完整固定requirement问答/AC/EX、原3+4条concerns及summary、来源/host evidence、实际新review协议和工具schema。不能以小fixture或只测顶层packet证明可用。

验证走真实 `createRoleFactory` 与 pinned `createPiSession`/SDK序列化，**只在fetch层返回本地fake SSE**，保留原ModelRuntime.streamSimple；预算控制器和文件均为TEMP。不能照抄现design-review-budget.fixture的streamSimple替身，因为它绕过最终HTTP序列化。使用测试专用凭据和封闭fetch拦截，不读取真实密钥，不发真实网络请求。真实读取工具从冻结镜像返回文件，保留生产已有compactFullJsonReads行为，不裁剪语义、删concerns或用fake read文本。

只读准备测量已获得下列材料规模：10个原input/artifact文件共170142源字节，经生产完整JSON读取显示后为152817文本字节，均无截断/error；其中两份输出分别22636B/39384B，requirement的direct与bundle两组引用均完整保留。原7条concerns字符串数组JSON为1739B。这些数值不含完整factory system/packet、SDK包装、工具调用历史和新host evidence，**不是完整请求大小或报价**。不同引用即使内容相同也须保留，不能为降低报价做内容去重。

测量并记录：

1. 首轮reviewer请求的实际normalized inputBytes、输出cap与reserve报价。
2. 完整读取全部10个固定输入/输出文件及当前host证据后，包含全部历史tool结果的最终verdict请求实际inputBytes和cap/quote；如果分多次read，每次原请求与费用计数都记录。另核实SDK实际HTTP body和tool responses的完整性，记录body字节；HTTP body大小不能替代生产requestInputBytes。无图原报价仍为`2*inputBytes+8*cap`。
3. 正常合法changes_requested，以及一次原协议纠正路径的完整输入/quote。必须保留原7条concerns和六项缺口，不把本candidate改成approved正例。
4. 记录每轮 `committed+reserved+nextQuote <=1125000µ`，起点committed=544313µ；原reviewer16计数、4096..8192输出选择、原deadline/cleanup均生效。输出max与实际usage分列，不能把quote视为费用或反复叠加已释放reserve。
5. 用明确标记的非零合成usage结算，至少覆盖一次较高输出/完整纠正路径，并单列“此前各轮按完整quote结算”的保守分支。各分支如实报告是否可完成及首次拒绝位置；不得以1 input/1 output等任意低usage证明累计可负担。另做预算不足负例确认发送前拒绝；fake读完不等于真实模型充分评审。

SOURCE通过必须证明预定完整读入与结论回合在上述原余额和计数下可准入，并公开每轮输入、报价、结算假设及剩余量。若不通过，报告具体瓶颈并交回Root；不删除材料、不降原输出floor、不加预算、不增加会话或暗换策略。草案阶段尚无/2实现，因此此处规定测量验收，不伪造未来数值。

## 10. 验收与实施范围

必要SOURCE代表：

- /2完整候选+7concerns能到实际host检查和独立review packet；/1同输入仍在原handoff停止。
- 原文/来源保持；篡改、删除、重复、漏答concern、伪造/失配/失败host证据均不能approved。
- 完整独审通过才选择；有其他缺陷即使所有concerns解决也changes_requested。
- R3原候选负例→changes_requested，保持旧capture原字节；单独小合成非目标游戏fixture证明唯一revision→freshreview→selection，不能手工修R3来制造通过。
- nochange、second rejection、invalid protocol/correction已用、资源不足、host失败均无额外作者/下游。
- 冷恢复的完整证明复用、半回执拒绝、oldpolicy/unknownpolicy、repair/continue/交付读回兼容。
- §9完整原生输入容量测量单独报告，不与小fixture通过数混淆。

源码实施按独立implementer、独立reviewer、唯一merger进行，Root批准本草案后再安排。免费SOURCE结果只证明平台源码行为；不能宣称真实游戏、独立真实设计评审、完整体验或COS18已完成。

核心文件预计：`src/runtime/repair/design-concerns.ts`（新增局部模块），`orchestrator.ts`、`entrypoint-design-revision.ts`、`entrypoint.ts`、`entrypoint-host.ts`、`recovery/task-journal.ts`、`roles/factory.ts`；历史认证相关 `entrypoint-successors.ts`、`continuation-plan.ts` 与必要类型。仅在受影响调用点改动，不重构无关模块、账本schema、provider或浏览器执行器。
