# COS-20 V1：开发验证窗口与记账

## 已批准边界

同一 SnapshotStore、runId、ledgerId 使用显式 `formatVersion: 3` 和 `operator_validation` profile。ledger 保留真实 `1.0.0` 结构与原验证上限；旧 grants、请求、费用、任务和事件不删除或改写。原 deadline 已过但 stop 未落盘时，仅在原子 claim 中追加真实 deadline stop，不回填时间。正式 generation v1/v2 不获得 validation 权限。

首个新 case 声明由独立 V2 作者维护，使用固定 `cos20-native-validation-1`、模型 `deepseek-flash`、planning 4096、design/reviewer 16384、art/coding 65536 输出上限。planning/design/art/coding/repair 的 grant 为 2/1.9/5.7/7.6/3.8 元，仅用原未分配额。新 case 实际加预留增量最多 5 元、45 分钟、40 个 provider 请求、一次明确语义修复；首批累计 30 元、共享 150 元保持不变。

## 接口与文件

- `validation-types.ts`：独立声明、operator 决定、quote、case window、请求元数据及 query 类型。
- `validation-window.ts`：免费 quote、持原 owner 锁的原子 claim、准确 operator receipt、source refs/hash 与可信 identityReader 校验。reader 只读且不回调 controller，最长 5 秒，并受窗口剩余清理余量限制。
- `validation-validation.ts`：profile、历史归属、预算/次数及 task/repair 校验。
- `run-types.ts`、`run-validation.ts`、`run.ts`、`execution-window.ts`：必要 formatVersion 门槛、显式 openValidationCase、统一记账队列、真实 AbortSignal 和 case 时钟；旧入口拒绝。
- 新增定向测试与 `docs/development/validation-windows.md`。不修改 driver、factory 或原 probe 常量；V2 作者拥有这些接线。按 root 批准，仅在旧 planner 与 control 各加一处同步 profile 拒绝，防止未接线入口先创建 session、socket 或产生 stop 副作用。

## 实施顺序

1. 先验证真实临时快照与固定源文件的 quote/claim 红灯：旧历史保留、actor receipt、错误/陈旧 identity、unknown/reserved、owner 及一次 claim/幂等。
2. 接入同一 controller：显式 case/window，planning 使用真实专用计费记录，不登记 fake passed task；新 task/repair 仅用声明中的 grant。
3. 在 reserve/admit 前限时重新读取 identity 与源文件，核对返回后的 deadline；所有实际请求共享次数/费用限制，旧请求保留原归属。compaction/correction 沿原角色 purpose 计数，没有免费分支。
4. 测试成本、40 次、截止、65k reservation、旧 case/旧 SDK 门槛、deferred reader/超时/到期与崩溃边界。编译及真实进程测试向 root 协调时段，不跑付费 API、浏览器或真实验证目录。
5. 原 implementer 提交准确 SHA 与证据，独立 reviewer 审 actual diff，batch07_merger 仅集成批准提交。

## 当前限制

V1 只提供 profile/authority/accounting。V2 仍须证明 identityReader 实际读取 Git HEAD/dirty 状态及固定输入，并接通真实 SDK 同一配置的请求元数据、operator 输入和 driver。源码、离线与实际准入全部 READY 前，不开始付费验证；不把此阶段说成原生生成已经通过。

过期 case 可以显式 `accountingOnly: true` 打开同 case/window，仍核对 identity 与固定源文件，允许原请求对账；实例 signal 永久中止，不能登记任务、启动 attempt、预留、admit 或启动 owned child。历史 running attempt 文字记录保持原样；原 owner 锁必须按既有逐 child 收敛规则关闭或恢复。claim 前未知/预留费用拒绝；当前 case 的已知并发预留按同一队列和累计上限核算。
