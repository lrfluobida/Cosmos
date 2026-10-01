# COS-18 CLI entrypoint implementation plan

**状态：** root 已批准方案 A 及持久硬停止语义；A 段 `d80842961800da78cb4ddfcf29315f0e8ef776ef` 获独立 `PHASE_A_READY`。B 段最终 `6111f6fa13b42acb4678fedd59a44847fd874d98` 经独立审查并合入，Phase C 从 `f09dcb0563a539cd031b4e6cf5ddaf285eac00fb` 在 `feat/cos-18-successors` 继续未启动下游的显式继任。A/B 原基线为 `0a10f4230c312cc9874be0e6499fd784b3ceba9c`。

**Goal:** 接通原 R4/R11 的一句话需求、design 访谈、显式确认、生成及运行控制 CLI，并完成离线验证。

**Architecture:** 建议在同一运行目录、同一快照文件中增加确认前 intake 阶段。该阶段使用同一权威 BudgetLedger 计费；确认与环境准备完成后，原子转换为现有 RunSnapshot，再使用现有 RunController、角色、调度、恢复和产物接口。

**Tech Stack:** Windows、现有 Node 22/TypeScript、原生 pi `deepseek-flash`、Phaser 通用模板和 Playwright 验收器；测试注入 provider/host。

执行按下列步骤推进；独立 reviewer 由 root 安排，不在本任务另起子代理。COS-10 尚未游戏验收通过，COS-11/13 仅离线验证通过，G3 仍未通过。本计划不授权付费调用或正式生成，不运行或修改旧 pilot、trial、共享验证账本或参考游戏。

## 1. 账本与计时选择

| 方案 | 影响与判断 |
| --- | --- |
| A：同文件 intake 快照原子激活为现有运行快照（建议） | 新增有界 intake 记账薄层；正式执行继续消费同一 ledger 和请求历史。保留旧运行契约与调度器接口。 |
| B：把全部 RunSnapshot/RunManifest 改为 intake/generation 联合类型 | 每个运行消费者都需处理空截止时间，会波及已审核的调度、修复和恢复；当前不采用。 |
| C：独立访谈运行，生成时另开账本再补导费用 | 会引入双重权威和不确定请求迁移，无法满足本次单账本要求；不采用。 |

### 建议的不可变条件

1. `createIntake` 仅接受没有 `snapshot.json` 的新产品运行目录；固定 runId、ledgerId、generation scope、总上限、访谈分配及候选生成时长（最多 12h）。旧 v1 运行不能进入 intake，也不能用此 API 改起点。现有 validation scope、¥150 与 `2026-10-01T18:16:16.857Z` 原截止时间不变。
2. intake 快照使用独立格式标识，保存创建时间、运行身份、BudgetLedger、admission、事件、访谈轮次、草稿与回答版本。此时没有 RunManifest 和已生效的生成 deadline；不填假时间。单次请求仍有超时、最大费用预留和有限访谈请求数，重开会话不重置计数。
3. 访谈直接使用 `createPiSession` 和现有 receipt 记账路径，不经要求已确认需求的 `createRoleFactory`。把 `createRoleBudget` / `reconcileRoleReceipt` 的参数收窄为两种 controller 都能实现的账务接口；接口只含账务队列、reserve/admit/unknown/settle/cancel 和身份/ledger/request 只读视图。价格计算、receipt 格式和对账规则不变。
4. `activateGeneration` 持有同一个 SnapshotStore 独占锁，要求准确版本的用户确认、可信 host 支持的验收方案、环境准备和执行前置均通过，且没有在途/unknown 请求。只在这里用真实时钟确定 originalStartedAt 与 originalDeadlineAt；拒绝先激活再安装依赖或等待缺失前置。
5. 激活在一次原子 snapshot 写入中保留 ledgerId、总额、全部 allocation、entry、admission、费用、事件序列和 runId，追加激活事件及带来源的用户确认，生成现有 v1 RunManifest。转换前后逐项校验原 ledger/request/history 不变，再校验最终 v1 快照。不得调用 `RunController.create`、清空费用或把访谈费用转给公共开发验证账本；若需要新的规划 allocation，只从原总额未分配部分追加。
6. 激活提交后释放 intake owner，再由 `RunController.open` 接管同一路径。并发竞争由现有 OwnerLock 处理；失败者不得另开运行。崩溃前只有完整 intake，崩溃后只有完整 generation；激活后重试只识别已激活结果，不重写开始时间。所有账务操作仍由当前独占 owner 串行落盘。
7. 激活后沿用当前 RunManifest 不可变起止时间约束；生成、集成、修复、打包和干净目录启动检查均在原窗口内。¥200 包含此前访谈费用，¥100/6h 仅作优化目标。unknown 在 intake 和 generation 中均保守占额；停止或崩溃不允许盲目重发。

