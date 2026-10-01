# Cosmos 执行契约 1.0.0

本目录把 [规范第 4 节](../specs/cosmos-spec.md) 与 [COS-02 字段草稿](../specs/cosmos-issues.md) 固定为可交换记录。适用平台开发、游戏生成和能力评估；没有网络、付费调用、文件写入或持久化实现。

## 文件与校验入口

| 记录 | Schema | TypeScript 校验 |
| --- | --- | --- |
| 已确认需求与验收条目 | `schemas/requirement.schema.json` | `validateRequirement` |
| 最小上下文包 | `schemas/context.schema.json` | `validateContext` |
| 带归属、版本及依赖的产物 | `schemas/artifact.schema.json` | `validateArtifact` |
| 带来源与产物版本的证据 | `schemas/evidence.schema.json` | `validateEvidence` |
| 任务、尝试、交接与独立评审 | `schemas/task.schema.json` | `validateTask` |
| 共享预算账本 | `schemas/ledger.schema.json` | `validateLedger` |
| 运行清单 | `schemas/run.schema.json` | `validateRun` |

公共字段在 `schemas/common.schema.json`。Schema 使用 Draft 2020-12；`$id` 是离线解析标识，不需要访问网络。所有对象拒绝未声明字段。Schema 负责字段结构，TypeScript 校验负责状态、版本对应、证据、费用及记录间关系。只通过 Schema 不代表验收通过。

从 `src/contracts/index.ts` 导入 API。校验函数返回 `{path, code, message}[]`，空数组表示满足该层约束；不会修改输入。`validateExecution({requirement, task, ledger, run})` 继续核对共享身份、已确认验收步骤、原截止时间及费用。`validateTaskInputs(task, availableReferences)` 核对实际读取的版本与位置，不能用 `latest`、可变分支或省略版本代替固定快照。

## 任务与独立评审

任务必须记录 `taskId`、`kind`、`runId`、`specVersion`、`acceptanceIds`、目标、依赖及所需状态、输入版本与位置、上下文规则／接口／已知失败／工具、读写路径、输出类型／schema／目的地、验收步骤／期望／证据目的地、预算、状态、持久尝试记录、会话引用、产物、证据、交接与评审。

每个验收 ID 都必须有对应步骤与期望。通过的任务必须有固定版本产物、覆盖每个验收 ID 的通过证据和独立评审。证据记录来源产物的 ID、版本和位置；文本“完成”不能替代该记录。评审固定输入和输出快照，`reviewerId` 不得是作者，评审 `contextId` 不得等于作者上下文。

`validateTaskUpdate(previous, next, actor)` 检查迁移、不可变字段与作者／评审权限。`actor` 必须由可信运行时根据实际身份提供，不能从模型输出读取。即使作者在 JSON 中冒填他人的 `reviewerId`，作者身份也不能写入批准结论。该函数不是身份认证服务。

| 当前状态 | 可迁移到 |
| --- | --- |
| `not_started` | `ready`、`waiting_user`、`cancelled` |
| `ready` | `running`、`waiting_user`、`cancelled` |
| `running` | `awaiting_review`、`failed`、`waiting_user`、`cancelled` |
| `awaiting_review` | `passed`、`needs_changes`、`waiting_user`、`cancelled` |
| `needs_changes` | `running`、`waiting_user`、`failed`、`cancelled` |
| `waiting_user` | `ready`、`running`、`awaiting_review`、`needs_changes`、`failed`、`cancelled` |
| `passed`、`failed`、`cancelled` | 终态；后续工作新建关联任务 |

状态不变时仍检查记录更新。进入可执行或后续执行状态必须满足依赖。等待、取消、失败必须记录原因。重做保留历史证据和尝试；完成的尝试不可覆盖，运行中的尝试只允许补充结果。失败分类为 `code_defect`、`external_service`、`requirement_conflict`、`insufficient_evidence`，包含复现步骤、实际及期望结果。

## 预算与恢复

金额统一使用非负安全整数 **micro-CNY**，1 元 = 1,000,000 micro-CNY。不要把浮点元金额直接交给校验器。

| 约束 | 值 |
| --- | --- |
| 各能力探针共享验证额度 | 150,000,000 micro-CNY（¥150） |
| 单次正式生成硬上限 | 200,000,000 micro-CNY（¥200） |
| 原始硬时限 | 12 小时 |
| 预警线 | 已结算 + 预留达到总额的 80% |
| 优化目标 | ¥100 / 6 小时；不触发硬停止 |

子任务额度是共享总额内的分配。总分配不得超额，每个任务的请求已结算与在途预留合计不得超过其分配。账本请求保留 `requestId`、`taskId`、供应商、计价版本、预留、已结算、未知标志、状态和对账证据。

- `reserved`：正数预留，尚未结算。
- `unknown`：请求状态不明，继续保留正数预留。先对账，不能盲目重试。
- `settled`：结算完毕，预留归零，保存账单或结果来源。
- `cancelled`：确认无费用后关闭，预留归零且保存取消证据。有费用的请求应结算。

`budgetSummary` 接受已通过校验的账本，返回已占用、可用、预警、耗尽和需对账标记；它不授权付费请求。并发原子预留、未知价格阻断、到时／到额停止及供应商对账由 COS-06 实现。已有直接 API 探针的保守费用 ¥0.721771 应在 COS-06 导入同一验证账本，样例中的虚构供应商记录不代表真实费用。

账本更新只能由可信预算服务发起。`validateLedgerUpdate` 禁止删请求、降低已结算费用、改变原账本 ID／上限、改写供应商计价版本或释放未知费用预留。结算时可根据证据释放未使用的预留。`validateRunUpdate` 固定运行 ID、账本、初始起点和原截止时间，保留产物、任务和人工决定历史；恢复或更名不产生新额度。

## 版本与实施边界

`contractVersion` 是记录格式版本，`specVersion` 是用户确认的需求版本，产物 `version` 是不可变快照版本。三者不可混用。1.0.0 不做宽松字段忽略或原地迁移：格式变化先更新 Schema、类型、校验、样例与测试；破坏性变化发布新的主版本。历史记录保留原格式并显式转换。

同一任务的验收 ID、步骤、期望、输入版本、归属路径和预算不可修改。用户批准的范围调整应形成新需求版本和关联任务，并保存决定证据。新增额度／延时需要另行明确用户授权及后续版本的可审计扩展；本版本不提供修改原硬上限或截止时间的接口。

上下文只存必要规则、接口和失败记录。凭据与完整对话没有合法字段，详细会话通过 `sessionRef` 按需检索。调用方仍须在填入字符串前脱敏；结构校验不能证明任意文字不含秘密。文件实际存在、来源真实性、工具权限、路径隔离及运行时状态同步由消费方核实。独立评审必须读取真实的固定快照。

## 验证与样例

在仓库根执行：

```text
node --experimental-strip-types --test tests/contracts/*.test.ts
```

`examples/valid/` 包含七种合法记录和已批准任务；`examples/invalid/` 包含缺少输入版本、空验收 ID、无证据通过、自审、超额以及非法迁移样例。非法迁移需要 previous / next 和可信 actor，不能仅靠单份 Schema 判断。样例由测试逐项校验，不涉及付费 API。
