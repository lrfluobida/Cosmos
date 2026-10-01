# 续跑授权底层接口（D2）

本段只实现正式 generation 从已停止 v1 快照取得第一个追加执行窗口的底层能力。公开 CLI 仍只产生提案；D3 的确认交互、有效 DAG、原始 journal、产物复用、执行和交付接线尚未完成，不能据此声明 R15 完整通过。

## 授权与恢复

可信调用方先取得真实用户对完整 `ContinuationQuote` 的确认，保存 UTF-8 来源文件：

```ts
{
  formatVersion: 'continuation-confirmation-1',
  decisionId, actorId, decidedAt, confirmed: true,
  quote // 用户确认的完整、准确提案
}
```

`RunController.activateContinuation({ root, quote, confirmation, now? })` 中 `confirmation` 为 `{ decisionId, actorId, decidedAt, source: ArtifactReference }`。调用方负责真实用户身份与交互来源；模型输出的 `confirmed: true` 不构成可信调用授权。控制器要求来源文件与上述完整记录完全相同，并在窗口中固定来源 SHA-256。

该接口重新取得同一 `.controller.lock`，核对磁盘快照及原提案的全部输入、目标和分配。旧 controller 必须先关闭；旧进程崩溃时，使用已有 `SnapshotStore.recover`，原 owner 或已登记子进程仍存活、spawn intent 未解决时不允许恢复。激活不删除或绕过 ownership 记录。

一次原子快照提交同时记录用户决定、授权金额、新窗口、旧 grant 关闭和提案中的新 grants。返回 `ExecutionWindow`，不启动执行。没有持久 stop 但原 deadline 已过的 v1，会在同一次提交中追加原 deadline stop。提交前崩溃不产生窗口；提交后崩溃通过原 ownership recovery 找回已提交窗口。同一 `decisionId` 和原始确认重复调用返回原窗口及原 deadline，不重新计时或释放额度。

新实例必须明确调用 `RunController.open({ root, windowId, now? })`。原实例和旧 AbortSignal 永久失效。普通 `open({ root })` 拒绝 v2，现有执行入口不会自动选取新窗口。

## 版本和历史

- 快照升级为 `formatVersion: 2`，仅实际改变语义的 ledger 升级为 `contractVersion: '2.0.0'`，见 `schemas/ledger-v2.schema.json`。其余契约保持 `1.0.0`。旧客户端和 intake 拒绝新格式。
- 原 runId、ledgerId、开始时间、deadline、stop、任务终态、请求归属、费用和事件保留。原 run.state 保持 `waiting_user`；追加窗口使用自身 `stopReason` 表达执行状态。
- 原 ledger.limitMicroCny 保持原额；有效 cap 为原额加全部明确授权。历史 allocation 永不删除；占用额度为历史 grant 总和减一次性关闭的未用额度。关闭要求全部请求已对账，释放值严格等于 grant 减已结算费用，已发生费用永久累计。
- 原有 overrun 快照可照常读取，但当前 D2 保守拒绝其激活。新窗口的实际 overcharge 保留为账目事实，并停止该窗口，不覆盖原 stop。
- 当前 quote 只支持 v1；v2 上另一个新 decision 的再次追加被明确拒绝。同一窗口的重复决定、恢复与永久停止均已支持。

## 派发门槛

`executionAuthority(taskId)` 返回窗口 ID、deadline、有效 cap、task grant 和 admissionAllowed。新窗口的 reserve/admit 只接受已登记、处于允许执行状态的新 grant 任务；旧 task 不能借新窗口再次发出请求。请求 metadata 中的新 `windowId` 固定其归属，旧 metadata 保持原样。

`registerTasks` 仅接受准确提案中的新 ID、source objective、验收条目、ownership 和 grant，要求新 author/context 及空 attempt/evidence/artifact。`saveTask` 不能绕过首次登记，不能改写旧 source，每个新 target 最多一个 attempt。停止后只允许结束已有 attempt，不得另起 attempt。实际的依赖、输入、journal origin 和祖先验收复用仍由 D3 的正常校验链负责。

`prepareOwnedChild({ taskId, windowId })` 在 v2 必须有准确任务归属；未知、旧 task、未登记 task 均拒绝。`registerOwnedChild` 在到期时先保留 PID 以便清理，再拒绝放行启动屏障。当前窗口到期会持久停止；close/reopen 不复活其信号和计时。

窗口的 `verification` 明确区分已核验的 owner/账目/提案输入与 `artifactReuse: 'pending_task_validation'`。正常取消且已结束、费用已对账的 source，即使尚无 capture 证据，也可获准创建一个新 attempt；这不允许复用未验收的部分产物。仍在 running 的 attempt、unknown/reserved 费用、未收敛 owner/children 均阻断。

## 验证范围

定向测试使用真实 controller、临时目录、假时钟、模拟费用及本地 Node 子进程。覆盖准确确认、陈旧或改变的提案、并发锁、提交前后退出、一次性释放、旧信号、任务与子进程窗口归属、新窗口 deadline/overcharge/对账和 v1 兼容。没有调用真实模型、浏览器或验证账本；不构成真实生成或完整游戏验收证据。