## 2. 访谈、确认与可信验收

- CLI 拟提供 `new <run-dir> --brief <一句话>`、`resume <run-dir>`、`status <run-dir>`、`stop <run-dir>`，保留现有 init/run-dir/build/preview。每次输出实际 runId，既有目录只允许明确恢复，不能借 new 覆盖。
- native design 返回集中问题及需求/验收建议。host 校验数据结构和范围；CLI 经 stdin 收集回答，展示完整草稿、验收步骤与精确修订号。只有用户针对当前修订号的明确确认才调用 `confirmRequirements`；原始回答与确认记录由 host 保存到冻结 source。不得由模型提供 actorId、confirmed 标志或代答。修改 brief、回答、要求或验收使旧确认失效。
- 需求草稿与验收计划是不同的受限数据，均须在确认前展示。计划只允许现有 AcceptancePlan 的鼠标/locator 操作、可见文字/可见性断言及受限只读观测；runId、产物版本、URL 和报告目录由 host 绑定。禁止任意脚本、shell、状态 setter 和作者可改的期望值。
- 只读 debug 数值不能单独证明玩家可操作；每个玩法条目必须有真实输入路径和相应可见结果。设计模型的建议不能自动变成通过证据。作者写入目录与冻结需求、验收计划、host 报告和账本隔离，独立 reviewer 读取准确产物版本及 host 实测证据。
- 无法由当前可信 host 操作或观测的要求在确认前明确列为不支持/待决策，不默默删去。完整经典基准继续使用 COS-14 的可信验收工具；CLI 通用声明式验收不冒充完整基准工具。艺术辨识、手感等最终体验保留为用户验收。
- 两种不同 brief 通过同一 host 装配和模板进入各自的已确认契约；不能读取固定 pilot JSON 充当通用入口。模型规划和生成仍使用现有 role factory/planner、受限工作目录、scheduler、repair、registry 和正常输入验收器。

## 3. 状态、停止与恢复

- `status` 从规范路径只读读取原子快照并校验格式，不调用会持锁、对账或触发截止写入的 `RunController.open`。显示 intake/生成阶段、确认修订号、原时间、费用/预留/unknown、任务与交付差距；没有通过证据时不显示完成。
- 活跃 owner 持有本地控制通道，控制消息绑定 runId 和当前 owner 身份。`stop` 只通知 owner，由 owner 调用现有 `cancelAndDrain` 并保存结果；只有子任务/写入收敛后才确认停止。控制目录不在作者写范围，陈旧 owner 或超时不得被当作停止成功。无需 Web 服务或新进程调度系统。
- `resume` 先用现有 ownership recovery 确认旧 owner/写入进程已退出，再核对同一路径的 receipt、计划和固定版本；generation 走 `resumeTaskDag`，复用已通过证据。丢失回复、未知费用或无法证明完成的阶段仍阻塞，不能增加一次盲目调用。
- **已批准的停止语义：** `RunController.stop` 是持久硬停止；`resumeTaskDag` 遇到任何 stopReason 都拒绝派发。resume 仅恢复未持久停止、仍在原窗口内的可核实中断，手动停止、硬截止或费用超限均保留原状态并报告具体拒绝原因。本版不支持手动 stop 后直接 resume；不得宣称该场景通过。未来追加额度或延时属于用户的新决定，本版不提供清除停止、续时或重置任务终态的接口。
- 不把模型凭据交给游戏/构建进程、控制消息、草稿或日志；继续使用现有白名单子进程环境和可信参数数组。复用已经通过的源码与资产快照，输出交付位置、同版本客观报告和待用户体验确认状态。

