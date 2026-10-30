# COS160：同一运行内守恒的设计修订额度

状态：review-v2已由design_revision_budget_reviewer独立DESIGN_APPROVED，Root明确批准实施及ADR设计决定；SOURCE pending，非源码批准或预算增额。作者design_revision_budget_implementer，独立reviewer后续审actualdiff，唯一merger planning_budget_merger。只以v2技术条款为当前实施依据，不混入v1过宽eligibility或统一32请求上限。

任务：[COS160 / #161](https://github.com/lrfluobida/Cosmos/issues/161)，id6115177248；原生父COS18/#19未勾，依赖[COS134 / #135](https://github.com/lrfluobida/Cosmos/issues/135)唯一design revision与[COS132 / #133](https://github.com/lrfluobida/Cosmos/issues/133)review reserve。runtime基线 `66884f836b6b8f8e49872208be3b2c0a54f23808`。[ADR0006](../adr/0006-conserved-ordinary-design-revision-budget.md)的accepted仅代表Root接受设计决定，SOURCE仍pending。

v2批准输入SHA256：spec `52b3efc20712a2cd812b00339f642d5ff04aa052b2f97b009b10ff9e2013daa3`；plan `ec60fc6ac98c16f1980edaca16e44cf576639e0d0ce98c3847ff408f156e83d5`；ADR `bd5f111f0cb5b8bce838156460cd9f193b94f8019b93d72c9bdcdf505412c344`。immutable approved-v2原件及登记副本保持。真实phase45/C37871307µ/H0无变更，无新paid或实际预算激活。

## v1 审查纠正记录

v1曾收到DESIGN_CHANGES_REQUIRED。原始spec/plan/ADR逐字节保存在`.cosmos/planning/conserved-design-revision-budget/review-v1/`，其SHA分别为`646da7007577934156da6377efb12349963b8308af472fbc95095990ae9207a7`、`407dd068dd3dc7f385b2efdf41124a3c219f9b2390c4b2442c3ba2543f37898d`、`6c687c01671dc85a8562a12c468646cb060ad0d8c431dc0d621e795a86e8b5bb`。这些只保留审查历史，不是可与下方v2混用的实施条款。

- Eligibility已收窄为生产funding来源完整正向认证的fresh public-funded ordinary子运行；非funded ordinary继续原ledger1和正式continuation。
- 生命周期明确为单controller/owner tracker、真实create至成功close/operationDone的active/epoch、缓存close promise及不确定失败保留owner lock；能力绑定当前live OwnedWork operation/controller/source/intent/epoch，冷恢复依具体来源回执。
- 已提交exact retry经专用no-expire队列只读返回；首次激活仍执行原expire/stop/余量门禁。
- 请求上限保持当前design author64、reviewer/planner16及其他角色overrides；v1统一32的表述不再适用。

v2完整变更记录另见`.cosmos/planning/conserved-design-revision-budget/review-v2/changes.md`。以下技术条款以immutable approved-v2为准；设计已获批准，实际SOURCE仍须独立审查与唯一集成。

## 1. 问题和边界

R25 初始设计获得有效 `changes_requested`，原 grant 1,125,000µ 中已结算 492,169µ、未用 632,831µ。既有唯一 revision 的基础 grant 为 900,000µ，实际作者与独审结算 594,308µ 后只余 305,692µ；完整 211,718B 输入及 4,096 输出下限需要 456,204µ，故纠错在 provider 前拒绝。删掉整个纠错提示仍需 443,978µ。证据沿用 `.cosmos/planning/revision-review-reuse25/diagnosis.md`；不重跑、不改写实际记录。

本卡只让**经现有生产资金来源认证的新 public-funded ordinary 子运行**在初始设计已完整独审、原阶段已结束后，把该任务未用的分配额加入原有唯一 fresh revision。它是托管普通游戏生成的预算策略，不硬编码房间、案例 ID 或金额。非 funded ordinary 保持 ledger1 及原正式 continuation 能力。费用不退款；原 task/grant/requests 不修改；不扩展模型权限、验收、时间或整个运行的金额。

保持：当前原 run 5,000,000µ/30 分钟、public phase ¥45/shared ¥150、原 planning/intake 费用、初始设计 grant、美术/编码基础 grant、1/3 review reserve 比例、最多一次 revision、原 correction/session/model/output-cap 规则。金额与时间从真实 funding binding 与 run 读取，不用这些当前数值作为身份白名单。当前 design author=64、reviewer/planner=16；保留现有其他角色 overrides，不建立统一 32 请求限额。完整 requirements、旧设计接口、feedback、capture、host evidence、concerns、thinking 与读取材料保持。

## 2. 选择与术语

推荐“fresh 时冻结策略，唯一 activation 原子升级账本”。在 fresh generation bootstrap 就创建新 profile 会扩到 intake 的转换与恢复；继续使用 ledger2 会伪装成人类确认续窗，ledger3–5 则属于共享验证。两者均不采用。

新增主机策略 `ordinaryDesignRevisionBudgetPolicy: 'conserved-initial-unused/1'`，独立于原 `ordinaryDesignBudgetPolicy: 'review-reserve/1'`、`ordinaryDesignRevisionPolicy: 'independent-review/2'`。

- **初始设计未用分配额**：原初始设计 grant 减去其全部已结算费用；不是共享余额、退款或其他角色余额。
- **设计修订预算意图**：主机准备并固定的唯一旧 grant 关闭及新 revision grant 方案；存在此文件尚无新的派发权。
- **设计修订预算激活回执**：与关闭记录和目标任务在同一 snapshot 内提交的主机来源链；独审建议仅是触发事实，不是预算授权。

设计术语已按纯glossary格式最小写入`CONTEXT.md`；[ADR0006](../adr/0006-conserved-ordinary-design-revision-budget.md)编号已核无冲突，accepted仅代表Root设计决定，SOURCE仍pending。

## 3. 策略冻结与兼容

1. 只在 `executeGeneration` 的 fresh、ordinary-design/1、非 codeProfile、非 preparation、原 format1/ledger1、完整 requirement confirmation、生产 ordinary host 条件同时成立时，且 `readPublicFundingIntent` 返回真实 intent、`verifyPublicValidationFunding({dispatch:true})` 完整验证通过，才由可信入口选择新策略。后者须成功核验 authorization/source SHA、child/origin/intent 精确 binding、shared record、未结案/未 overrun 与完整需求；不能将 raw `snapshot.validationFunding` 真值或无 funding 时返回的 no-op 当正向认证。冻结并绑定已认证 fundingId/authorizationSha256。
2. 在首次 paid planning 前，`planning-started.json` write-once 保存 marker，连同原 run/ledger/requirement/capability 和本次生命周期 started 引用；`execution.json` 原样保存相同 marker。host 返回的选择必须与入口完全一致。策略不能来自模型 task JSON、用户传入金额或旧 run 文件补丁。
3. 新策略不改 intake snapshot，也不重新创建 generation：intake→generation 原有克隆、费用、起点、deadline 和引用需求来源全部保留。初始 design 期间继续 ledger1。
4. resume 只读冻结的 planning/execution 双 marker；两者缺省时严格旧行为；未知值、单边字段、内容冲突或与任务能力不匹配均拒绝。`planning-started` 已存在而 `execution` 缺失沿原规则拒绝 paid replan；不得通过 fresh 再调用或升级平台补选策略。
5. 第一次 revision activation 才允许 ledger1→ledger6。未选择新策略的旧运行、非 funded ordinary、任何已存在 revision、v2 continuation、validation3–5、历史共享 settlement 均不升级。funded continuation 原本已由 `rejectFundedContinuation` 禁止；本卡不得借新 profile 删除非 funded ordinary 的既有正式续窗能力。

## 4. 数额与持久契约

保留现有受信基础计算：`P = originalLimit - sum(intake/planning allocations)`；`G = initial design allocation`；`S = sum(source settled)`；`U = G - S`；`B = floor(P * 0.20)`；`H = B + U`。art=`floor(P*0.20)`，coding=`floor(P*0.25)`。G/P/角色契约来自冻结 host plan 与原 ledger，不接受 intent 自报值。

所有金额须为安全整数，G>0、B>0、0≤S≤G；U=0 合法，仍关闭原 grant 并给唯一目标 B；B=0 不用 U 凭空制造任务。目标与 source 必须同 run/ledger/original deadline，且目标 task 是当前 `deriveRevision` 的完整确定性派生结果，只有 grant 按 H 替换。净分配检查使用 `G + H - U + art + coding ≤ P`。新增 ledger 净 allocation 是 B，不是零；两阶段守恒为 `G+H-U=G+B`。

新增 ledger `contractVersion: '6.0.0'`，仅 scope generation，沿用原 fields 和 `allocationClosures`，没有 authorizations/delegations/supplements。它只允许一条初始 design closure；`decisionId` 是本主机 activation identity，不是 human decision。原 allocations 与 entries 追加规则不变；source allocation 永不改小、费用永不删除。`budgetCapacity` 现有净额算法可复用。

在原 `ordinary-design-revision-plan.json` 中仅对新策略写 version2（旧 version1 字节与解释保持），包含原计划全部字段及 budget intent：policy、run/ledger、source task/attempt、G/S/U/B/H、target task ID、original start/deadline/limit、execution/native-plan/planning-started/feedback SHA256、`authenticateDesign` 返回的原 journal receipt 哈希、源请求记录的精确集合及确定 activationId。plan 内已有完整 prepared revision/downstream；不复制整份历史文本。intent 在提交前 write-once 发布，写入中断沿现有临时文件规则处理。

`RunSnapshot` 仍 format1，新增可选单值 `ordinaryDesignRevisionBudgetActivation`：版本、policy、activationId、basisRevision、activatedAt、intent 引用和 SHA256、完整数额/源目标身份/原 run 边界/源 receipt bindings、已认证 fundingId/authorizationSha256、激活 owner token/started receipt SHA256/stage epoch。激活事件 `ordinary_design_revision_budget_activated` 在同次 snapshot 中唯一出现，reason=activationId、requestId=null。新 profile、closure、activation receipt、事件、目标 grant/task/run.taskIds 必须一一对应；任何半状态失败关闭。非新 profile 不得携带这些字段/事件。

## 5. 主机授权与原子转换

入口先用现有 `authenticateDesign` 验证初始 `needs_changes`：唯一 ended/passed attempt、真实独立 `changes_requested`、非空 findings、完整 capture/host checks/inputs/provenance、原 concern/parser/journal signatures，不将 state 字段或模型文字当授权。下游任务尚未注册；source 必须是 execution 中唯一初始 design。

### 5.1 新策略的窄生命周期与能力签发

现有 `RunController.close:592-598` 不等待 actor；`OwnerLock.close:426-437` 只查 children；`recoverRunOwner:43-49` 在无锁时返回 false。这三者单独均不能证明旧同进程 actor 已消失。新策略采用“一个 controller-bound tracker + 保留原 owner lock + 有限 owner 起止回执”，不新建通用 actor framework。

1. `executeGeneration` 在选中并正向认证策略后、创建 host/任何 native role 前，为当前 controller 绑定唯一 tracker。它保存当前 `SnapshotStore` 的原 owner token/PID（新增只读身份 accessor，不接收调用方自报 owner），私有对象身份和单调 session epoch。一个 controller 不允许替换 tracker 或第二个 host factory；新 host 必须沿用原绑定，不能用空 counter/新 nonce 洗掉失败。
2. tracker 在受保护目录 `ordinary-design-budget-lifecycle/` 用现有 write-once 发布 `owner-<token>-started.json`，含固定 run/ledger/policy/funding 身份与原 owner identity。随后在当前 snapshot 追加唯一 `ordinary_design_budget_owner_started` 事件，reason 为精确 owner token/ref/SHA256/policy/funding binding；事件是 append-only 来源锚，不授予 budget。format1/ledger1 在策略准备时允许此窄生命周期事件，`run-validation` 检查 funded identity 与同 owner 唯一性；缺文件/重复/冲突/删除都拒绝。文件发布和事件提交都成功后，才允许 native role 创建。receipt-only crash 不证明执行已开始且不可新建付费规划，恢复保持原拒绝边界。

   跟踪仅限此已选策略的 host factory，包括 planning、作者和 reviewer（planning 原直返 nativeRoles 分支也必须被最外层包装）。beginCreate 先增 active 与 epoch，再 await 实际 native factory；成功 close 在底层 Pi.close 已 await operationDone 后才减 active、增 epoch。创建或关闭不确定失败永久 latch `blocked`；同一 native session 的 close promise 缓存，不能利用 Pi 内部 closed=true 后第二次 close 立即返回伪造第一次成功。
3. selected controller 的 `close` 先禁止新增会话/失效所有能力并 abort，但只有 tracker active=0、无 blocked、所有绑定 `OwnedWork.run` promise 已实际 settled、原 pending/accounting 已排空时才发布 `owner-<token>-closed.json` 并调用 store.close。closed receipt 精确引用 started receipt/hash、owner 和最终 epoch。任何条件未满足或发布失败均抛错且保留 `.controller.lock`；completion fallback 也不能绕过。同进程新 controller 因原 owner 存活且锁保留而无法 acquire/recover。
4. 每次新 owner 绑定前，逐个检查 snapshot 事件锚定的既有 started receipt，不能只列目录后把缺文件当“没有旧 owner”。旧 owner 必须有精确 closed receipt，或现有 `recoverRunOwner → SnapshotStore.recover → recordFundingRecovery` 已持久保存的同 owner token 完整恢复记录（原 PID/children 已按现有守卫证明退出）。仍存在的旧锁始终走现有 recovery，不能凭 closed receipt跳过存活 owner。无锁、PID猜测、当前 counter=0 均不是证明；缺对应 close/recovery receipt 就拒绝，不补回执。不修改通用 OwnerLock recovery 或旧运行解释。
5. `OwnedWork.run` 给 callback 增加可选第二参数 opaque operation token，内部私有 WeakMap 绑定实际 work 实例与 promise。只在 callback 真正执行时生成，resolve/reject 时失效，cancelAndDrain 开始立即失效；signal 未 abort 不能让已结束 operation 继续有效。`executeGeneration` 在 callback 首行把该 token 绑定至原 tracker，任何绑定前的 role creation 都拒绝。现有只接 signal 的调用保持原语义。提供仅身份/活性断言，不提供公开 token constructor 或可自行声明的 active flag。
6. capability 仅由已绑定生产 host 的初始设计 stage 路径签发，mint 闭包不作为 controller 公共 API：暖路径在 await invoke 返回后，冷路径在上述 owner lineage 验证及只读 source 认证后。私有 WeakMap 注册 opaque frozen token，绑定 tracker identity、controller/owner、work/operation token、source task+attempt、intent SHA256 与当前 epoch。raw/JSON/品牌对象、另一 host/controller/work、旧 owner token 或旧 epoch 均不可通过；create/close/失败/cleanup/operation结束都会使旧能力失效。模型或用户输入不接触这些对象。

因此“stage idle”是当前活 generation operation 内无未关闭会话的已认证阶段边界，不是整个 `OwnedWork` 已结束；不能在 activation 前取消包含 generation 的外层 work。暖路径仍复用 orchestrator 的 await author/reviewer.close，冷路径不推断丢失 actor 回执。

### 5.2 先查只读 retry，再执行首次激活

窄 controller activation API 接收固定 intent 引用及上述 host capability，不接收任意 amounts/closure/TaskContract。保持 **accounting→pending queue** 顺序，但不能直接进入当前会先调用 expire() 的 `serial`。新增仅此 API 使用的 no-expire 入队分支：在最新 snapshot 上先判断既有 activation。

- 已存在：用传入 snapshot 的只读 facade 完整认证 exact intent/receipt/source，完全匹配就返回；不调用 `read()`、expire、event、commit、deadline arm 或 funding dispatch gate，不要求 live work/capability。停止或到期也不产生写入；冲突仍拒绝。正常 deadline timer 作为独立操作仍按原规则工作，测试应隔离其独立推进，断言该 retry 自身不新增任何 revision/event。
- 不存在：显式执行原 expire()，然后 requireActive 和原 185000ms 余量检查；期限已到可按正常路径记录 stop，绝不跳过首次 expiry。持有现有正向 public funding gate，通过原 source/clock/intent 认证后构造下一快照；所有 await 完成后、commit 前再次断言 live operation、controller/tracker、owner、epoch、无 active/blocked 会话及 signal。这样队列等待或认证 I/O 中发生的 create/close/cleanup/operation结束不能使旧能力有效。

认证使用当前 snapshot 的只读 `read` facade，不能在队列内重入真实 `controller.read()`。重验原 policy、全部 source 字节/签名、源请求、G/S/U/B/H、task 静态字段、无 registry writer、无运行中 attempt、全 run 无 reserved/unknown/未终结 request。持锁期间不发 provider 请求。首次激活通过的 private queue 不可导出成通用“跳过 expire”入口。

一次 clone/write 同时完成：ledger6、source closure、fresh revision allocation、fresh not_started task、run.taskIds、activation receipt 与事件。旧 source task/allocation/entries、所有其他 allocation/fees、原 clocks、requirementsSource、validationFunding 均保持。`validateLedgerUpdate` 新增仅此 API 可开启的 v1→v6 升级选项；format1 新 profile 及本次升级显式执行 ledger update 校验。snapshot validator 校验全映射；后续 commit 保证 activation receipt 不变。

未提交 intent 在当前条件仍满足且具有新 owner 的有效 live capability 时可重新认证再提交；它本身不能产生 stage-idle authority。已有目标无 receipt、只有 closure、冲突 intent/identity/金额/源账务或重复 closure 均拒绝，不“修补”历史。

## 6. 激活后的权限与来源认证

采用一个窄、可复用的只读 `verifyOrdinaryDesignRevisionBudget(root, snapshot)`：纯 snapshot 结构校验加固定文件实际字节验证。它核对 planning/execution marker、intent、既有原 source receipts/capture/signatures、精确 source requests、事件锚定的 lifecycle started 及 owner 身份；使用传入 snapshot 的只读 facade，避免 controller/资金 gate 循环。已激活原 owner 仍可能合法服务 revision，因此普通读取不强求其已有 closed receipt；只有切换到新 owner 或首次完整资金 settlement 才要求对应完成/恢复来源。它只认证已发生的转移，读取时不要求当前仍在 deadline 内，也不再次释放额度。

- controller open：在任何恢复 unknown/expire 写入前认证；executionAuthority、reserve、admit、相关新 profile task mutation 验证绑定。provider 保留现有 quote/reserve/admit 链，新 actor 从已激活 snapshot 创建。
- source 永久关闭：新 profile 的普通 `requireTaskAuthority` 不再走无 window 的提前返回；reserve、admit、source task save/注册、owned task dispatch 与新 historical import 均不能写 source。旧 source 完全相同记录可作为只读结果返回。结算只能终结已有 open 请求；activation 已要求 source 全终结，不能追加或更改已结算 source entry。
- settlement/accounting：对已存在请求保持事实结算路径及 overrun 停机，不将当前 deadline/预算不足用作拒收真实费用的理由；新 profile 的 provenance 先核验。public funding 的只读认证入口及 `settlePublicValidationFunding` 读取真实 child 时调用同一 verifier，随后沿原 billing/cleanup/完整 run settlement，不把 U 当共享退款。activation 若发生在 cleanup snapshot 之后，原 cleanup 对不变 metadata 的比较仍应拒绝。
- 只读历史：`validateSnapshot` 能验证嵌入 completion/settlement 的 ledger6 快照形状；旧 ledger1–5 与既有历史 source 不要求新字段。新 settlement 保存的真实 child snapshot 自带 activation receipt，原 source SHA256 封存其来源，后续读 shared history 不重开 child、不重验其当前执行权。未认证新 child 不能首次 settle。
- 旧 formal continuation quote/activate 对 ledger6 及已认证的新 funded policy 显式 unsupported，先于旧 raw-allocation 算术和 confirmation 处理；funded 路径沿用原 rejectFundedContinuation 边界，非 funded ledger1 的原 quote/真实确认/activation 继续保持。不顺势实现跨 profile 续窗。

## 7. 恢复及下游

activation 后 crash、revision 尚无 origin：复用既有 `current → prepareDesignOrigins → resumeTaskDag`，只有无 attempt/charge/output 时补空 origin。已有 origin/attempt 仍执行当前原始 journal 恢复规则，不能重发不确定请求。source 已关闭不妨碍 `authenticateDesign` 只读比对；后续 selection 必须同时认证 activation 和 version2 revision plan。

新 profile 的下游 available allocation 统一使用 `budgetCapacity(...).allocatedMicroCny`。必要调用点：`entrypoint-successors.ts:106` 的 repair grant、`:286` 的持久 plan 重算、`repair/policy.ts:83,115` 的审批与 task 创建、`entrypoint-host.ts:1365` 的 allocation。repair-plan 仅新 profile 增加 `ordinaryDesignRevisionBudget` 绑定（activationId、intentSha256、精确 allocationClosuresBefore），恢复时须与已认证 snapshot 完全相同，再对 allocationsBefore 做净额计算。旧 plan 字段缺省/raw sum 保持；不得把当前任意 closure 套到旧 plan。intake/planning 的基础 pool 公式无需改变。

## 8. 验收

全部使用 TEMP/fake provider，可以在临时目录实例化生产 Controller 验证契约；禁止打开或操作实际验证运行的 Controller/run/ledger、真实 provider/model、实际 quote/apply 或旧运行。覆盖下列可观察行为，使用同一输入/费用/上下文的合成重放，不复制私有实际会话为新结果。

| 组 | 必须观察到的结果 |
| --- | --- |
| 守恒 | R25 数值 G=1125000,S=492169,U=632831,B=900000,H=1532831；净两阶段2025000；原费用/clock/其他grants逐字段相同；U=0成功，负U/溢出/B=0拒绝 |
| 冻结/legacy | 正向生产funding认证才选策略，raw flag/缺intent/错误授权/已closed拒绝；非funded ordinary保持ledger1与正式continuation；paid planning前marker已存在；双marker不符/半成品拒绝；旧缺省保持900000；intake和规划已有费用保留；v2–5不变 |
| 认证负例 | approved/invalid review、伪host proof、source bytes/receipt/feedback/capture/plan变化、错误source/attempt、跨run、任意金额、source新请求、目标/closure冲突全部零提交 |
| 生命周期/并发 | 延迟close/create、失败close二次假成功、未完成stage、当前operation已结束但signal活跃、cleanup、伪/跨host/controller/work能力、旧epoch拒绝；不确定close保留owner，same-process reopen不能重置；无锁缺closed/recovery拒绝；确证旧owner退出/干净close可恢复；reserved/unknown/inflight、stop/余量不足拒绝；队列与I/O后重验，无死锁 |
| 原子/恢复 | intent前、intent后/commit前、snapshot rename前后、commit后origin前故障；只能旧完整状态或新完整状态；intent-only需有效新capability重验；已提交exactretry在stop/到期后无需livework且无expire/commit/event；首次过期仍正常stop；half-state拒绝 |
| 权限 | activated source reserve/admit/save/import/dispatch拒绝；target仅唯一已绑定grant；恶意修改receipt在open/admit/settlement拒绝；真实target结算与overrun仍保存 |
| 下游/归档 | revision批准后art/code原base；coding唯一repair可用净余量；repair-plan冷恢复一致；新profile completion/funding synthetic settlement通过，旧历史只读兼容 |
| 上下文/模型 | 新grant仍1/3 reserve；原model/floor/max/session/correction计数保持；完整输入211718B、原usage594308，旧余额305692拒456204，新余额938523可准入同floor；不删除thinking/读材料 |

最后一行仅证明守恒分配下的反事实准入，不能预测真实作者花费或证明纠错成功、语义通过、游戏完成。首次新策略真实运行须另行满足原预算/实际准入流程；本卡不重开 R25。

## 9. v2 独立设计复审记录

design_revision_budget_reviewer已针对funded-only eligibility与非funded正式续窗、具体owner retention/起止回执/live operation/epoch能力、no-expire exact retry、public settlement首次认证/只读历史和repair-plan closure basis给出DESIGN_APPROVED。Root已批准v2实施与ADR设计决定；实现后仍需独立actualdiff SOURCE审查，当前SOURCE pending。
