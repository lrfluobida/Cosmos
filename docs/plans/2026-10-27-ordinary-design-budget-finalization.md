# Ordinary Design Budget Finalization Implementation Plan

状态：独立 `reuse2_recovery_plan_reviewer` APPROVED_PLAN、无remaining，Root已批准固定工程设计、免费源码实施及登记；本卡已最终独审并集成，仅source-scoped完成。下文待审/未授权源码字样属于批准前原文，当前状态以本段为准；未授权真实模型、结算或旧run恢复。

任务：[COS-136 / #137](https://github.com/lrfluobida/Cosmos/issues/137)，原生父COS18/#19、父[x]。实现者 `author_budget_recovery_implementer`，独立源码reviewer `author_budget_recovery_reviewer`，计划reviewer `reuse2_recovery_plan_reviewer`，唯一merger `public_agent_batch_merger`。

- 批准规格输入 SHA256：`39f13d74d89cc5e2789f7714f16307b96f6ac28cf95a563b7407ec8b5ec00150`
- 批准计划输入 SHA256：`c52c6679543d68f3aeccc9cbd1dd3f76dae4ff404a131b647b3d8760abe43bcd`

工程基线：`50f4633b1e682ccadf4844bf8414994a866813a5`。[配套规格](../specs/cos136-ordinary-design-budget-finalization.md)。两卡并行且不互阻；两卡源码和必要组合已通过，实际运行仍由Root另行安排。reuse-2已由Root原API完成会计结案，child112和旧receipt保持、永久不恢复；本卡merger/implementer不操作真实controller/ledger/coordinator。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans after this design is independently reviewed and Root approves implementation. One dedicated implementer, one independent reviewer and the batch's unique merger remain required.

**Goal:** 在新普通设计作者的可信发送前资源拒绝后，用原唯一只读机会获取真实模型交接，保留原预算、32请求、截止与独审；同时给既有存档检查点错误提供字段级反馈。

**Architecture:** 一个可选 execution/origin 版本字段固定范围；Pi 私有记录限定 unsent 资源拒绝；requestAuthorProposal 复用现有 write-once correction 槽和 readonly4096。最终回复仍通过现有严格 parser、capture、host 验证与独审。原策略、冷恢复和真实失败均不能补授请求。

**Tech Stack:** TypeScript、Node22.22.2、Pi0.99.2、node:test；真实factory/Pi/SDK与scoped tools，合成 transport、独占 TEMP、模型网络0。

状态：固定草案 v1，待独立评审；配套[正式规格](../specs/cos136-ordinary-design-budget-finalization.md)。本文只规划实施，当前不写源码、运行测试或操作真实run。诊断基线main `50f4633b1e682ccadf4844bf8414994a866813a5`。Root并行管理的delivery/funding生命周期修复独立于本卡。

源码结果：COS136 / #137已源码范围完成；[精确批准](https://github.com/lrfluobida/Cosmos/issues/137#issuecomment-6431623562)、[完成关闭](https://github.com/lrfluobida/Cosmos/issues/137#issuecomment-6431628170)及父[x]已GET核证。独立author_budget_recovery_reviewer批准 `6e7228e17c26dd27ff49872dba1f0f19d5091f86`，无剩余P1/P2；无冲突合入发布 `aa50ecd1a18fc88fed5a27e8966cdcdddde34a38`，14候选独有文件精确一致，COS135四独有文件及entrypoint证明选择改动完整保留。

main typecheck/build exit0，最小组合5/5、0skip、TAP46061.5526ms：native无工具收尾、实际host/capture/独审、codingrepair祖先认证、支持的continue无新window收尾权限，以及COS135初轮失败proof。新ordinary design可信未发送预算拒绝只复用原同session/单次correction槽；预算/独审保留/32计数、严格proposal与完整验收保持，checkpoint只补字段反馈。

F3原完整历史TEMP证据复用：95134 bytes、4096 cap、223036µ≤231989µ、余8953µ；最高合成结算后余383953µ≥375000µ独审保留。最终prompt/provider/factory/原生编码路径未变，COS135组合只影响执行后的证明/资金reader。原native/affected、Edge10/v2交付、媒体171步/四故障按有效范围复用，未新跑浏览器或大矩阵，不把小输入代表混为F3测量。 仅SOURCE范围完成，真实模型生成和人工体验仍未验证；本批未操作真实funding/controller/ledger或启动付费。总136/root100/父30个源码子项完成，父COS18整体仍open/partial；后续实际运行由Root另行安排。

## 文件职责与边界

| 文件 | 必要变化 |
| --- | --- |
| `src/runtime/entrypoint.ts` | 新execution字段选择/恢复核对；只把已保存策略传入目标design路径。 |
| `src/runtime/entrypoint-host.ts` | 新ordinary host范围与factory接线；原分配和预算policy保持。 |
| `src/runtime/entrypoint-design-revision.ts` | OrdinaryExecution类型及同一条件的design origin构造/认证；已有execution hash绑定复用。 |
| `src/runtime/orchestrator.ts` | DagOptions窄策略、仅目标design的origin镜像、request/recoverAuthorProposal选项；不移动capture/验收顺序。 |
| `src/runtime/recovery/task-journal.ts` | RecoveryOrigin可选字段类型；精确比较与stage文件名保持。 |
| `src/roles/factory.ts` | 只对可信普通design创建窄finalization接口/选项；既有readonly4096和原budget hooks复用。 |
| `src/providers/pi.ts` | 可信普通output-limit拒绝的会话私有记录；原错误保留、同session一次只读入口及原计数。 |
| `src/runtime/repair/author-protocol.ts` | budget_finalization与format共用started/response；真实提示、严格解析和无付费恢复。 |
| `src/roles/requirements.ts` | checkpoint字段级固定诊断；不放宽验证。 |
| 新 `tests/providers/ordinary-design-budget-finalization.fixture.mjs`、`.test.mjs` | 真factory/Pi/SDK预算边界、同会话、无工具、请求计数、有限失败与最终字节报价。 |
| 新 `tests/runtime/ordinary-design-budget-finalization.test.ts` | public policy/origin、真实handoff→capture→host→review与冷恢复。 |
| 既有 `tests/roles/author-protocol.test.ts`、`tests/runtime/ordinary-design-request-capacity.test.ts` | 仅在新kind/字段需要时增加最小受影响断言。 |

checkpoint测试优先放在已有scenario/design-check测试文件；用 `rg -n 'Invalid visible save checkpoint|checkpoint' tests` 精确选取并在实施前报告文件名，不为错误字符串新建测试框架。`author-output-budget.ts`、`provider-budget.ts`、ledger本卡不改变算法；若真实源码证明需要修改，先提交具体反例修订范围。无新依赖、无用户开关、无全仓重构、无生成游戏编辑。

## Task 1：固定输入与免费RED

- [ ] 在Root指定的独立managed worktree确认基线、未提交改动与AGENTS；逐个严格解码待编辑文件UTF8，记录行尾；写前说明最终文件集合。不要更改编码或无关中文。
- [ ] 阅读规格F1–F8及现有 `author-budget-recovery.test.mjs`、`ordinary-design-compaction.fixture.mjs`、`public-author-protocol.test.ts` 的真实native seam，复用transport/临时目录清理方式，测试不能依赖DEEPSEEK_API_KEY或真实provider。
- [ ] 建立合成普通design run，grant1125000µ、settled518011µ、reserved/unknown0、review reserve375000µ，原deadline与32计数固定；所有账务仅存在独占TEMP fixture。合成账务标注用途，不冒充实际bill。
- [ ] 通过真实factory、Pi与SDK产生成功tool boundary后普通floor拒绝；不能直接让mock role.prompt抛同名字错误代替触发。保留原生error、inputBytes、provider派发数和counter。
- [ ] RED断言：现代码在8192普通floor不足时无法产生同session4096只读交接；另一个旧policy样本继续原失败，为兼容基线。
- [ ] 首先运行 `node --experimental-strip-types --test tests/providers/ordinary-design-budget-finalization.test.mjs`，保存失败用例名、原因与退出码；不能把全测试尚未存在造成的失败作为行为RED。

## Task 2：固定新策略及原scope

- [ ] 在existing execution/host接口添加可选 `ordinaryDesignFinalizationPolicy:'budget-followup/1'`。新ordinary且原review-reserve/1和authorProtocolCorrections1存在才选择；resume严格读取原字段，省略保持省略。unknown/null/incompatible拒绝。
- [ ] 原budget分配、32、普通8192..32768、summary8192、review reserve公式均不变。不给模型packet增加可修改预算或新控制字段。
- [ ] Dag与factory只为新普通design及由现COS134认证的design revision启用。art/code/reviewer/planning/fixed validation/preparation/modular/追加continuation不给入口；不通过taskId前缀推断授权。
- [ ] `RecoveryOrigin`仅对获准design写相同可选字段。同步修改 `entrypoint-design-revision.ts` 的origin构造，避免新design已通过后COS134认证误判；旧无字段bytes形态保持。
- [ ] 配置/真实factory负例覆盖旧省略、新合法、unknown、role错配、budgetpolicy缺失、execution与origin单边增删；每个负例在相关provider派发前停止。新execution允许的design revision继承原运行策略，但不增加revision次数或额度。
- [ ] 保留authorProtocolCorrections引出的scheduler独占；新字段不建立另一套锁或调度类型。

## Task 3：Pi只接住精确unsent拒绝

- [ ] 在 `requestOutputLimit` 的catch处识别：新可信scope、ordinary、非compaction/readonly、原floor8192、资源码属于allowlist、尚未调用budget.beforeRequest。记录本session内精确异常对象及request元数据。
- [ ] 使用单个私有pending记录使普通prompt结束并向host暴露原资源错误；普通prompt/compact不能继续。不要清空一般failure或把任意同code异常变成可恢复。任何取消、provider、账务或后续新错误仍终止。
- [ ] 给factory返回的RoleSession增加窄的资格检查与同会话readonly调用能力，参数必须绑定Pi保存的精确错误对象；实现在现readonlyPrompt内部复用工具禁用和4096，不创建新session/modelruntime。接口应让author-protocol在写started前验证该错误来自当前session；不能只暴露可伪造的布尔或字符串标记。
- [ ] 原拒绝已消耗的request counter不回退；资格检查确认原计数仍留1槽。真实readonly dispatch继续原countRequest，且自身最多一个provider请求。
- [ ] 进入readonly时所有active/callable tools为空，实际payload无tools；禁止自动compaction。保留原native error消息，不裁剪旧事实或替换历史。
- [ ] 最终提示完成归一化后使用现output-budget选择4096并走真实reserve/admit/settle；同一输入检查保持。4096不可付、time/authority/余额竞态改变时，原停止仍成立，不能尝试更低cap或新summary。
- [ ] GREEN有限native边界：30已发送+1未发送拒绝+1收尾为原32；31已发送+1拒绝后0收尾；摘要占位保留；同code伪造错误、summary拒绝、beforeRequest竞态拒绝、已发送length/error/unknown、cancel、deadline、closed均0新增transport。

## Task 4：共享一次回执与真实proposal

- [ ] `requestAuthorProposal()`只在原prompt抛上述精确可收尾拒绝时进入新分支；先验证原task/attempt/author/context、active authority、deadline清理时间、unknown/reserved0和write-once槽未使用。既有正常返回/format/coding_scope分支保留。
- [ ] 新 `AuthorBudgetFinalizationStarted` 与旧记录组成判别union；使用同一 `author-correction-started`，kind budget_finalization、used1、原身份及输入/工作区signature。记录窄unsent原因与原native错误引用，不写假的originalReply或parseFailure。旧format/coding_scope原字段与字节形态不改。
- [ ] started先于readonly派发；如果partial/start后报价失败或中断，机会已经消耗，不能删除receipt再试。新response保存真实全文及原签名/hash，kind匹配；实际权限与前后bytes再次验证。
- [ ] 使用spec的固定短提示，说明结构不代表语义完成、原pending host步骤仍pending、真实未完成和不确定必须保留。不得提供可复制的空数组完成例子或生成游戏的语义补丁。
- [ ] 收尾最多一次直接严格parse：合法空数组沿既有capture/host/review；remaining/uncertainty或拒绝保留；无效JSON/prose/toolCall/length/error终止，不回落format分支。format自己的资源失败也不能进budget分支。
- [ ] 冷恢复只允许新policy+匹配origin+完整started/response+原始unsent记录+严格proposal+前后签名；完整时复用已有回复，缺失/partial/漂移时RecoveryBlocked。恢复不能重建Pi pending或发送模型。
- [ ] 回执测试：format→budget、budget→format均最多一个started；重复/跨session/跨attempt调用拒绝；missing response、错kind、改workspace、失去native错误引用均0provider。非空remaining/uncertainty不能被清空或进入下游。

## Task 5：最终真实native容量与handoff链

- [ ] 将最终prompt、最终factory系统包、旧native错误条目、禁用工具后的SDK状态全部纳入测量。记录实际B、4096 cap、`B*2+32768`最高报价、原231989µ可用余额和差额；报价与真正fake transport收到的context bytes必须完全一致。
- [ ] 私有精确证据只在独占TEMP：只读原会话后复制到TEMP，绝不开原RunController/SnapshotStore；用已知首请求19372B及最后已发送87505B校准pinned projection。保留原L52上下文/原24笔已发送与原未发送计数语义，再通过最终代码和真实factory/Pi/SDK进行收尾。使用合成active authority和fake transport，不以原run的当前停止状态伪装恢复授权。
- [ ] 原历史内容不进入Git或公开日志；报告只保存必要bytes、计数、quote、费用及脱敏来源。本私有探针与提交的合成同形回归分开标注，合成回归不声称等于原会话。
- [ ] 硬断言最终4096报价<=231989µ；若不成立，记录精确差额并回到spec做最小技术修订供独审，不调大grant、不动reserve、不降4096以下、不减少确认内容，也不以更短历史替换真实容量证据。
- [ ] 费用上界样本用实际最高报价在TEMP结算，保证独审375000µ保留完整；失败/unknown样本仍阻断。假transport的短回复不能掩盖最高费用路径。
- [ ] 真实factory/Pi author返回严格proposal后，走现有design capture和真实host校验，再创建不同actor/context的reviewer。approved样本证明接线可达；changes_requested样本证明语义失败仍拒绝，art/code派发0。不把受控模型答案当作真实模型质量证明。
- [ ] 显式覆盖advisory passed但原生收尾保留真实未完成项，及advisory未通过却被模型声称完成时host校验拒绝。selfcheck工具不可在readonly阶段执行，不能伪造通过记录。
- [ ] 运行 `node --experimental-strip-types --test tests/runtime/ordinary-design-budget-finalization.test.ts`。新增tests内部命名应以spec F编号和行为描述对应，避免难以判断覆盖范围。

## Task 6：checkpoint字段反馈

- [ ] 在已有测试中加入本例RED：snapshot与savedSnapshot selector相同却只得泛化错误；多余checkpointAssertionIds无法定位。保留原valid样本和不合法判定。
- [ ] 拆开当前合并判断，按原顺序返回有限字段路径：checkpoint缺失/多余字段、expected、snapshot.kind/selector、savedSnapshot.kind/selector、相同selector。复用原text长度和字段规则，不新增可接受输入。
- [ ] GREEN断言具体path/规则；增加单个每阶段点击后断言代表，保证现有Missing checkpoint规则仍拒绝并提供stage。不得替作者选择selector或增加额外正常输入。
- [ ] 上述错误沿现有write feedback及validate-game-design传播，不能修改其他设计schema或引入新的运行阶段。

## 验证、审查和集成

- [ ] 先完成两个新target测试的RED/GREEN。再仅运行确实受类型/恢复行为影响的既有author-protocol、public-author-protocol、author-budget-recovery代表；复用未改变的summary/ledger/SDK错误矩阵。
- [ ] 源码完成后运行一次 `npm run typecheck` 和 `npm run build`。不要全仓测试、完整浏览器或付费模型。若组合代码改变最终prompt/factory元数据，F3必须重跑；内容未变则复用已审证据。
- [ ] 重开所有编辑文本确认UTF8和中文正常；`git diff --check`、实际diff与批准scope一致。保存最终实际native B/quote、shared-slot次数、原32计数、费用结算、拒绝样本及已知限制。
- [ ] implementer报告精确commit SHA和证据；独立reviewer先规格后实际diff，不用作者摘要替代审查；finding在作者branch修复并只重查affected。
- [ ] 唯一merger合入已批准SHA，与独立生命周期修复仅做必要组合检查。公开发布与任务卡由Root安排；当前两个私有草案不提交main、不改真实reuse-2、不进行恢复/结算/模型请求。

本计划成功只说明一次受限真实模型请求和后续验收链能够在原约束内运行。它不保证模型产出语义完整的设计，也不保证一次收尾或独审一定通过。