## 4. 文件归属与共享 core 边界

| 文件 | 计划职责 |
| --- | --- |
| `src/runtime/intake.ts`（新增） | 独立 intake 快照校验、有限访谈记账、同文件一次性激活；复用 BudgetLedger 纯函数和 SnapshotStore，不执行游戏 DAG。 |
| `src/roles/provider-budget.ts` | 仅抽出最小账务接口类型，供 intake 与现有 RunController 使用；保留已审核的 receipt、价格与并发记账实现。 |
| `src/runtime/run-types.ts`、`src/runtime/run-validation.ts` | 若采用 A，仅新增 `generation_activated` 事件类型/校验；不改变旧 v1 RunManifest 的必填项、时间限制或更新规则。 |
| `src/roles/interview.ts`（新增）、`src/roles/requirements.ts` | 无生成工具的 native design 访谈、草稿修订/确认绑定；保留现有 host-supplied API 兼容。 |
| `src/cli/index.ts`、新增 `src/cli/session.ts`、`src/cli/control.ts` | 参数、stdin、当前草稿展示、host 启动与运行控制；默认生产适配器，测试显式注入假 provider/host。 |
| `src/runtime/entrypoint.ts`、`src/runtime/entrypoint-host.ts`、`src/runtime/entrypoint-media.ts`（新增） | 薄层装配既有规划/执行/恢复/修复；host 固定模板、工具、独立 design/art/coding 归属、动态媒体渲染、验收/产物版本及交付。 |
| `tests/runtime/intake.test.ts`、`tests/roles/interview.test.ts`、`tests/cli/session.test.ts`、`tests/cli/control.test.ts`、`tests/runtime/entrypoint.test.ts`（新增） | 账本转换、真实 stdin/命令控制、动态确认和适配器接线的离线故障测试。 |
| `docs/development/quickstart.md`、`docs/development/roles.md`、本计划 | 支持范围、命令、阶段/计费/停止语义和验证证据。 |

当前建议不修改 `src/runtime/run.ts`、`src/runtime/scheduler/`、`src/runtime/orchestrator.ts`、`src/runtime/recovery/`、`src/contracts/` 或 `probes/e2e/`、trial 驱动。若读取中发现实现必须触及这些边界，先向 root 报告具体接口与理由，不以接线为由重写已审核逻辑。必要的预算接口优先复用纯函数；不复制完整执行器。

## 5. 实施与离线验证顺序

- [x] root 确认 A 的阶段转换与 stop/resume 语义，固定共享 core 归属；再开始代码实现。
- [x] 先写 intake 测试并确认失败：已计费/unknown 持续、拒绝在途激活、一次性真实时钟激活、旧 v1 拒绝激活、并发激活、提交前后崩溃与重复打开。实现薄层后执行 `node --experimental-strip-types --test tests/runtime/intake.test.ts tests/roles/budget.test.ts tests/runtime/run.test.ts tests/runtime/recovery/receipts.test.ts tests/runtime/recovery/snapshot-crash.test.ts`，期望全部通过且零 provider 网络调用。
- [x] 先写访谈与 CLI 测试并确认失败：两个不同 brief、正常 stdin 回答、当前修订号确认、缺答/拒绝/EOF、改稿使旧确认失效、伪造确认字段被拒、unsupported 验收、环境未就绪不激活、生成前置缺失不调用。实现后执行 `node --experimental-strip-types --test tests/roles/interview.test.ts tests/cli/session.test.ts tests/cli/cli.test.ts`。
- [x] 先写 host/控制接线测试并确认失败：状态读取不取得写锁、不改变 snapshot；正确 runId 的 stop 等待 drain，错误身份/陈旧通道拒绝；崩溃恢复同计划同费用同时间；已停止/过期的原运行不被重开；冻结验收作者不可写；费用/unknown/history 连续、秘密不进入子进程或输出。实现后执行 `node --experimental-strip-types --test tests/cli/control.test.ts tests/runtime/entrypoint.test.ts`。
- [x] 接通现有角色、registry、host 验收和交付，保留独立评审及固定版本。仅重跑受接口变化影响的角色预算/恢复/调度契约测试，再依次执行 `npm run typecheck` 与 `npm run build`；不要与真实浏览器 fixture 并发写构建目录，不为接线重跑真实生成或既有媒体/浏览器验收。
- [x] 更新使用文档，逐文件复查 UTF-8、原换行与中文；执行 `git diff --check`。
- [ ] 交由独立 reviewer 审查 B 段精确 SHA、命令输出和已知限制；root/merger 负责后续集成。离线结果不能标记 COS-10 游戏通过、COS-11/13 live 通过或 G3 通过。

