# COS132 Author Budget Recovery Implementation Plan

状态：固定规格/计划已由独立 `author_budget_recovery_reviewer` APPROVED_PLAN、无P1/P2，Root批准工程设计及免费源码实施；已最终独审并集成，仅source-scoped完成。

任务：[COS-132 / #133](https://github.com/lrfluobida/Cosmos/issues/133)，原生父COS18/#19、父[x]。实现者 `author_budget_recovery_implementer`，独立源码reviewer `author_budget_recovery_reviewer`，唯一merger `public_agent_batch_merger`。

- 批准规格输入 SHA256：`365be142f7b150f21b710d66c3a56b2481f996175acc7b4ba356ec3a4724a5e9`
- 批准计划输入 SHA256：`33ce22beec281c3ec0978bd212186288a81a35e6b7abb6af401a06375932aef3`

登记/实施基线：`844df4c7e09d7bbbad0b1a4d0cf2e3006801d9fd`；已发布runtime `ac1c745eb0be016f8a556edbadabad013fbf61bd`。下文设计诊断基线按批准原文保留。[配套技术规格](../specs/cos132-author-budget-recovery.md)。COS132/COS133并行，不互设阻塞；最终组合的实际reviewer报价为下一次付费前置。本次仅免费源码实施，旧reuse-1永久failedclosed，不操作真实run/ledger/coordinator。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. One independent implementer, one independent reviewer, and the existing unique merger own this task.

**Goal:** 让新 ordinary 作者在同一总预算内保留独审容量，并在冷却内遇到可恢复预算压力时使用一次真实摘要；不足时给出可操作原因。

**Architecture:** 复用 author-output-budget、Pi 的 successful-tool boundary、现有 readonlyPrompt 与 role-budget 串行准入。一个可选 execution 字段固定新运行策略；原记录缺省走旧行为。不开新配额或交接框架。

**Tech Stack:** TypeScript、Node 22.22.2、Pi 0.99.2、node:test；fake provider transport，实际 SDK / scoped tools / ledger / DAG。

源码结果：获批源码 `e2df1148e1f49f213b893efbcffff9b0a5726b5f` 已独立APPROVED_SOURCE_SCOPED，无剩余finding；三卡统一合入main `06709f34e11512f62fc83d2b1ef4591f9c467f32`。[精确批准](https://github.com/lrfluobida/Cosmos/issues/133#issuecomment-6428846258)、[SOURCE完成关闭](https://github.com/lrfluobida/Cosmos/issues/133#issuecomment-6428851663)及父[x]已GET核证。 最终typecheck/build exit0，art留槽1/1及公开复用→设计v2→真实编译/Edge10步/clean delivery1/1分别通过、均0skip；独立APPROVED_INTEGRATION_SCOPED。完整native及171步/四故障有效证据复用；真实模型与人工体验仍未验证，paidAuthorized=false，父COS18仍open/partial。

## 文件边界

- `src/runtime/entrypoint-host.ts`：新 ordinary 分配、policy 选择与角色工厂接线；与 COS133 的规则文本修改协调最小 patch。
- `src/runtime/entrypoint.ts`：`GenerationHost` / 本地 execution 类型与新可选字段写入、恢复一致性检查。
- `src/roles/factory.ts`：可信新策略开关；只对指定 ordinary 设计作者设置保留、压力压缩和 readonly 4096；审查已有 4096..8192 选择保持。
- `src/roles/author-output-budget.ts`：原权威核对、扣除保留的只读报价、压力选择及明确预算错误。
- `src/roles/provider-budget.ts`：在现有 `coordinateAccounting` 内、真实 reserve 前检查作者剩余保留，不新增账本写入。
- `src/providers/pi.ts`：`budget_pressure` 选择、一次冷却例外、已有 readonlyPrompt 的可信输出 cap、允许的资源错误传播；不改变 SDK 依赖或请求上限。
- `src/runtime/repair/feedback.ts`、`src/runtime/repair/policy.ts`：固定原因映射与资源耗尽 stop，不加 FailureRecord 分类。
- 新测试 `tests/providers/author-budget-recovery.test.mjs` / `.fixture.mjs`；复用 `tests/roles/author-output-budget.fixture.ts` 和 native compaction fixture，必要时只添有限参数。
- 在现有 `tests/roles/author-output-budget.test.ts`、`tests/roles/repair-policy.test.ts`、`tests/runtime/ordinary-design-request-capacity.test.ts` 添加受影响边界；复用 `tests/providers/design-review-budget.fixture.mjs` 的独审 DAG 模式。`tests/runtime/public-validation-preflight.mjs` 只由该文件原负责人按已审结果增加一个必要代表，避免重复矩阵。
- 不改真实 run / ledger / 人工确认 / 固定验证配额；不新依赖、不改生成游戏源码，不改 COS133 媒体语义内容。

## Task 1：固定免费 RED 与精确报价

- [ ] 严格检测上述待改文件 UTF-8，确认工作树干净；读 spec 与 existing tests 后宣布实际文件。
- [ ] 先运行保留探针：在 repo cwd 用 `Get-Content -Raw -Encoding UTF8 <TEMP>/boundary.mjs | node --experimental-strip-types --input-type=module -`。预期原政策 `ordinarySelected:false`，91664B / 8192 拒绝，7348 仅报价可付。
- [ ] 建立独占 TEMP、零网络的 native 回归，不提交原真实 session 或内部推理。用合成同形 turn / tool-result / compaction checkpoint，固定真实测得的输入与 grant 边界；原始 live 的 91664B、75809B 与 29 次计数写在测试注释/断言。不得用单个纯函数断言替代真实 SDK 冷却路径。
- [ ] RED：成功摘要后仅增长 15855B、完整 cap 不可付但真实摘要可付，原代码受冷却阻挡；另一个 floor 不可付样本复现原 selection=false。原生 quote / dispatch bytes 必须一致，所有调账仅在 TEMP fixture。
- [ ] 保留独审原报价 `15968B -> 105647B` 与五个完整 read 的形状；fixture 使用合成身份和内容，保留必要语义遗漏、中文与同等输入量。通过实际 reviewer 工厂/SDK，不把 `JSON.stringify(draft).length` 当请求报价。

## Task 2：固定分配与实际准入保留

- [ ] 新 ordinary execution 写 `ordinaryDesignBudgetPolicy:"review-reserve/1"`，首次选择设计 25%；恢复先读取既有字段，缺省沿旧 15% / 旧 hook，未知值拒绝，host 与 execution 必须一致。公共已确认需求复用入口继承这项新运行策略，但原需求/确认字节不变。
- [ ] 作者保留值 `floor(originalTaskAllocation/3)`；所有 author quote 使用原 ledger 的独立克隆，核对原 run / allocation / authority，然后只改变报价用可用上界，不修改真实分配。不要把 reserve 写成 synthetic spent entry。
- [ ] `createRoleBudget` 内添加窄可选作者保留检查，置于现有 accounting 串行区、真实 reserve 之前；验证当前 task / grant 与 frozen 策略，按 settled+reserved 检查 `requestCost <= taskAllocation - committed - holdback`。实际 reserve/admit 仍负责 shared / unknown / deadline 等现有守卫。拒绝不得留新 request/receipt。
- [ ] factory 的 reviewer 不带作者保留；继续读取固定产物、使用现有自适应 4096..8192，独立 actor/context 不变。
- [ ] GREEN：4500000µ pool 的分配向量为 1125000 / 1125000 / 1800000，余 450000；375000 为公式结果。675000 旧记录保持旧值，恢复不能偷偷升级。报价与实际 admission 的竞态注入仍拒绝；总 limit、reserved/unknown 与原 request 计数未扩大。

## Task 3：一次预算压力冷却例外

- [ ] `requestCompaction` 类型兼容原 boolean，增加仅可信 host 可给的 `'budget_pressure'`；普通 legacy / fixed validation 保持原 boolean 逻辑。
- [ ] 新政策在扣除 holdback 后 full cap 不可付时选择 pressure，包含 floor 已不可付。Pi 保留相同 projection / cancellation / error tool / disabled / readonly / <3 slots 保护，但把 policy 查询放到冷却判定前。冷却内 pressure 最多放行一次；跨过正常冷却的原行为保持。
- [ ] 摘要实际 context 的 preflight 与输出选择同样保护 holdback。摘要不可付且普通 floor 可付才 skip；否则抛可信 budget reason。真实 request 仍计数、reserve、admit、settle；不得把此例外当新 attempt。
- [ ] 复用已有 after-compaction 成本下降检查及 checkpoint / projection 身份检查。实际 settlement 后普通请求重新报价；不足立即终止，不复用压缩前选出的 cap。
- [ ] GREEN：按真实12861B摘要形状，最高91258µ结算；合成短摘要后77253B、floor220042µ，新策略当前作者余317115µ仍能继续，review保留不变。若测试的真实归一化长度因合成身份变化，应固定/说明差值，不伪称精确原值。
- [ ] 有限负例：相同projection；第二次冷却内pressure；native no-op / 无下降；长summary导致floor仍不足；summary实际最大费用；split second summary不足；budget race / unknown / cancel。新断言只覆盖改变的路径，既有 COS125 多种 unchanged error 矩阵复用。

## Task 4：只读纠正与可诊断退出

- [ ] 新政策只给已有 `readonlyPrompt` 设置4096，进入时全部 tools 禁用、输出报价仍走原预算/保留；退出恢复原工具状态。普通写作8192与摘要8192不降。readonly 的一次请求继续计入 session 原32与既有一次纠正槽。
- [ ] 只在原协议解析失败路径使用；不捕获失败 prompt 后自动重试，不强制 handoff，不靠结构 passed 填空数组。
- [ ] 为明确已知资源故障保留固定码，例如 `author_output_budget`、`author_review_reserve`、`review_output_budget`；真实 request_limit 保留。Pi catch 只允许这些类型/码，其余异常沿用脱敏，不将工具文本或密钥入反馈。
- [ ] feedback 用具体checkId+固定解释说明未发送；repair policy 对资源耗尽 stop 并保留差距。分类枚举可仍为insufficient_evidence，但决定与说明不能只有这个笼统词。
- [ ] 测试累计29+摘要1+普通1+readonly1=32，下一次无provider；readonly尝试工具、length、失效authority和低于4096报价均不放行。预算不足、requestlimit与真实语义缺陷具有不同原因。

## Task 5：独审与 COS133 最小组合

- [ ] 实际 factory / Pi / scoped reads / DAG 的合成 reviewer 读取完整当前 draft+两文件+host evidence，再给出有依据 changes_requested；art/code dispatch 必须0，结构 passed 不改变这一点。
- [ ] 另一个无语义缺陷合成 fixture 完成作者合法交接与独审批准，证明保留可被原 reviewer 实际消费；它仅是接口证据。
- [ ] COS133 规则与媒体反馈合入候选后，重跑唯一必要 reviewer 报价与受影响 native 边界，重新记录输入bytes、4096与8192报价及最多必要请求路径。若新增提示导致固定1/3保留连最低必要路径都不够，提交精确差额给root作技术修订，禁止继续付费试错；不得在运行时自动转移额度。
- [ ] 独立 reviewer 看实际 diff 与原账本不变、旧execution默认、固定validation隔离、语义拒绝链；修复finding后只复核affected。

## 验证与提交

先运行 `node --experimental-strip-types --test tests/providers/author-budget-recovery.test.mjs`；随后对上述三个现有测试文件按新增精确 test-name-pattern 运行。若跨adapter/预算代码确实改变旧行为，仅追加对应COS124/125/127/128代表，复用其余通过证据。运行 `npm run typecheck` 与 `npm run build` 一次；不用全仓、完整浏览器或任何真实provider。

提交前重开UTF-8文件核对中文，保存命令、退出码、RED/GREEN、实际bytes、资金与请求计数、已知未证明项。implementer报告精确SHA，独立reviewer批准后由唯一merger合并并更新progress/issue。本卡设计不授权重开旧run；免费组合通过后root继续原授权范围内的下一次有界验证。
