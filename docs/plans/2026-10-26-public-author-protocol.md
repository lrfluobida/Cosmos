# COS128 Public Author Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans for this Root-approved fixed spec/plan. Steps use checkbox syntax. A dedicated implementer commits on a managed worktree; an independent reviewer inspects the actual diff; only the designated merger integrates main.

**Goal:** 为未来新 ordinary public run 接通已有一次作者只读格式纠正，保持原解析、计费、截止、恢复与验收边界。

**Architecture:** 可信入口在现有 execution.json 中选择可选 authorProtocolCorrections: 1，原 task origin 和继任计划继承该值。scheduler 对该策略强制串行，继续执行原 deadline/cleanup/drain。纠正复用 requestAuthorProposal 和原 native readonlyPrompt，不修改它们。

**Tech Stack:** TypeScript、Node 22、现有 Pi 0.99.2、node:test、原 SnapshotStore/TaskJournal；不增依赖。

---

状态：已批准发布与免费实施，源码仍pending。

审批记录：[COS128 / #129](https://github.com/lrfluobida/Cosmos/issues/129)；独立 `design_review_budget_plan_reviewer` 最终给出 `APPROVED_PLAN`、无findings，唯一P2测试harness问题已闭合，Root批准固定输入的正式发布与免费源码实施。实现者cos128_implementer，独立源码reviewer cos128_reviewer，唯一merger public_agent_batch_merger；源码仍pending。

- 批准规格输入 SHA256：`ccf3e4a851a4648c8bece394fc9639e2d6b4e41e32fed534690770ff4e865177`
- 批准计划输入 SHA256：`a7998d98f2d711278c9297f9f0235a69ec31f06d7bba6adea71433387c3058f2`

登记/实施基线：`5700451d5c6140b02cbaae4e7fd9fc6a7f289db3`；下文诊断基线和原运行证据保持原文。

## 0. 执行约束与基线

- 规格：[COS128正式规格](../specs/cos128-public-author-protocol.md)；诊断基线 main31ca74725c55997eb66f2074d8c2b1a663f000ee/runtime d088df021825f1813e5d8fe9f1c775f011144321。实施可从最新 main5700451d5c6140b02cbaae4e7fd9fc6a7f289db3 开始；该提交仅更新 PROGRESS 结案元数据，生产源码相同。实施前记录实际 worktree base 与本计划差异，不改正在运行的 source。
- 当前状态为APPROVED_PLAN，Root已批准免费实施；源码独审与集成待完成。正式文档由唯一merger发布，实现者仅在指定branch/worktree提交源码和测试。
- room12 已 PASS_CLOSED。其原数据只作已确认诊断背景；全部新测试从 TEMP fixture 开始，禁止读取/修改实际 room1–12、共享账本、API key 或参考游戏。
- UTF-8 严格解码检查在每次编辑前执行；最小补丁，保留中文和行尾；写后读回。使用原生 PowerShell/Node 清理自建 TEMP，先核绝对路径，不拼跨 shell 删除命令。
- Root 分配专属 implementer、独立 reviewer、唯一 merger。实施者只提交已授权文件和准确测试证据；不自行合 main、推送或启动真实案例。

## 1. 固定文件范围

| 文件 | 责任 |
| --- | --- |
| src/runtime/entrypoint.ts | 新 ordinary 策略选择；execution 读写及严格可选字段检查；普通/恢复/repair/已授权 continuation 的 DAG 参数传递。 |
| src/runtime/orchestrator.ts | 作者纠正与 scheduler 的受控兼容；从明确策略推导 exclusiveReason；保持原 recovery/validation 门禁。 |
| src/runtime/scheduler/index.ts | 增加 author_protocol_correction 枚举值；沿用 width=1、截止和 drain 代码。 |
| src/runtime/entrypoint-successors.ts | RepairContinuationPlan 可选字段、构造/验证/读回和全部 origin 一致继承。 |
| src/runtime/continuation-plan.ts | ContinuationPlan 可选字段、原 execution 与可选 repair 来源核验、祖先与新 origin 继承。 |
| tests/runtime/public-author-protocol.test.ts（新建） | 公开 ordinary 接线、费用/调用次数、失败与 legacy 恢复代表。 |
| tests/runtime/ordinary-design.fixture.ts | 只增本卡必要的受控作者回复/计数注入；复用已有普通需求与设计内容，不改其他默认分支。 |
| tests/runtime/scheduler/dag.test.ts | 作者独占与清理代表；复用原 fixture。 |
| tests/runtime/entrypoint-successors.test.ts | 新/旧策略的 repair plan 纯构造与字段继承。 |
| tests/runtime/entrypoint-continuation.test.ts | 复用 setup 的真实 prepareRepairContinuation TEMP/origin/注册边界；补旧省略 execution，验证新/旧策略及单边漂移。 |
| tests/runtime/continuation-plan.test.ts | 非 funded 已授权 continuation 的策略继承、旧形态与漂移拒绝。 |

不改 parser/schema、native readonly 实现、预算 helper、model/output caps、CLI 参数或源码文档之外的无关文件。现有 human preparation origin 不可达本卡 ordinary 选择，保留原样。必要的批准任务卡/实施计划迁入由 Root 安排，不由本准备任务修改 main 跟踪文档。

## 2. 任务 A：用真实 public 路径建立 RED

- [ ] 新建 public-author-protocol.test.ts，复用 ordinaryHostFixture 的普通需求、设计文件及 plan 数据；保留 createProductHost → executeGeneration → createBrowserHost → createRoleFactory → executeTaskDag 真实调用链，不能手工给 DAG 传作者开关代替公开入口。
- [ ] 首个测试名固定为 “COS128 public ordinary corrects prose-prefixed handoff once”。受控 design 首答为前导 prose 加合法三字段裸 JSON，纠正答为同样事实的严格 JSON；工具只写 TEMP 下合成内容。保存原首答字符串并核它仍不能全文解析。
- [ ] 主公开代表让设计作者使用真实 Pi readonlyPrompt 与拦截的 SDK transport；复用已有 native fixture 的 fake HTTP 方式，任何非 fixture provider 请求立即拒绝。可对访谈/规划和 reviewer 使用明确标注的 deterministic SDK fixture。设计 capture/host 校验必须真实；独立 review 是另一个上下文的受控 verdict。
- [ ] 将 fixture 的运行边界设在设计 review 之后：下一 art 会话派发前以明确 fixture cutoff 停止，不创建游戏或启动 browser/build。最终整体 incomplete 是预期；断言 design 是否 passed、capture/verify/review 顺序及身份，不能断言游戏通过。
- [ ] 同一 fixture 增加 “COS128 public valid handoff makes no correction”。两案只改变首答，其他合成事实相同；比较原作者 session、attempt、transport/request/billing 计数。纠正案恰好多一笔原 design grant 的请求，合法案为 0。
- [ ] 在未实现的源码上只运行这两个测试，保存 RED。预期前者为 invalid_proposal 且没有 correction/capture/review；合法案可建立正常基线。不能以缺文件、超时或fixture错误作为有效RED。

命令（工作目录为专属 worktree）：

~~~powershell
$env:COSMOS_TEMPLATE_ROOT = 'E:/develop/Cosmos/templates/2d'
node --experimental-strip-types --test --test-name-pattern 'COS128 public (ordinary|valid)' tests/runtime/public-author-protocol.test.ts
~~~

如已有 fixture 的 sessionFactory 不能同时使用 native design 和受控其他角色，只在该 fixture 增加一个窄注入点；不要另建通用 SDK 测试框架。输出明确列出 synthetic transport、真实 host 结构验收和未执行 browser。

## 3. 任务 B：最小公开策略与串行接线

- [ ] 在 entrypoint.ts 现有 execution 类型增加 authorProtocolCorrections?: 1。新建 execution 时仅 exact ordinary-design-execution/1 写 1；非 ordinary 省略。resume 从原 execution 读取，严格检查“无自有字段”或数字1；禁止通过 null/0/字符串等归一化成默认值。
- [ ] 构造 DAG 参数时，启用则传 authorProtocolCorrections:1，否则继续不传字段。不要写 authorProtocolCorrections: recorded ?? 0，否则会改变旧 origin 字节形态。
- [ ] 保持模型提出的任务、native plan、acceptance、budget、host capability 检查不变；不要把新选择塞进模型可写的 task context，也不要修改 planning-started.json。
- [ ] 在 scheduler 的 exclusiveReason union 增加 author_protocol_correction。orchestrator 的选择表达式为以下既有模式的窄扩展：

~~~typescript
resume ? 'recovery'
  : options.authorProtocolCorrections === 1 ? 'author_protocol_correction'
  : options.reviewProtocolCorrections === 1 ? 'review_protocol_correction'
  : null
~~~

- [ ] 以该强制串行路径替换 author+scheduling 一律报错，保留 author correction 必须 recovery、validation 禁止 scheduling 等独立守卫。不要依赖 public 当前 review=1 或共享资源恰好使其串行。
- [ ] 重新运行任务 A 两案至 GREEN。增加首答有效但真实 remaining 非空、纠正仍无效、独立 reviewer changes_requested 的短代表：不得通过，不产生第二次格式请求，不把 protocol_failure 改成 code_defect。
- [ ] 新增 scope 表：新 ordinary 为1；新非ordinary/旧字段省略仍省略；显式0/null/string/bool和其他capability的1拒绝。低层原有0/1 API回归不改。

## 4. 任务 C：origin、repair 与 continuation

- [ ] entrypoint-successors.test.ts 只核纯 buildRepairContinuation 的字段继承。真实 repair 持久化测试使用 entrypoint-continuation.test.ts:13 的现有 setup：先用 f.requirement、f.originals、f.originalPlan 和既有输入构造合法 execution.json，默认省略作者策略，保留原测试预期；再增加新策略1分支，使 execution、plan 和原 origin 同步携带1。不得另建 harness。
- [ ] 在 entrypoint-continuation.test.ts 和 continuation-plan.test.ts 中增加启用策略的来源 fixture，确认当前 origin 构造因漏字段出现真实 RED；旧省略 plan/origin 保持原字节形态。前者直接调用 prepareRepairContinuation，检查落盘 plan、所有新 origin、注册和冷重开；后者继续覆盖非 funded 授权窗口。
- [ ] 给 RepairContinuationPlan 增加同名可选1字段，buildRepairContinuation 接受入口已选择的值；validate/prepare 必须对照原 execution 的 capability、策略和既有身份，而不是相信 plan 自己的值。原 execution 省略时 plan 和全部 origin 均省略。
- [ ] prepareRepairContinuation 读回原 task origin、检查已通过祖先以及创建 additions origin 时沿用同一可选字段。在 entrypoint-continuation.test.ts 分别单边修改 execution、plan、origin；断言在新 task 注册前拒绝、snapshot/allocations 不变、没有新增 plan/origin 或模型请求。新1和旧省略均覆盖，不补旧 origin、不增加 repair 次数。
- [ ] continuation-plan 的 derive 从原 execution 读取相同策略，若含 repair-plan 则要求策略一致。ContinuationPlan 和所有原/新 task origin 继承该值；entrypoint 的 continuation DAG 只用固定 plan 的该选择。
- [ ] 不改变 continuation source 列表的历史形态，不额外加入 planning-started，不改 source hash 算法；原 execution 已在既有 sources 中。TaskJournal.sameValue 继续作最终 origin 核验，不删除比较来兼容。
- [ ] 在 public 恢复代表中覆盖：旧 execution/origin 均省略、旧 failed attempt、缺 origin、仅有 origin 而无 author/correction、单边增删1。全部保持无新 author/correction 请求；缺 origin 不创建回执。
- [ ] 覆盖已有完整 correction-response 的中断恢复仍只消费原回复，不补发；只选一项代表验证新 public 参数传递，不重跑未变单槽中断矩阵。
- [ ] 对新1和旧省略各跑一项 repair 持久化正例（entrypoint-continuation.test.ts）及非funded已授权continuation来源测试（continuation-plan.test.ts）；新1核全部origin一致，旧省略核计划/回执字段未增加。再运行原 “group plan, all origins and allocations are durable before any first attempt, and registration is idempotent” 正例，确认补 execution 后旧持久化/注册仍通过。保持funded追加窗口拒绝和原任务数量/modular限制。

恢复不会因当前软件支持纠正而升级旧运行。TaskJournal 在 resume=true 缺 origin 时直接拒绝；已有 origin 时精确字段比较拒绝策略漂移。这是使用 execution/origin 即可的依据，不声称曾存在 origin 缺失时的付费绕过。

## 5. 任务 D：有限验证与证据复用

- [ ] scheduler 新增 author correction=1、review correction=0、maxParallel=2 且无共享资源的两个独立 task。断言 configured=2、effective=1、peak=1、exclusiveReason=author_protocol_correction；真实 writer 范围隔离仍检查。
- [ ] 使用原 scheduler fixture 为作者纠正路径跑一个截止/取消 cleanup 代表，确认原cutoff、drain与状态记录仍生效；不重写时间逻辑，不跑真实等待。
- [ ] 公开/native 集成新增一个纠正预算拒绝代表：原grant下的实际报价不可负担，未发送该纠正transport；原已结算请求及费用不丢失，cap/deadline/grant保持。复用原request-limit测试证明readonly同样消耗32次总上限，不新增容量。
- [ ] 保存每层原始 TAP、命令、退出码、源码SHA，核typecheck/build。真实产物/浏览器/付费/human均为NONE，不把fixture设计passed记为游戏成功。

新测试统一以 COS128 开头，受影响分层命令如下；不运行 npm test 全仓矩阵：

~~~powershell
$env:COSMOS_TEMPLATE_ROOT = 'E:/develop/Cosmos/templates/2d'
node --experimental-strip-types --test tests/runtime/public-author-protocol.test.ts
node --experimental-strip-types --test --test-name-pattern 'COS128' tests/runtime/scheduler/dag.test.ts tests/runtime/entrypoint-successors.test.ts tests/runtime/entrypoint-continuation.test.ts tests/runtime/continuation-plan.test.ts
node --experimental-strip-types --test --test-name-pattern '^group plan, all origins and allocations are durable before any first attempt, and registration is idempotent$' tests/runtime/entrypoint-continuation.test.ts
node --experimental-strip-types --test --test-name-pattern 'explicit (resource|correction) lane|original deadline|cancel' tests/runtime/scheduler/dag.test.ts
npm.cmd run typecheck
npm.cmd run build
~~~

原持久化正例命令必须命中1项并通过；scheduler命令只复核实际命中的原短代表，实施前列出匹配测试名，若没有匹配则选原文件中对应的准确名称，不能把0项或全skip当通过。主线集成只重验最终改变影响的代表；未变结果继续复用。

证据复用表：

| 既有证据 | 本卡处理 |
| --- | --- |
| tests/roles/model-json.test.ts 全文/单fence/歧义拒绝 | parser不改；复用，不再全量跑。新public案核本次prose仍拒绝。 |
| tests/roles/author-protocol.test.ts 单槽、身份、签名、invalid/unresolved/host-failed、unknown/cancel、断点恢复 | 原实现不改；复用已过矩阵；只以public一项完整回执恢复核新接线。 |
| tests/providers/pi.test.ts:346 起 readonly工具禁用、每次一个provider请求、负载恢复 | 原native实现不改；复用全矩阵。新public主案只核工具列表为空和原会话连续。 |
| tests/runtime/ordinary-design-request-capacity.test.ts:129/149 的32次/第33次拒绝 | 配置与cap不改；复用，新增测试不消耗32次循环。 |
| 原scheduler清理/隔离及successor纯plan构造 | 受影响入口跑上列新增与短代表；不以纯build结果替代repair持久化证据。 |
| tests/runtime/entrypoint-continuation.test.ts 的 prepareRepairContinuation 持久化/注册及 continuation-plan 来源 | 原setup补省略策略execution后，跑新1/旧省略、execution/plan/origin单边漂移和1项原持久化正例；其余未改长整链、浏览器与模块证据复用。 |
| COS127独立review容量与语义协议 | 源码不改，复用其已审SOURCE/TEMP；room12未到真实review，不能新增运行结论。 |

若实现触及上述计划保持不变的组件，停止按“未变”复用，先报告实际差异并只追加受影响验证。

## 6. 提交与独立审查

- [ ] 实施者先记录各目标UTF-8检测结果，最小补丁后重新读回中文；git diff --check，确认无旧run、凭据、游戏或非范围文件进入diff。
- [ ] 在专属branch/worktree提交批准范围，报告exact SHA、基线、每层RED/GREEN、复用依据和已知限制。
- [ ] 独立reviewer先核P128-1至7，再查实际diff、policy来源、旧origin形态、串行/清理和真实public fixture；纠正findings后只复查受影响差异。
- [ ] 唯一merger核批准SHA，集成后跑typecheck/build和最小public/lineage代表。Root负责源码状态、任务元数据和后续是否另开真实验证；本卡不恢复room12。

最终完成标志只能是 PUBLIC_AUTHOR_PROTOCOL_CORRECTION_SOURCE_READY，且须实际独立批准与集成后才能使用。当前计划已批准实施；该源码完成标志仍须实际独立批准与集成后才能使用。