## 6. A 段实现与证据

- `IntakeController.create/open` 只处理新 `intake-1` 快照；当前草稿与确认以不可覆盖的 source 文件落盘。`saveDraft` 增加修订号并使旧确认失效；`confirm` 必须接收当前修订号和 host 取得的真实用户决定。`activateGeneration` 在原 owner 锁中保留全部账本与请求历史，发布一个 v1 运行快照；同实例重复激活返回原结果，重开 intake 会拒绝已激活 v1。正式执行随后使用 `RunController.open`。
- `requestDesignQuestions` / `requestDesignDraft` 通过无生成工具的 native pi 会话提出建议。每个步骤先保存输入 intent，完整回复保存后可按准确输入复用；有 intent 无回复时阻止盲目重发。两种不同 brief 的假 provider 检查证明接线使用实际输入，并经原 receipt 路径计费；未进行付费 native 效果验证。
- 红灯证据：intake 13 项因缺少 API 失败；interview 5 项因缺少 native 入口失败。实现后的聚焦命令包含 intake/interview、原预算、RunController、receipt、snapshot crash，共 49 项通过。补充两个真实子进程的激活前/后退出场景后，新增模块共 21 项通过；重用未改代码的既有回归证据。`npm run typecheck` 和 `npm run build` 通过，UTF-8/LF 与中文复读通过。
- A 段提供 intake API；公开 CLI/stdin、host 装配、控制通道和交付见 B 段记录。未完成的确认/source 发布或缺失 native 回复会保守阻塞，不推测用户已经确认，也不重复付费。A 段测试使用临时目录和假 provider，没有访问 live 账本、旧试跑或参考游戏。任何真实验证仍须独立满足既定预算/门禁，旧过期记录保持原状。

## 7. B 段实现、验证与明确缺口

- 公开入口为 `new <run-dir> --brief <text>`、`status`、`stop`、`resume`，保留链接安装的 bin 入口。草稿用普通中文展示，版本确认来自真实 stdin。状态只读；停止通过绑定 runId 的本机 owner 通道执行；终端复用持久 `budget_warning` 显示一次 80% 提示，不建立新账本。intake 和生成恢复均先核对原持久费用回执，再决定是否允许新请求。
- 独立 design/art/coding 槽位均有固定写入范围和阶段验收；Cosmos 的计划必须覆盖全部原玩法条目并保持角色依赖。动态 SVG/WAV 渲染使用已有媒体模块；文件检查与最终游戏媒体使用观测分开。正常输入截图、媒体实际/期望记录和固定源码进入独立评审。单次协议纠错、单次有界任务修复均沿用原额度、时限和历史；修复按失败 taskId 查找原任务，已通过上游不重新调用。
- 一组聚焦离线命令通过 61 项；随后新增 public status/stop、确认复用的 public resume、缺少执行前置时禁止访谈计费/正式计时、intake 持久回执恢复和链接安装 bin 入口检查。共 66 个不同离线检查通过；最后受影响的 CLI 与 session 两个套件 16 项通过，session 与 runtime entrypoint 的 16 项也通过。未改的旧恢复、媒体和调度证据按既有记录复用。`npm run typecheck` 与最后一次严格 `npm run build` 通过。

