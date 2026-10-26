# 普通设计未选定分支的完成记录与历史初轮失败会计收尾

状态：独立 `reuse2_recovery_plan_reviewer` APPROVED_PLAN、无remaining，Root已批准固定工程设计、免费源码实施及登记；本卡已最终独审并集成，仅source-scoped完成。下文待审/未授权源码字样属于批准前原文，当前状态以本段为准；未授权真实模型、结算或旧run恢复。

任务：[COS-135 / #136](https://github.com/lrfluobida/Cosmos/issues/136)，原生父COS18/#19、父[x]。实现者 `ordinary_design_revision_implementer`，独立源码reviewer `reuse2_recovery_plan_reviewer`，计划reviewer `reuse2_recovery_plan_reviewer`，唯一merger `public_agent_batch_merger`。

- 批准规格输入 SHA256：`d1e5b9504de3c383f49d73d1ca998013ba0f13cd7f0cfae75a73747b7116360d`
- 批准计划输入 SHA256：`1c18d37f6c46597200d9158951751ea32298fa157c72a5022d53bfe89b87f85c`

工程基线：`50f4633b1e682ccadf4844bf8414994a866813a5`。[配套计划](../plans/2026-10-27-ordinary-incomplete-funding-recovery.md)。两卡并行且不互阻；本卡生命周期源码已优先发布，真实会计仍由Root原API收尾，新付费须两卡与必要组合通过。reuse-2 child112永久stop、原5Mµ仍held，未settle/释放，旧receipt保持；本卡merger/implementer不操作真实controller/ledger/coordinator。

状态：私有设计草案，待独立审查。Root 已接受 A+B 的有界修复方向；本稿不授权源码实施、实际结算或任何模型调用。

源码结果：COS135 / #136已源码范围完成；[精确批准](https://github.com/lrfluobida/Cosmos/issues/136#issuecomment-6430077591)、[完成关闭](https://github.com/lrfluobida/Cosmos/issues/136#issuecomment-6430084943)及父[x]已GET核证。独立reuse2_recovery_plan_reviewer批准 `0946205af133b13db3e42b05ce309c378aa1a857`，无P1/P2；5来源文件精确合入发布 `e231434d2a41ba78e36643f1d0fb1db6aa3552c5`。

main typecheck/build exit0；初轮失败证明、修订失败证明、真实签名历史资金收尾正例及原失败清理拒绝4/4、0skip、TAP13195.8368ms。原A2/2与B34项范围有效证据复用（原33/34后候选夹具查找修正、定向1/1，不累加重叠）。附加strict测试仍有6个与50f精确基线一致的旧nullable诊断，无新诊断；未记为strict全通过。 此为SOURCE/TEMP生命周期与会计边界验证；真实reuse-2仍永久stop、游戏incomplete/timing unconfirmed，原5Mµ hold尚未由本次发布释放，原failed closed-binding回执与费用保持。真实收尾仅由Root随后沿原API办理。COS136/#137仍open/source-pending，新付费仍等两卡及必要组合；总136/root100/父30中29源码完成，父COS18仍open/partial。

## 1. 目标与范围

修复 COS134 延迟注册下游后，未选定普通设计分支（包括初轮和修订失败）的任务证明仍包含未注册美术/编码草稿的问题；为已经留下真实签名清理回执的本次初轮失败形状提供严格受限的会计核验。Cosmos 仍是通用游戏开发 agent，本项不修改生成游戏或设计内容。

- A：未来 `independent-review/1` 的所有未选定分支，报告只绑定真实注册的有效任务，继续如实显示尚未执行的美术/编码差距。
- B：历史资金收尾仍仅接受本次 `initial_design_incomplete` 初轮失败形状及下述完整证据条件；原报告、签名、nonce、快照、逐请求费用回执及 `unconfirmed` 计时全部保留。
- 不增加通用恢复框架、恢复 CLI、可绕过的参数、人工签名替代物、任务注册补丁或全局宽松校验。
- 当前真实 run 永久停止；SOURCE 测试只能使用临时目录、合成 provider/browser 和合成费用。不得打开真实 run/shared ledger 的控制器、store 或锁。

冻结主线：`50f4633b1e682ccadf4844bf8414994a866813a5`；对应三卡源码合并：`06709f34e11512f62fc83d2b1ef4591f9c467f32`。

## 2. 已核实的故障链

只读对象：`.cosmos/public-validation/room-20261027-reuse-2/run`，报告 `delivery/report-cee2e64a-a53e-427d-8292-e221ce51ede2.json`。

1. `entrypoint-design-revision.ts:208-269` 先运行 design-only，`initial_design_incomplete` 时返回未选定的分支；`effective` 仍是计划中的三个任务。
2. `entrypoint.ts:258-260` 在存在 designBranch 时允许任务不存在，并用 `item.task` 回填。`:273` 将三个对象都交给 `deliveryTaskProofs`。
3. 原签名 `fundingSnapshot` revision 111 只有失败的 `game-design`。报告与 binding 则含 `game-design`、`game-art`、`game-code` 三项证明。
4. `closeForCompletion` 完成真实 owned-work/accounting drain 和所有者关闭，事件 110 为 `run_owner_drained`。warnings/control/owner-drain 三项均 `closed`。
5. `completion-timing.ts:57` 的最后一个比较首次失败：从原快照重建的数组是 `[designProof, null, null]`，binding 中后两项却是草稿证明对象。
6. `finishCompletion` 保存了真实签名的 `closed-binding: failed` 回执，计时 `unconfirmed`、`eligible: false`。发布后的再次 `stable` 比对返回同一错误。
7. `readFundingCleanup:179` 拒绝任何非 closed 行，所以现有 `settlePublicValidationFunding` 无法收尾。`readCompletedGeneration:169` 因 `automaticAcceptance: not_passed` 返回 null，不能用已完成恢复路径修复。

逐项只读结果：marker 引用、marker/report SHA、candidate（null）、report proofs 与 binding、原 receipt SHA 与 Ed25519 签名、fundingSnapshot SHA 均通过；只有原 snapshot task proofs 比对失败。Root 随后只通过原 API 永久 stop；当前 revision 112 相对原 snapshot 仅追加一条 `stopped`，账项未变。直接只读调用 `readFundingCleanup` 仍返回 `Funding cleanup remains failed or unconfirmed.`。

当前费用观察值：25 笔、540200µ，reserved/unknown 为 0；共享拨款保持 5000000µ 占额。若后续全部会计核验通过，原 API 应导入实际 540200µ、释放 4459800µ。这些数值只用于本次结果对照，不得硬编码为校验豁免或费用来源。

## 3. A：未来报告的任务证明

修改范围限定 `src/runtime/entrypoint.ts` 的 `designBranch && !designBranch.selection` 全部未选定普通设计分支，包括 `initial_design_incomplete`、`revision_incomplete`、`design_revision_limit` 等失败。

- 任务计划继续用于确定缺失阶段、原要求、gaps 与 blocked；不提前注册 art/code，不创建它们的 attempt、origin、grant 或 capture。
- 发布的 `effectiveTasks` 必须取计划中当前有效任务与同一次报告真实 snapshot 的交集。初轮设计失败时，只包含已经注册的原 design；修订任务已经注册后失败时，只绑定真实的有效修订任务证明。尚未注册的有效任务不产生证明，不得补造。
- 保持 `ordinaryDesignReview.selectedVersion: null`、原失败原因与完整未完成范围；保留现有 `revisionAttempted` 计算，初轮失败为 false，已经进入修订的失败为 true，不将 false 固定到所有未选定分支。`sourceTaskId` 仍指向原 design，`taskHistory` 保留全部真实历史；修订失败代表应保留原 design 与修订 design 两条历史。
- 未发生本缺口的普通成功、设计修订成功、legacy undefined、modular 和固定 validation 路径保持原契约；原来应拒绝的缺失真实任务仍应拒绝。不得对所有路径无条件过滤缺任务。
- 不放松 `stable`、`loadExperienceBinding` 或成功判据。未来清理可被真实确认为 `in_time`，但设计失败的 `outcome` 仍是 incomplete、automaticAcceptance 仍是 not_passed、无候选、无最终体验批准。计时合格本身不代表游戏成功。

## 4. B：历史会计专用的受限识别

修改范围限定 `src/runtime/completion-timing.ts` 的 `readFundingCleanup`；正常全 closed 分支保持既有行为。识别函数保持模块内部，不增加公共恢复协议。

所有既有 signature、snapshot、funding identity、唯一 receipt、owner anchor、nonce、report hash、时序、当前快照稳定性检查先完整通过。在此基础上，只有同时满足下列条件才能把原回执作为会计资源已关闭的证据：

1. 原运行是初始 ordinary generation，无 continuation；报告 capability 为 `ordinary-design-execution/1`，outcome 为 incomplete，automaticAcceptance 为 not_passed，acceptedCandidate/delivery 均不存在。报告与绑定 candidate 均为 null。
2. 原签名报告记录 `independent_model_review`、原 design sourceTaskId、`revisionAttempted: false`、`selectedVersion: null`，唯一阶段阻断是原 `initial_design_incomplete`。原任务仅有该 design，状态 failed、一次失败作者 attempt、无捕获产物与独审批准，review 为原 pending 形状。
3. 原 execution/native plan/需求确认按既有只读校验核对 ordinary 三角色与 `independent-review/1`；不存在 design revision plan/selection。辅助源只能进一步收紧识别，不能代替签名报告或 snapshot 的权限。不得从路径名称猜测角色或硬编码实际 task/run ID。
4. report/binding taskProofs 严格相等、共三个不重复 ID，分别对应原计划的 design/art/coding。design 证明与原 snapshot 完全一致。恰好 art/coding 缺于原和当前 snapshot；其报告证明严格等于原计划的初始 pending 证明：attemptId=null、artifacts=[]、review 无 reviewer/context/inputVersions/evidenceIds。除此之外没有任何已存在任务证明差异。
5. art/coding 在原及当前 allocations/run.taskIds/ledger/requests 中没有执行注册或费用事实，也没有 journal、capture、selection 或 revision 派发事实。不得把已注册、已调用或缺回执的下游当作此类缺任务。
6. cleanup 精确包含 binding.resources 每项一次且全部 closed，owner-drain 恰一次且 closed；唯一失败项恰为 `closed-binding`，错误为 `Completion report, candidate or task proofs changed.`。拒绝重复项、未知额外项、report-binding 失败、fallback 清理、资源失败或 owner 失败。不能仅凭错误字符串或一条 closed owner 记录放行。
7. 原 receipt 的 current/original 均 unconfirmed，endedAt/elapsedMs 为 null，eligible=false；observedAt 和 cleanupStarted 仍满足既有真实关闭时序。返回值保留完整原 cleanup 数组，包括失败项，不得重写成全部 closed。
8. 此例外还要求当前 run 已有永久 manual stop。相对签名 snapshot 只能追加这一停止事实；任务、完整 ledger/requests、费用、所有旧事件、要求、funding binding 和其余运行身份逐值相同。当前修复不通过此分支接受新的结算/unknown/cancel/recovery/owner-drain/执行事件，正常旧分支不因此改变。
9. 原报告、marker、candidate、真实任务、anchor、nonce、签名、snapshot 或任何账项不一致，都拒绝。当前 owner/registry 互斥仍由原 settlement API 持有；API 获取不到锁时不得另建绕过路径。

`readFundingCleanup` 可以确认的是这张原签名回执中的实际资源关闭事实。它不能给游戏时限打分、改变原失败结论或制造第二个完成终点。`readCompletionTiming` 与 `readCompletedGeneration` 的行为保持不变；旧 timing 在真实会计操作前后仍不能成为成功依据。

## 5. 原会计 API 与执行边界

当前不执行结算、不解除 hold、不重开 CLI。独立 implementer 提交精确 SHA，独立 reviewer 先审规格再审实际 diff；唯一 merger 合入获批 SHA 并做必要组合检查。仅在 Root 核实已审源码已发布后，由 Root 通过既有 `settlePublicValidationFunding({ sharedRoot, runRoot, fundingId })` 实际调用一次。

原 API 必须继续核对原 funding 授权、全部账项已 settled/cancelled、每笔 billing receipt 的真实源和费用、共享 ledger 原来源、请求身份冲突、总额/overrun、当前快照一致性及原子发布。不得直接写 ledger、allocationClosures 或 settlement.json。若任何实际核验失败，保留整个占额和原证据。

真实成功只声明会计已关闭及原 API 返回的实际费用/释放额；游戏生成失败、计时未确认、无候选/独审/人工体验结论保持原事实。

## 6. SOURCE 验收

### 必须先 RED

- A：`ordinaryHostFixture({ revisionPolicy: true })` 让首个 design 作者失败或输出无合法 handoff，经过真实 executeGeneration→publishGenerationReport→finishCompletion。断言原 snapshot 只有 design，effectiveTasks 与其真实证明一致、下游 gap 仍在、下游零派发，全部真实清理 closed。基线应因报告带三个证明而失败。
- A 修订失败代表：扩展现有 `revision rejection stops without a third author or downstream`，断言 effectiveTasks 只含真实有效修订任务证明，`revisionAttempted: true`、`selectedVersion: null`、sourceTaskId 仍为原 design、taskHistory 保留两条真实设计历史；下游 gap/零派发与真实清理 closed 均保持。该新增证明断言在基线应因多出未注册 art/coding proof 而 RED，无需新增另一套修订矩阵。
- B：全临时 funded ordinary fixture 通过原 planner、design-only executor、report publisher 和 finishCompletion 生成本缺口形状的真实签名回执；在测试中构造原错误的三项 report proofs，不能伪造签名或改签名后的文件。通过原 API stop/close。断言旧代码 `readFundingCleanup` 拒绝，而修复后原 settlement API 导入合成费用、释放合成余额。签名回执、报告、completion 时间值和子运行任务字节不变；费用来源仍由原逐请求 reconciliation 证明。
- 对 B 的独立副本逐个改变一项：已注册 design proof；缺失下游的 attempt/artifact/review；report/marker/candidate；签名/nonce/anchor；重复或未知 cleanup；warnings/control/preparation/owner/fallback 失败；新增执行；ledger/请求/费用变化；停止缺失；revision/selection 存在。均应拒绝且不产生共享 settlement 或释放额。

### 保留代表性既有保护

- 原 `formal failed cleanup keeps its grant after stop and owner release` 必须继续拒绝。
- 原 `formal stop and released owner are insufficient without the original completion cleanup proof` 必须继续拒绝。
- 原 `an unreported formal failure reuses its signed closed cleanup without claiming a game timing pass` 保持通过。
- 普通成功与一次设计修订成功各选现有一个代表，完整稳定证据复用，不重跑模型/真实浏览器/历史 run 或全仓测试。

源码通过只证明生命周期和会计边界，不证明真实模型完成游戏。
