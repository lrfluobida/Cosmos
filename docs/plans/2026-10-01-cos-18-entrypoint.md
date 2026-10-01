# COS-18 CLI entrypoint implementation plan

**状态：** 架构提案，等待 root 确认；尚未修改运行代码。基线 `0a10f4230c312cc9874be0e6499fd784b3ceba9c`，分支 `feat/cos-18-cli`。

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
- **待 root 确认的停止语义：** 现有 `RunController.stop` 是持久终止；`resumeTaskDag` 遇到任何 stopReason 都拒绝派发。因此默认建议保留该语义：resume 可恢复未持久停止的崩溃运行，手动停止/硬截止返回原状态与具体拒绝原因。若本次要求“stop 后显式 resume 继续”，需另行批准一个仅针对本 CLI 手动停止的窄恢复接口；它只能在原截止未到、费用已对账、旧 owner 已收敛时追加用户续跑决定，保留旧停止事件和全部 task/attempt 终态，不重置时限或修复次数。该接口不能解除 deadline、charge_overrun 或旧 trial/pilot 的停止，也不能把已有 cancelled task 改回运行；无法由原恢复/修复契约继续时仍阻塞。此项未确定前不修改 run.ts 或既有恢复判定。
- 不把模型凭据交给游戏/构建进程、控制消息、草稿或日志；继续使用现有白名单子进程环境和可信参数数组。复用已经通过的源码与资产快照，输出交付位置、同版本客观报告和待用户体验确认状态。

## 4. 文件归属与共享 core 边界

| 文件 | 计划职责 |
| --- | --- |
| `src/runtime/intake.ts`（新增） | 独立 intake 快照校验、有限访谈记账、同文件一次性激活；复用 BudgetLedger 纯函数和 SnapshotStore，不执行游戏 DAG。 |
| `src/roles/provider-budget.ts` | 仅抽出最小账务接口类型，供 intake 与现有 RunController 使用；保留已审核的 receipt、价格与并发记账实现。 |
| `src/runtime/run-types.ts`、`src/runtime/run-validation.ts` | 若采用 A，仅新增 `generation_activated` 事件类型/校验；不改变旧 v1 RunManifest 的必填项、时间限制或更新规则。 |
| `src/roles/interview.ts`（新增）、`src/roles/requirements.ts` | 无生成工具的 native design 访谈、草稿修订/确认绑定；保留现有 host-supplied API 兼容。 |
| `src/cli/index.ts`、新增 `src/cli/session.ts`、`src/cli/control.ts` | 参数、stdin、当前草稿展示、host 启动与运行控制；默认生产适配器，测试显式注入假 provider/host。 |
| `src/runtime/entrypoint.ts`、`src/runtime/entrypoint-host.ts`（新增） | 薄层装配既有规划/执行/恢复/修复；host 固定模板、工具、角色归属、验收/产物版本及交付。 |
| `tests/runtime/intake.test.ts`、`tests/roles/interview.test.ts`、`tests/cli/session.test.ts`、`tests/cli/control.test.ts`、`tests/runtime/entrypoint.test.ts`（新增） | 账本转换、真实 stdin/命令控制、动态确认和适配器接线的离线故障测试。 |
| `docs/development/quickstart.md`、`docs/development/roles.md`、本计划 | 支持范围、命令、阶段/计费/停止语义和验证证据。 |

当前建议不修改 `src/runtime/run.ts`、`src/runtime/scheduler/`、`src/runtime/orchestrator.ts`、`src/runtime/recovery/`、`src/contracts/` 或 `probes/e2e/`、trial 驱动。若读取中发现实现必须触及这些边界，先向 root 报告具体接口与理由，不以接线为由重写已审核逻辑。必要的预算接口优先复用纯函数；不复制完整执行器。

## 5. 实施与离线验证顺序

- [ ] root 确认 A 的阶段转换与 stop/resume 语义，固定共享 core 归属；再开始代码实现。
- [ ] 先写 intake 测试并确认失败：已计费/unknown 持续、拒绝在途激活、一次性真实时钟激活、旧 v1 拒绝激活、并发激活、提交前后崩溃与重复打开。实现薄层后执行 `node --experimental-strip-types --test tests/runtime/intake.test.ts tests/roles/budget.test.ts tests/runtime/run.test.ts tests/runtime/recovery/receipts.test.ts tests/runtime/recovery/snapshot-crash.test.ts`，期望全部通过且零 provider 网络调用。
- [ ] 先写访谈与 CLI 测试并确认失败：两个不同 brief、正常 stdin 回答、当前修订号确认、缺答/拒绝/EOF、改稿使旧确认失效、伪造确认字段被拒、unsupported 验收、环境未就绪不激活、生成前置缺失不调用。实现后执行 `node --experimental-strip-types --test tests/roles/interview.test.ts tests/cli/session.test.ts tests/cli/cli.test.ts`。
- [ ] 先写 host/控制接线测试并确认失败：状态读取不取得写锁、不改变 snapshot；正确 runId 的 stop 等待 drain，错误身份/陈旧通道拒绝；崩溃恢复同计划同费用同时间；已停止/过期的原运行不被重开；冻结验收作者不可写；费用/unknown/history 连续、秘密不进入子进程或输出。实现后执行 `node --experimental-strip-types --test tests/cli/control.test.ts tests/runtime/entrypoint.test.ts`。
- [ ] 接通现有角色、registry、host 验收和交付，保留独立评审及固定版本。仅重跑受接口变化影响的角色预算/恢复/调度契约测试，再依次执行 `npm run typecheck` 与 `npm run build`；不要与真实浏览器 fixture 并发写构建目录，不为接线重跑真实生成或既有媒体/浏览器验收。
- [ ] 更新使用文档，逐文件复查 UTF-8、原换行与中文；执行 `git diff --check`。按可审查边界提交，给独立 reviewer 精确 SHA、命令输出和已知限制。root/merger 负责后续集成；离线结果不能标记 COS-10 游戏通过、COS-11/13 live 通过或 G3 通过。

本轮只准备此计划，不调用模型或运行测试。任何新增真实验证仍需要独立满足既定预算/门禁，旧已过期记录保持原状。