```text
node --experimental-strip-types --test --test-reporter=spec tests/cli/*.test.ts tests/roles/interview.test.ts tests/roles/stage-requirements.test.ts tests/roles/budget.test.ts tests/runtime/intake.test.ts tests/runtime/entrypoint.test.ts tests/runtime/entrypoint-host.test.ts tests/runtime/entrypoint-media.test.ts
node --experimental-strip-types --test --test-reporter=spec tests/cli/control.test.ts tests/cli/session.test.ts
node --experimental-strip-types --test --test-reporter=spec --test-name-pattern="missing execution prerequisites" tests/cli/session.test.ts
node --experimental-strip-types --test --test-reporter=spec tests/cli/session.test.ts tests/runtime/entrypoint.test.ts
node --experimental-strip-types --test --test-reporter=spec tests/cli/cli.test.ts tests/cli/session.test.ts
```

- root 单独安排的一项真实 production-host smoke 也通过，命令为 `node --experimental-strip-types --test --test-reporter=spec tests/runtime/entrypoint-host.smoke.ts`；该文件不被默认 `npm test` 发现。它从编译后的 host 运行真实受控 tsc/Vite 子进程、Edge runner 和 registry，测试 19.59 秒，模型/API 请求为 0。浏览器为 Edge `153.0.4234.48`，1280×720，10 个回放/观察步骤通过，浏览器进程退出已确认。
- 通过证据保存在当前工作区 `.cosmos/cos18-host-smoke/3e6b6f21-2d93-4509-915b-03c4fbe31451/smoke-report.json` 及对应 browser/media 报告、`001-ready.png` / `003-clicked.png`。报告明确 `generatedByCosmos: false` 和 `test-only media observations`：通用模板 fixture 的计数只证明生产进程、browser、观测结构与 registry 桥接，不能证明新的运行时游戏、美术或音频已经生成并验收。COS-04 的实际媒体探针保持独立版本和证据。
- 第一次 smoke 在构建时发现工具链复制错误地排除了依赖包自己的 `dist`；修为仅排除模板顶层 `dist` 后重跑上述单项通过。失败证据目录 `2d55d21b-09d1-4656-bbd8-0b2f86f34e45` 保留。没有重跑旧媒体 suite、旧 pilot/trial 或付费服务。
- 当前 host 支持鼠标、图层 SVG 和合成 PCM 的有界需求；完整经典基准仍缺 COS-14 的可信适配，不减少原基准内容。运行时只读媒体计数仍须由独立评审核对真实 Phaser 事件并结合正常输入截图；听感和视觉辨识未被计数或 fixture smoke 证明。
- `resume` 只支持原窗口内、无持久停止的可核实中断。手动 hard stop、预算或时限停止不自动恢复，CLI 暂无用户追加时间/额度的续跑入口，因此不声明 R15 全部续跑体验完成。上游修复不会静默改绑已经固定的下游依赖；Phase C 为满足条件的未启动下游创建显式继任任务，旧 B 单任务修复计划仍保留原语义。COS-18 整体验收、真实生成及 G3 状态仍由对应后续证据决定。

## 8. Phase C：未启动下游的显式继任

root 已批准只为受修复上游影响、从未启动的下游建立新任务，保留原任务、原 native plan、原 allocations 和失败记录。全组共用原账本与截止时间；仅最初失败任务消耗一次 semantic repair。硬停止的加时/加钱续跑不在本阶段范围。

### C1：纯计划与资格边界

