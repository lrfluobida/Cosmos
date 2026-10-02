# COS-20 V1：独立开发验证权限

源码 `d46294d3d710da98052fa5a4a403a2029bff2d13` 已获独立 `V1_SOURCE_READY`，合入 `43f3ba5`；主线代表检查 5/5、严格构建通过。本步仅权限与记账层离线集成，执行 driver 尚未接通，不是付费准入或原生生成通过记录。测试使用真实 controller、临时文件、模拟 identity/clock/费用；没有调用模型 API、浏览器或真实验证账本。

## 固定边界

`formatVersion: 3` / `operator_validation` 使用原 SnapshotStore、runId、ledgerId 和真实 ledger `1.0.0`。原 150 元上限、全部旧 allocation、费用、任务、事件、起止时间保留。旧 deadline 到期但 stop 为空时，claim 同次提交追加真实当前时间的 deadline stop，原 run 保持 waiting_user。没有 humanDecisions、模拟 confirmedBy 或第二账本。

case 限额为实际加预留增量 5 元、45 分钟、40 个请求、至多一次语义修复；所有历史实际加预留仍受首批累计 30 元及总 150 元约束。五个固定 grant 为 planning/design/art/coding/repair：2/1.9/5.7/7.6/3.8 元，仅占原未分配额，不关闭旧 allocation。达到金额或次数限制时拒绝新请求；不伪造 budget stop。真实超额账单保留并记录本 case 的 charge_overrun。

## 给 V2 的接口

- `prepareValidationCase({root, repositoryRoot, declaration, identityReader, now?, signal?, identityTimeoutMs?})` 返回只读 proposal。quote 绑定原 snapshot bytes、revision、固定声明、源输入 hash 和 reviewedPlatformSha。
- `RunController.claimValidationCase({...context, quote, decision})` 在原独占锁内原子追加 operator 来源、case/window 和五个 grant。决定来源 JSON 必须逐字段等于 `{formatVersion:'operator-validation-decision-1', kind, decisionId, actorId, decidedAt, sourceRefs, quote}`。`decision.source` 指向 ledgerRoot 内该文件；记录其 SHA256。真实 coordinator 负责收集来源，普通文件匹配本身不证明人类确认或源码已经评审。同决定返回原 window/clock，不重新消费；接口不返回执行器。
- `RunController.openValidationCase({...context, caseId, windowId, accountingOnly?})` 显式取得新实例。`requireValidationCase(caseId, windowId)` 是无写入执行门槛；`validationAuthority(taskId, purpose)` 返回该 grant、输出 cap、四层剩余额度、请求数、执行/付费可用状态。`validationCaseView(snapshot)` 只读分列 original 与 validationCase，不到期落盘或授予权限。
- `RequestInput.validation` 必须来自实际 PiRequest 的 `caseId/windowId/purpose/modelId/maxOutputTokens/inputBytes/hasImages`。purpose 为 planning/author/reviewer；所有 compaction、修正和重试同样计费计数，没有免费分支。planning 使用真实专用 request/grant，禁止伪造 planning TaskContract。
- 保守预留最低为 `(hasImages ? 1_000_000 : inputBytes) * 2 + maxOutputTokens * 8`，沿既有 DeepSeek 配置。planning 4096、design/reviewer 16384、art/coding 65536；输出 cap 与预留一同核对。已知并发预留可以并存，unknown 阻断后续 paid/owned-child admission。
- `claimValidationRepair({sourceTaskId, feedback})` 一次绑定当前 case 的 code_defect failed 或 changes_requested 来源及已结束 attempt。feedback 版本须为该 attemptId，引用须已出现在失败/评审记录。新 repair task 固定 ID、原验收、不同 author/context、一次 attempt；旧 source 不重开。core 验证固定引用关系，V2 在其 artifactRoot 验证反馈文件及 provenance，不能把仅有引用当通过证据。

identityReader 必须真实、只读且不回调 controller。claim/open/reserve/admit 独立检查 reader 与声明内源文件；每次最长 5 秒，并保留 5 秒窗口清理余量。返回后再核 deadline/AbortSignal，超时或晚到结果不能派发。实际 Git HEAD/dirty/模板完整文件集合核验归 V2 reader；本模块不运行 Git 或猜测未声明文件。

## 所有权与恢复

SnapshotStore 遇现存 `.controller.lock` 一律拒绝，沿原 OwnerLock.close/recover 逐一确认 children 退出；未知 spawn intent 保留锁。不依据旧 attempt 文本猜测进程状态。额外 registry 检查只覆盖 `ledgerRoot/registry/.commit.lock`；它不证明任意旧 probe artifactRoot 的 registry 已关闭。新 case 不复用或改写旧输出，V2 管理新固定 artifactRoot 的 registry owner。

执行打开会把已 admit 但无 durable 对账结果的 reservation 保留为 unknown。过期/停止 case 仅可 `accountingOnly:true` 打开并对账已有请求；仍核 identity/source，但不要求执行剩余时间。该实例 signal 永久失效，执行门槛、task/attempt 写入、reserve/admit/owned child 均拒绝。普通 open、generation view/binding、旧 planner/control/SDK、scheduler/orchestrator 的旧入口拒绝 profile 3；未在本步接通原生管线。

## 离线证据

- 本文件对应候选：27 个无子进程定向检查通过（19 个顶层、8 个子用例，0 skipped）。命令：

  `node --experimental-strip-types --test --test-name-pattern="operator claim|changed identity|explicit planning|every accepted|wrong case/purpose|expired case reopens|known reservations|closed owner|65k author|legacy planner|one semantic repair|finished author|bounded deferred|claim rejects stale|claim has one|identity is rechecked|unresolved old|wrong window or|unknown billing prevents" tests/runtime/validation-window.test.ts`

- 两个有界 Node 崩溃测试通过（2/2、0 skipped）：`node --experimental-strip-types --test --test-name-pattern="bounded process crash" tests/runtime/validation-window.test.ts`。仅 SYSTEMROOT 环境、隐藏窗口、10 秒上限；两个 child 均以注入 exit 71 退出并收到 close。原子写前 bytes 不变，恢复后首次消费；写后恢复同一 window/deadline，重试 bytes 不变。无真实费用。
- v1/v2 受影响代表 7/7、0 skipped：`node --experimental-strip-types --test --test-name-pattern="concurrent reservations cannot|honest overcharge|deadline timer aborts|persisted task attempts|one exact confirmation|explicit window refuses|new window overcharge" tests/runtime/run.test.ts tests/runtime/continuation-authority.test.ts`。
- `npm run typecheck` 首轮有 8 个局部类型收窄错误；将 throw helper 改为显式 function 后通过。最终 `npm run build` exit 0（6.775 秒）；`node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck --types node tests/runtime/validation-window.test.ts` exit 0（5.753 秒）。未重复旧完整 suite、旧实际进程组或浏览器 smoke。

V2 尚须接入真实 operator 输入、无假人确认的 validation requirement 类型、planner/roles/reviewer/correction/compaction metadata、真实 identity reader、session receipts、固定产物与本窗口停止/清理。reviewProtocolCorrections 的一次协议修正由 V2 驱动执行，本层所有实际请求计入同一个 40 次上限。本步不声称这些接线已完成。
