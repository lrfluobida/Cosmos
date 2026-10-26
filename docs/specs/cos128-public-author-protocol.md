# COS-128 · 普通公开生成的单次作者格式纠正

状态：PUBLIC_AUTHOR_PROTOCOL_CORRECTION_SOURCE_READY；已完成独立源码审查与主线集成，仅source-scoped完成，不授权真实运行。

源码结果：独立cos128_reviewer批准 `4319f10ecb501eb5ce6c6455cfce87c3b02d88cb`，APPROVED_SOURCE_SCOPED、无剩余finding；唯一merger合入发布 `93b1b0f8e9da14a804542d3f6f4380baed54e12f`，11文件精确一致，主线typecheck/build与4/4短代表通过。[批准](https://github.com/lrfluobida/Cosmos/issues/129#issuecomment-6415474509)、[完成关闭](https://github.com/lrfluobida/Cosmos/issues/129#issuecomment-6415484176)已核证。仅达到 `PUBLIC_AUTHOR_PROTOCOL_CORRECTION_SOURCE_READY`，父COS18仍open/partial；room12永久关闭，不代表实际游戏成功。

审批记录：[COS128 / #129](https://github.com/lrfluobida/Cosmos/issues/129)；独立 `design_review_budget_plan_reviewer` 最终给出 `APPROVED_PLAN`、无findings，唯一P2测试harness问题已闭合，Root批准固定输入的正式发布与免费源码实施。实现者cos128_implementer，独立源码reviewer cos128_reviewer，唯一merger public_agent_batch_merger；源码完成结果见上述状态记录。

- 批准规格输入 SHA256：`ccf3e4a851a4648c8bece394fc9639e2d6b4e41e32fed534690770ff4e865177`
- 批准计划输入 SHA256：`a7998d98f2d711278c9297f9f0235a69ec31f06d7bba6adea71433387c3058f2`

登记/实施基线：`5700451d5c6140b02cbaae4e7fd9fc6a7f289db3`；下文诊断基线和原运行证据保持原文。

配套[实施计划](../plans/2026-10-26-public-author-protocol.md)。

设计作者：author_feedback_assessment。基线 main：31ca74725c55997eb66f2074d8c2b1a663f000ee；runtime：d088df021825f1813e5d8fe9f1c775f011144321。两者的 src/tests 无差异。Root 已授权免费源码开发准备，实施仍按专属 implementer、独立 reviewer、唯一 merger 流程。

## 1. 问题与范围

room12 的 design 作者最终回复以 “Self-check passes with both deliverables in place.” 开头，再给出裸 JSON。整段回复不满足严格模型 JSON 协议；只在诊断内存中移除已知前缀后，JSON 的 summary、remaining、uncertainty 均合法，后两项为空。两次设计文件自检通过，没有建立 author handoff、capture 或独立 review。

直接链路：roles/protocol.ts:2 全文解析拒绝前导 prose；orchestrator.ts:380 将缺省作者纠正数设为 0；repair/author-protocol.ts:74 因未启用纠正而抛 invalid_proposal。公开 entrypoint.ts:124 只启用了 review 纠正。已有作者纠正实现可复用，但 orchestrator.ts:125 当前禁止它与 scheduling 同用。

原作者有 16 笔已结算请求，grant 675000µ、已用 247244µ、余额 427756µ，reserved/unknown 为 0。32 次上限尚有名义余量；本诊断没有给纠正请求报价。一次 native compaction 的 systemMessage 仍保留 handoff schema，因此没有提示丢失的证据。不能声称纠正一定获准或一定使设计通过。

room12 已由 Root 结案并独立 PASS_CLOSED：child104/shared3360；20 笔合计 360363µ，释放 4639637µ；committed21635063、unallocated53177362，held/exposure/pending/locks 为 0。原回复、账单、失败和费用保持。COS127 的真实 review 未进入，不以 room12 判断它的运行成功或失败。

本卡只让未来新 ordinary public generation 在原作者会话中使用已有一次只读格式纠正。它是通用交接能力，不是 room12 的恢复或游戏内容修补。

## 2. 方案选择

采用：在现有 execution/origin 载体记录显式策略，接通现有 requestAuthorProposal 单槽纠正，并使 scheduler 显式串行。

未选方案：

- 删除 scheduling 后启用纠正：虽可进入旧串行 API，但会去掉公开入口已有的截止前清理、限时 drain 和状态记录。
- 从前导 prose 中提取 JSON、放宽 schema 或增加独立重试服务：改变信任边界或重复已有机制，超出本卡。

不新增策略文件、planning-started 镜像字段、run 格式版本、CLI 开关、预算、模型调用上限或补发通路。当前缺失 origin 的 resume 已在 TaskJournal.open 中拒绝，没有证据需要额外镜像载体。

## 3. 行为契约

### 3.1 只由可信公开入口选择

- 新 executeGeneration 在可信 host.capability 精确为 ordinary-design-execution/1 时，将可选 authorProtocolCorrections: 1 写入现有 execution.json；它不来自模型、任务名称、用户 JSON 或 CLI 参数。
- 新普通 DAG 的全部作者复用该原有策略；planning、review 及 coding-scope clarification 不改变。
- 执行记录的该字段只接受省略或数字 1。省略表示旧行为，传入 DAG 时仍省略，不补写显式 0；null、字符串、布尔、0 或其他数字拒绝。非 ordinary capability 携带 1 拒绝。
- 低层既有 DagOptions 的 0/1 接口和 validation 独立选择保持；本卡不重新解释它们。
- resume 只读取原 execution 策略，不根据当前 capability 自动启用。旧 execution、origin、repair-plan、continuation-plan 的省略字节形态保持。

### 3.2 同一会话、同一 attempt、一个槽位

继续调用现有 requestAuthorProposal。首答合法则立即沿正常捕获/验收/独立评审流程推进，额外格式请求为 0。首答无效且策略为 1 时，使用原 author.readonlyPrompt 最多请求一次，只重新表述作者已有事实。

原实现的 author-correction-started/response、actor/context/attempt 身份、原回复、输入和工作区签名继续生效；开始回执先于派发，已消耗槽位不恢复。所有工具禁用，原 grant、实际报价、输出 cap、会话请求上限、截止和 unknown/reserved 守卫保持。纠正仍不合法、无预算、到期、取消或 readonly 不可用，保留现有失败；不转成第二次纠正或语义修复。

严格 decodeModelJson 和三字段 schema 不改。合法但含真实 remaining/uncertainty 的回复不被格式纠正清空。自检或格式纠正成功不等于 host 验收、独立批准或游戏成功。

### 3.3 保留 scheduler，并显式独占

新增 author_protocol_correction 作为已有 scheduler exclusiveReason 的一个值。选择顺序为 recovery、author correction、review correction；只要作者策略为 1，整个 task 仍以 effectiveParallel=1 执行，即使配置 maxParallel=2 且 review correction=0。

将目前 author+scheduling 的一律拒绝改为这条由可信策略推导的串行路径。保持 recovery 要求、validation 禁用 scheduling、写范围隔离、单 DAG owner、资源互斥、deadline-minus-cleanup、取消和有界 drain。不能只因现有 public review correction 恰好为 1 就删除串行保证。

### 3.4 来源与恢复

- 原 task origin 继续由 TaskJournal 精确比较，记录与 execution 相同的可选策略；不改变 TaskJournal 的比较规则。
- 对 resume 中 execution 的单边增删、显式无效值、origin 策略漂移或缺失，必须在相关作者派发前拒绝。缺失 origin 不补造；未落盘的作者回复不重新请求。
- RepairContinuationPlan 和 ContinuationPlan 只继承原 execution 的策略。构造、读回、校验、创建新 origin、运行 successor/continuation 都使用同一选择，不能以 plan 单方面授予。
- 原始任务、已通过祖先和新任务的 origin 均保持该运行的原策略。plan 的单边变更、与 execution/origin 不一致应在新任务注册或派发前拒绝。
- 既有 authorized non-funded continuation 用 TEMP fixture 核此继承；不扩展任务数、modular 限制或窗口权限。funded public run 仍不允许追加窗口。
- ordinary 路径不会进入 human preparation 专用 origin 构造；不修改该分支，也不升级旧 preparation/validation。

## 4. 验收条目

| ID | 必须建立的事实 |
| --- | --- |
| P128-1 | 真实 public ordinary 入口选择并持久记录 1；其他能力和旧省略保持原行为；无效字段拒绝。 |
| P128-2 | 前导 prose 加合法 JSON 的首答仍被严格拒绝，随后只产生一个同会话只读格式请求；同一 attempt 经正常 design capture、host 验证和独立 review。 |
| P128-3 | 合法首答零额外请求；二次无效、真实未完事项或独立 review 拒绝不能获得通过。 |
| P128-4 | author correction 单独启用时 scheduler 也保持 peak<=1；原清理 cutoff 和 drain 仍工作。 |
| P128-5 | 原 grant/caps/32 次设计上限/截止不增加；纠正报价或权限不足时无额外 transport，已发生费用保留。 |
| P128-6 | 旧省略、失败终态、缺失 origin/author/correction 回执及已消费槽位均不能在 resume 获得新请求。 |
| P128-7 | repair 与已授权非 funded continuation 正确继承策略；单边漂移在注册/派发前拒绝；旧 plan/origin 形态保持。 |

## 5. 文件与证据边界

生产范围固定为五个现有文件：src/runtime/entrypoint.ts、src/runtime/orchestrator.ts、src/runtime/scheduler/index.ts、src/runtime/entrypoint-successors.ts、src/runtime/continuation-plan.ts。

roles/protocol.ts、roles/factory.ts、providers/pi.ts、repair/author-protocol.ts、recovery/task-journal.ts、continuation-preparation.ts 和 entrypoint-host.ts 的生产逻辑保持。若实施发现这五文件无法建立上述契约，先向 Root 报告具体反例，再修订批准范围。

测试只使用 SOURCE/TEMP、受控 SDK transport 和必要的原 API；不得访问实际 room、共享账本、凭据、付费 provider 或真实游戏。复用未变严格 parser、readonly 工具禁用、输入签名、单槽中断恢复等已过证据；新增测试关注公开接线、串行和来源继承。具体命令与测试边界见[实施计划](../plans/2026-10-26-public-author-protocol.md)。

本卡完成仅证明源码范围接通；不保证模型每次纠正成功，不证明 room12 恢复、实际设计语义、游戏生成或用户体验通过。