- 新增 `src/runtime/entrypoint-successors.ts`，只产生有限 design/art/coding DAG 的计划数据，不派发、写 journal 或登记预算。`findUnstartedSuccessors` 要求下游处于未启动或仅因原依赖失败而等待，且没有 attempt、request、artifact、evidence 或 review 记录；原计划/验收发生漂移即拒绝。
- `allocateRepairGrants` 仅按涉及角色原分配权重拆分原未分配金额，使用整数 micro-CNY，旧 allocations 不变。默认剩余 ¥36 在 design 修复场景分别分为 ¥6.75、¥11.25、¥18；任何成员无法获得正 grant 时整组阻塞。
- `buildRepairContinuation` 复用 `createLinkedRepairTask`，为其余未启动任务产生新的 task/author/context ID、固定输出版本和显式 replacement map。准确替换上游依赖、inputs 和 interfaces 的旧版本；原目标、验收与写入范围保留。来源版本不明确、输出覆盖旧位置、预算/停止/unknown/原时限不满足均拒绝。
- 17 项轻量测试先红灯后通过，命令：`node --experimental-strip-types --experimental-test-isolation=none --test --test-reporter=spec tests/runtime/entrypoint-successors.test.ts`。仅使用内存契约和假数据，没有 child process、renderer、browser 或 API 调用；`npm run typecheck` 通过。
- C1 尚未接入生产执行。后续边界仍须完成：write-once 组计划的加载与校验、原始失败产物/诊断快照、journal origin 的安全准备、原子 group 注册、恢复和只读 effective/superseded 投影。不得仅凭本段纯函数测试声称下游已可恢复或 Phase C 完成。

### C2：持久组计划与一次登记

- `prepareRepairContinuation` 核对原 native plan、确认需求、原时间/账本身份、固定 replacement map、整数 grant、原任务与新任务契约。复用原 `TaskJournal` 校验来源；受影响旧下游不得已有作者写入、输出或阶段回执。修复原产物或 UTF-8 原始诊断必须存在，并绑定原 task/attempt/session/inputs 和可信失败反馈；开始修复前原文件与快照字节不符会阻断。
- 先发布 write-once `repair-plan.json`，再安全补齐尚未登记的新 origin，最后通过原 `RunController.registerTasks` 一次登记全组。plan-only、部分 origin 和完整登记边界均恢复原映射，不重复分配。部分组登记、已登记任务丢失 origin、已有不明回执均保守阻断；不会合成 author/capture/verify/review 回执。
- 最初 10 项文件/持久化测试确认缺少接口的红灯，完成后扩至 19 项通过；与 C1 合计 36 项轻量检查通过，命令：`node --experimental-strip-types --experimental-test-isolation=none --test --test-reporter=spec tests/runtime/entrypoint-successors.test.ts tests/runtime/entrypoint-continuation.test.ts`。使用临时目录、假数据与实际快照/journal；没有子进程、浏览器或 API。`npm run typecheck`、`git diff --check`、UTF-8/LF 与中文复读通过。
- C2 仍未接入公开运行。生产 host 的确定性诊断写入、entrypoint 新旧 repair-plan 分支、effective/superseded 状态以及 design/art/coding 执行和阶段中断测试由下一段完成。旧 B repair-plan 不迁移或回收 grant，硬停止语义不变。

### C2 独立审查修复

- reviewer 发现修复已开始后仅检查 raw 副本的 UTF-8，无法识别其内容改变。新增 `sealRepairDiagnostics`，首次发布组计划前只为 manifest 和它列明的 raw 副本绑定 SHA-256；已有 plan 或已登记后不能重新封存。每次恢复均检查这些固定签名；可编辑作者工作区的字节比对仍只在修复零 attempt 时执行。
- 合法 ready→running 后修改 raw 或 manifest 的两项回归先红灯后通过；正常修改作者工作区不妨碍恢复。C1/C2 合计 39 项通过，类型与 UTF-8/LF 检查通过。顺手移除 fixture 的多余 EOF 空行，没有改执行器或账本。

### C3：生产接线与组执行

