# COS-06 本地运行与共享预算

`src/runtime/run.ts` 导出 `RunController`。这是可信本地控制器的程序接口；COS-07 负责后续角色调度和 SDK 适配。它不直接调用模型、不生成游戏专属实现，也不读取凭据。

## 存储与运行身份

每个运行使用调用方明确提供的绝对 `root`，写入只发生在该目录。`snapshot.json` 同时保存版本、修订号、COS-02 运行清单、共享账本、任务合同及其尝试记录、请求派发记录、事件和停止原因。返回值是副本，修改副本不会改写运行。

控制器使用独占 `.controller.lock`，拒绝同一运行的第二个控制器。所有方法的读写经过同一队列；快照先以 UTF-8 写入独有临时文件并同步，再原子重命名。运行与账本不会分成两个可能只写完一个的文件。未完成的临时文件不能覆盖正式快照，损坏的正式快照直接拒绝打开。写入失败会中止控制器的 `signal` 并禁止继续付费。

正常关闭调用 `close()`，随后 `open({root})` 读取相同运行。`create()` 拒绝覆盖已有记录。重开保留原起点、原截止时间、额度、费用、任务尝试和闭合请求；已取得派发许可却没有持久响应的请求转为 `unknown`。

进程异常退出可能留下所有权文件。当前版本不自动抢占：须由可信操作者确认原控制器和其子进程均已退出，再仅移除该运行目录内的 `.controller.lock` 后打开原快照。不能通过重建运行、删除账本或增加截止时间恢复。COS-12 负责更深入的崩溃监督；本实现不声称提供断电后的文件系统事务或防止同一操作系统用户恶意篡改文件。

## API

```ts
import { RunController } from '../../src/runtime/run.ts';

const controller = await RunController.create({
  root: 'E:/runs/validation',
  runId: 'validation-1', ledgerId: 'validation-shared',
  kind: 'evaluation', specVersion: 'confirmed-v1', scope: 'validation',
  allocations: [{ taskId: 'all-probes', amountMicroCny: 150_000_000 }],
});
```

- `create(options)` 固定原起点与时限。验证总额默认 150,000,000 micro-CNY，正式生成默认 200,000,000；允许指定更低上限。时限默认 12 小时，可缩短。1 元等于 1,000,000 micro-CNY，所有金额必须是安全整数。
- `open({root})` 重开；`read()` 导出完整结构；`summary()` 导出身份、原时限、已结算、预留、未知请求、余额、80% 警告与停止原因。
- `reserve({requestId, taskId, provider, pricingVersion, estimatedMaxCostMicroCny})` 原子预留已知最高费用。未知价格、缺少计价版本、重复请求 ID、总额不足、任务分配不足、未对账请求或已停止运行均会阻止预留。
- `admit(requestId)` 在真实供应商请求前持久记录派发意图，再核对时限。必须立即派发，不能缓存许可后再调用。每次模型调用、工具循环、压缩、重试与资产请求分别使用唯一请求 ID；不能因复用 SDK 会话而略过准入。
- `settle(requestId, actualCostMicroCny, evidence)` 根据证据结算，释放未使用预留，返回 `{halted}`。证据是 COS-02 `ArtifactReference[]`。已闭合请求不可改写。
- `markUnknown(requestId, evidence)` 保留预留并阻止所有新付费准入，直至核对供应商结果或账单。超时、已发送后的网络断线与中止不代表免费。
- `cancel(requestId, evidence, {provenNoCost: true})` 只允许取消尚未派发的请求，或可信适配器已经证明无费用的请求。派发后仅有取消信号不足以释放费用。
- `importSettled({requestId, taskId, provider, pricingVersion, actualCostMicroCny, evidence})` 导入此前费用。同一请求 ID、金额与来源重复导入不累计；冲突则拒绝。该方法只记录已经发生的费用，不授权派发。导入后超额同样停止。
- `saveTask(task, actor)` 保存 COS-02 任务合同，包括尝试、会话位置、证据及交接。初次登记由可信 `system` 调用；后续使用合同的作者／评审权限、状态迁移和历史保护校验。`actor` 不能从模型输出获取。
- `stop(reason)` 停止新派发，释放未派发预留，将在途请求保留为未知；`signal` 用于中止可取消的供应商调用。停止不删除产物或任务。调用方仍负责停止子进程与保存工程。
- `close()` 排空已排队操作并释放所有权。异常停止后的结算与对账仍可保存，但当前 API 没有延时、加额或解除硬停止的入口。

## 共享额度与异常结算

验证探针必须重开同一个验证 `root` 和账本；所有角色、重试、美术、音频及云服务使用其中的任务分配。任务分配之和不能超过共享总额。已结算加全部预留共同限制准入，未知请求的预留已包含在该总额，不能重复相加或当作退款。

部署验证账本时，调用方通过 `importSettled` 一次导入此前保守费用 **721,771 micro-CNY**，使用固定请求 ID，并引用 `probes/2026-10-01-deepseek/README.md` 对应的固定来源版本。控制器没有把此项目历史费用写死为新运行默认值。正式生成的 ¥100／6h 仅是优化目标，不触发停止。

预留达到 80% 时追加一次 `budget_warning` 事件，供命令行和编排器展示。额度不足时拒绝新增请求，已经预留的请求可以消费自己的许可；结算释放余额后可继续使用剩余额度。到原截止时间时，定时器和每次准入检查都会停止工作，并保存 `waiting_user` 与原因。等待、暂停与重开都不延长时限。

供应商实际费用高于预留时，保存真实费用并设置 `charge_overrun`，永久禁止新 `reserve/admit`。`settle` 在保存成功后返回 `{halted: true}`，不会因金额超额让适配器误认为结算失败。仅在明确停止的该异常快照中，容忍 COS-02 的 `budget_exceeded` 与 `allocation_exceeded` 两种金额结果；其他结构、身份、证据错误仍拒绝。重开保持停止状态。

## SDK 接线

`beforeRequest` 中依次 `await reserve(...)`、`await admit(requestId)`，任一失败都不能发出供应商调用。将 `signal` 接入请求的取消信号。`afterResponse` 根据结果调用：有账单 `settle`，已经发出但费用未知 `markUnknown`，已证明未发送 `cancel(..., {provenNoCost: true})`。未知状态只能通过证据结算或证明无费用后关闭；重试用新 ID 且仍走同一账本。

证据引用需要调用方去除凭据并核实来源，本层只检查结构及历史一致性。原始模型对话、API 密钥与供应商鉴权头不应写入任何字段。

## 离线验证

```text
node --experimental-strip-types --test tests/runtime/*.test.ts tests/budget/*.test.ts
npm run typecheck
npm run build
```

测试覆盖并发预留、多个服务共享额度、80% 警告、未知费用、取消条件、准确截止边界、写入跨越截止、定时中止、重开、单控制器、未完成临时文件、替换失败、账本一致性、既有费用幂等导入、实际费用超预留、中文任务及尝试历史、默认硬上限和优化目标。