- `entrypoint.ts` 使用生产 host 的 `continuationTargets`，先评估全组原额度/时间，再构造固定版本、封存诊断、登记组并调用原 `resumeTaskDag`。已过祖先只核验证据；所有实际请求仍进入同一 ledger。formatVersion 2 计划恢复同一组，新 child 失败不会再次触发 semantic repair。旧 B 未带版本的单任务计划保留原分配与恢复行为。
- `entrypoint-host.ts` 在 capture 内只把确定性缺文件、合法 UTF-8 的 JSON/schema/媒体清单错误转为 `HostFailure`；原字节、缺失事实、task/attempt/session/inputs 与诊断先写入私有固定副本。编码不明、外部 IO、缺可信证据仍阻断。无效产物不会登记成合格 asset，也不产生 gameplay pass。
- 最终 `host.finish` 接收明确映射后的完整有效 DAG；报告与只读 status 通过 `supersededBy` 展示继任关系，原任务终态、费用与证据保持原事实。plan-only 显示待登记，部分登记或无法识别的 lineage 显示阻断，读取状态不写快照。
- 新增 11 项集成检查，使用实际 controller、scheduler、journal、registry 和假模型/build/browser 回调：design/art/coding 修复，固定 v2 下游，原祖先不重付，capture 后可核实中断，verify/review 缺回执阻断，successor 失败无第二次修复，未知编码不授权，缺文件保存原始事实，以及旧 B 计划兼容。每个完整三角色场景费用为 80 micro-CNY 的假调用记录，恢复不增加费用或调用；不代表真实模型价格或游戏效果。
- 命令 `node --experimental-strip-types --experimental-test-isolation=none --test --test-reporter=spec tests/runtime/entrypoint-group.test.ts` 的 11 项通过；受影响的 host、entrypoint、control 19 项也通过。仅使用临时目录；没有真实浏览器、编译子进程、API 或旧 trial 调用。原 B 进程桥接 smoke 继续按原版本复用。
- 这段仍需独立审查；COS19 的已审核 role IO/输出上限变更合入后再执行最终组合检查。硬停止续时/加钱、真实生成/G3 与用户最终试玩均未由这些离线测试完成。

## 9. Phase D：用户决定后的 continuation

- **D1（本批）：只读报价。** 公开 `cosmos continue <root> --quote --add-cny <金额> --add-minutes <分钟>`，仅接受已经持久停止、费用无未知/预留的正式 generation 快照。显示原身份/需求/revision、原费用/上限/截止/停止原因、未完成任务、拟追加资源、待核实的 allocation 关闭明细和有限新增尝试。quoteId 绑定准确快照、参数与固定继任映射来源；输出始终是 proposal，不构成确认、收敛证明或激活。没有模型调用、owner 锁、快照写入或计时变化。金额按整数 micro-CNY；0 元可表达仅加时间，追加分钟必须为正。D1 提案输入暂限追加不超过 ¥200、12h，原 ¥200/12h 字段不变。
- **D2（后续独立审查）：明确授权与原子窗口。** 真实 caller 提供准确 quote 的确认；核验原 writer/子进程收敛、费用对账、固定证据及 grant 关闭条件后，才在同一权威快照追加授权、关闭记录和一次激活的执行窗口。保留原 run/ledger 身份、原时间/额度、历史请求/任务与停止事实；不复活旧 controller signal。新增实例只使用获批窗口。普通 resume 不清硬停止，陈旧报价、重复释放或丢失证明必须拒绝。
- **D3（后续独立审查）：有界继任与交付阶段。** 复用固定已过证据；未完成任务按明确新增尝试额度建立可追溯继任，保留历史 attempts 和原上限未达标事实。最终系统交付与用户试玩等待分开，只有真实用户决定能确认体验通过。原 ¥200/12h 成绩与追加后的结果分别报告。
- D1 只改 CLI、新增只读模块、测试和使用文档；不修改 ledger/controller/contracts 或失败 probe。validation/intake 不提供此入口，旧验证总账本/截止/一次性失败记录均不变；未来新验证窗口仍需新的明确授权。
- 先写公开 CLI 红灯测试，再实现最小解析与只读 proposal；验证 snapshot 字节/mtime、历史、目录内容不变，host/provider/owner-lock 从未调用。覆盖参数边界、目标与 grant 明细、陈旧 basis、scope/format/停止/unknown/reserved 拒绝，以及 `continue` 不能静默进入 `resume`。
