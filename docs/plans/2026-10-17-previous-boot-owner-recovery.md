# Previous Boot Owner Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Repository rules require a dedicated implementer, an independent reviewer with separate context, and one merger per batch.

**Goal:** 在可信完整重启与原本地来源已证实的前提下，精确归档并恢复两类旧 owner，使原 C16 可以用冻结来源的原 API 完成账务收口。

**Architecture:** 在 `OwnerLock` 加显式 operator 维护入口，复用已有 recovery guard、路径检查和不可覆盖 receipt 模式；Windows collector 自行获取可信 OS 事实。新维护来源与原 generation 来源分开记录，原 `main@2f84eb3` 在实际收口前保持冻结。

**Tech Stack:** TypeScript、Node.js 22 的 filesystem/process APIs、Windows PowerShell/CIM、`node:test`；不新增依赖、ledger/owner 版本或模型工具。

---

状态：2026-10-17，仅设计/计划草案；SOURCE、实际恢复与账务写入尚未由本计划授权。规格：[上次系统启动遗留 owner 的受控恢复](../specs/previous-boot-owner-recovery.md)。拟挂 COS102/#103 的恢复子任务，稳定 ID 待 Root 登记；本次不改 mapping、PROGRESS、CONTEXT 或 main。

## 角色、工作树与范围

| 工作 | 专职执行者 | 独立 reviewer | 唯一集成者 |
| --- | --- | --- | --- |
| 本次设计与计划 | `previous_boot_recovery_design_author` | Root 另派独立上下文设计 reviewer | Root 登记的本批唯一 merger |
| SOURCE 实现 | Root 指派 `previous_boot_recovery_implementer` | Root 指派 `previous_boot_recovery_reviewer`，先规格后质量 | 同一位本批 merger，仅在解冻后合 main |
| 实际维护/收口 | Root 作为可信 operator | 独立执行前审查及结果后核者 | 不由实现者或 reviewer 自行合并 |

设计工作树为 `E:/CodexData/.codex/worktrees/cos-02-contracts/Cosmos`，分支 `codex/previous-boot-recovery-design`，基线 `2f84eb328e59f20d73ceccdc69ff708f7be200a5`。SOURCE implementer 另用独立 managed worktree/branch，从同一冻结基线及已批准设计开始；不能复用正在供 reviewer 读取的可变工作副本。每次交付 exact SHA、必要命令/退出码和已知缺口，复审只检查受影响改动。

SOURCE 文件范围：

| 文件 | 动作与职责 |
| --- | --- |
| `src/runtime/recovery/ownership.ts` | 最小新增 prepare/apply previous-boot 入口和相应类型；复用 v1 解析与 guard，默认 recover/close/acquire 语义保持 |
| `src/runtime/recovery/windows-boot.ts` | 新增固定 Windows 只读 collector、严格 OS 结果解析与本地卷/完整启动判断；生产不暴露注入参数 |
| `tests/runtime/recovery/previous-boot.test.ts` | 新增真实 TEMP 锁、审批/归档/竞态/不 kill 测试和维护来源分离测试 |
| `tests/runtime/recovery/windows-boot.test.ts` | 新增原始 OS 结果正反 fixture 和失败边界；fixture 不含环境、凭据或完整命令行 |
| `tests/runtime/validation-allocations.test.ts` | 仅在现有用例不能覆盖时补 TEMP accountingOnly deadline → close → closure 的受影响断言；先读已有证据 |
| `docs/development/recovery.md` | SOURCE 通过后补维护入口的窄说明与限制，保持默认恢复文档有效 |

只读依赖：`src/artifacts/paths.ts`、`src/runtime/recovery/receipt-file.ts`、`src/runtime/store.ts`、`src/artifacts/index.ts`、`src/runtime/run.ts`、`src/runtime/validation-allocations.ts`、`probes/e2e/validation-identity.ts`、`probes/transfer/validation-input.ts`。若必须改这些依赖的行为，先回到设计复审，不自行扩展 scope。

## Task A：核实旧锁证据和 Windows collector 前置

执行：SOURCE implementer；审查：独立 reviewer。只读收集先于源码；不在实际 root 调任何 recover/open/close API。

- [ ] 读 AGENTS、CONTEXT、主 spec 的恢复/预算/来源边界、COS-12/COS102 卡及本设计。检查独立 worktree clean、基线 exact SHA，记录专职角色与唯一 merger。
- [ ] 对将编辑的文件做 fatal UTF-8 解码及换行检测；写前公告具体文件。非 UTF-8 立即停止该文件编辑；使用最小 patch，写后读回中文。
- [ ] 核对 `OwnerLock.recover`、registry callback 锁、`openValidationCase` 的 `expire()`、allocation closure，以及 exact clean main identity。复用已通过 evidence，不运行完整 actual/SOURCE 验证案例。
- [ ] 复用设计第 1/4.1 节已核的本机原始事件，固定 collector schema：Kernel-Boot 27/version 1/BootType 0，Kernel-General 12/version 0/BootMode 0，后者 StartTime 与 CIM LastBootUpTime 一致。把 provider/version/record/机器/本地卷 identity 纳入 fixture；睡眠/休眠/Fast Startup/未知格式不得被误判为完整重启。实现后只读核对 collector，缺可靠证据时 blocked，不加 timestamp-only 退路。
- [ ] 对两把 v1 锁的本机旧启动 provenance 作独立审查：Root 原本地 launch/claim/source 记录、精确原 bytes/metadata、callback 所有 writer 仅限本机且没有跨重启重新派发机制。当前事后保全文件不单独证明此前来源；缺这一环不能执行实际恢复。

Task A 输出为字段明确的 collector/fixture 契约和来源审查结论，不是 owner 回收许可。旧 v1 不要求新增历史 host/boot/file ID；依靠原本地执行证据与可信 operator 的精确判断，本次 prepare 读出的文件 ID 仅绑定后续 apply。若执行时证据无法复核，实际恢复继续 blocked。

## Task B：实现显式维护入口（一个 SOURCE 任务）

执行：`previous_boot_recovery_implementer`；独审：`previous_boot_recovery_reviewer`。仅在 Root 批准 SOURCE 后开始。

### B1. 必要 RED

- [ ] 在真实 TEMP 目录写两个合法 v1 锁及中文 snapshot/固定 artifact sentinel。旧启动、机器/卷及 provenance 为明确标注的受控 fixture；将受父进程监控、能回握手的活 child PID 写入旧锁模拟 PID reuse。不要改真实 host clock、重启机器、接触共享 ledger 或实际锁。
- [ ] 新增下表断言，使用尚未存在的新 API。第一轮 RED 应由新入口缺失或行为缺口导致，不接受构建环境/路径错误冒充 RED。

| 场景 | 必须断言 |
| --- | --- |
| 旧 controller 的 child PID 被当前活测试进程复用 | 新路径成功归档 exact bytes，只移除旧 lock；活进程继续握手；默认 recover 仍拒绝 |
| 旧 registry `untrackedWriters:true` | 充分本地旧启动证据下新路径成功；默认 recover 仍拒绝；flag 原样归档 |
| fresh/current boot；未知/无 boot 事实；resume/Fast Startup | 全拒绝；lock/snapshot/artifacts bytes 不变，零 kill/新 owner/费用 |
| acquiredAt/mtime 看似很旧但来源缺失或 copied/remote root | 全拒绝，不能仅凭年龄或 caller decision 宣称安全 |
| 文件被同 bytes 替换、token/children/flag/bytes/metadata 改变 | quote 失效；不能移除替代锁 |
| quote、decision、provenance、维护 source 或同机同 boot 身份变化 | 全拒绝；caller boot/now/boolean/verifier 不能进入生产参数 |
| archive 写入/读回失败；并发恢复；已有 guard | 删除前失败保留锁；最多一个成功，原件不被覆盖 |
| 删除后 outcome 失败或崩溃 | 保留 intent/未决 guard，报告未决；后续不能自动重试或转账务 |
| 同一 quote 再执行；已出现新 owner | 拒绝或只读返回确切既有结果，绝不再删除新锁 |

- [ ] 独立父进程监测恢复测试 child 的存活消息，恢复调用期间对非零 signal 建拒绝 spy；child 的正常 fixture 清理放在观察结束后。成功证据同时含“存活握手”和“无终止调用”，不能只用 exit 0 推断没有误杀。
- [ ] 运行并记录 RED：`node --experimental-strip-types --test tests/runtime/recovery/windows-boot.test.ts tests/runtime/recovery/previous-boot.test.ts`。

### B2. 最小 GREEN

- [ ] 实现固定 Windows collector。用结构化参数启动固定 PowerShell 查询，`windowsHide:true`、有界 timeout、严格 UTF-8 JSON 与 UTC；读取真实 OS 启动/机器/卷，返回原始可信事实。未知平台、格式、权限错误或不完整 boot 返回拒绝；不提供生产 callback override，不输出敏感环境。
- [ ] 在 `ownership.ts` 新增两入口与窄类型，读取完整精确 provenance/decision 文件并校验 quote。沿用原 v1 校验、`safePath`/`regularFile`、本地卷与严格文件身份；`prepare` 全程只读。
- [ ] 实现规格第 5 节逐步事务：现有 suffix 的 `wx` guard → 原件/intent durable 归档读回 → 同 guard 内重读全部事实 → 单次 unlink → outcome → 只释放本次 guard。所有归档禁止覆盖；原 bytes 不重序列化。对删除边界未知或 outcome 失败保持未决，不自动清理或新建 controller。
- [ ] 采用以下固定控制流；各 `require*` 必须由实际文件/OS 检查实现，不能是 caller 提供的安全回调：

```text
prepare: requireLocalRoot → readExactV1Owner → collectWindowsBoot
         → verifyProvenance → bindReadOnlyQuote
apply:   acquireExistingRecoveryGuard → rereadExactOwnerAndSource
         → collectWindowsBoot → requireExactQuoteAndDecision
         → syncAndReadBackOriginalBytesAndIntent
         → rereadOwnerFileIdentityAndAllAuthority → collectSameWindowsBoot
         → unlinkExactOldPathOnce → publishOutcome → releaseOwnGuard
```

- [ ] 默认 `OwnerLock.recover`、store/registry wrappers 和 generation/provider 代码不改。新维护入口可直接作用于两个精确 root/name，不把 override 接进模型或正常 runtime。
- [ ] 运行 B1 同一 focused 命令得到 GREEN；复用仍有效的旧测试证据，仅跑下列受影响默认路径回归：`node --experimental-strip-types --test tests/runtime/recovery/ownership.test.ts tests/artifacts/registry.test.ts`。

### B3. 冻结来源与账务集成边界

- [ ] 先读 `tests/runtime/validation-allocations.test.ts` 与 `tests/e2e/validation-identity.test.ts`。复用已有清洁 main/精确 SHA、旧来源拒绝和 closure 证据；仅补确有缺口的 TEMP 组合用例。
- [ ] 用 TEMP Git 仓库的 clean `main` 和精确旧 SHA 绑定真实 identity reader；维护模块来自独立候选路径。新模块只做 owner 恢复。另一步导入原 API，使用已经过去的原 deadline 与真实 now，accountingOnly open 产生 `deadline`，close 后再 quote → 独立 decision → apply。不得为通过测试改 identity 为 ancestor、mock 返回预期 SHA 或给 actual API 回拨 now。
- [ ] 断言维护时 snapshot bytes 不变，账务阶段只出现原 API 允许的 stop/closure 变化，原 fees/requests/task/attempt/repair/deadline 及执行 source 保留；未 settled/unknown 费用阻塞 closure。主线提前变动时原 identity 必须拒绝。
- [ ] 需要新增上述用例时先跑 RED 再最小补齐；验证：`node --experimental-strip-types --test tests/runtime/validation-allocations.test.ts tests/e2e/validation-identity.test.ts`。没有实质 delta 时引用已有同版本结果，不机械重跑。
- [ ] 更新 `docs/development/recovery.md` 窄范围说明；运行 `npm run typecheck`、`npm run build`、`git diff --check`。输出分列新 focused 证据与复用旧证据；不把 TEMP boot/账务模拟称为实际重启恢复。
- [ ] 提交 SOURCE exact SHA。交付变更文件、RED/GREEN、无 kill、默认 recover 保持、已知缺口和生产入口限制，等待独立审查。

## Task C：独审与固定候选维护 SHA

- [ ] reviewer 从已提交 exact SHA 读实际 diff，先核规格全部拒绝条件、source identity/实际顺序，再查安全性和代码质量。特别检查 v1 provenance 不是一个自报 boolean、OS fixture seam 未暴露给生产、归档发生在删除前、guard 崩溃边界、当前活 PID 不被杀。
- [ ] finding 由原 implementer 在原分支修复，reviewer 对受影响 diff/证据复审；不给 reviewer 源码写权限。报告 `APPROVED_SOURCE_SCOPED` 或明确缺口。
- [ ] 唯一 merger 核 approved SHA，固定候选分支并运行必要组合检查。必要时仅发布候选分支；原 `E:/develop/Cosmos` 的 `main@2f84eb3` 不合并、不切换、不污染。
- [ ] Root 登记精确维护 SHA/入口及 import closure、原 generation SHA、两个维护 quote 与独立 decision 的证据路径。来源或代码改变后，旧批准失效；旧 generation receipt 不修改。

## Task D：实际维护与原 API 收口（单独批准后）

执行者 Root，独立执行审查/后核者由 Root 指派。此处是审查清单；SOURCE 通过不会自动授权操作。

- [ ] 核对原 main 精确 SHA/clean、原私有保全证据、两锁 bytes/身份、本机完整 boot 和 local writer provenance，freeze 期间无新启动。使用已审模块固定绝对路径；批准脚本不可顺带启动游戏、浏览器、模型或重跑 case。
- [ ] 分别准备精确 registry/controller quote，独立可信 operator 记录两个决策。以候选维护模块先恢复 registry 再 controller；保存原 bytes、intent/outcome 和当次 OS 观测。任一步失败/未决立即停，已发生事实保留，不自动 rollback 或强制删 guard。
- [ ] 独立后核两锁和相关 writer/端口；退出维护进程。从原 main 代码另起 accountingOnly 进程，传原 C16/D16 identity 和 root/case/window，省略 now，记录自然产生的 `deadline` stop，close。不得 `manual` 替换事实或新增 task/attempt/repair。
- [ ] 原 closure API 生成 quote → 独立精确 decision → apply，记录 receipt。reserved/unknown 必须为 0；如有新不确定费用，按原核对流程保持额度，不新增预算或 ledger 版本。
- [ ] 独立核验原 51 请求/1265722 micro-CNY、历史 snapshot/任务与产物、原 deadline、维护及 closure 审计、无 owner/writer/未决 guard。保留 C16 incomplete/failed 事实；不宣称实际 220/62、视频、游戏交付或 human 通过。

## Task E：解冻后的集成与结果

- [ ] 所有实际 writer 已终止、账务闭环且独立后核通过后，Root 明确解冻 main。
- [ ] 唯一 merger 集成已审维护 SOURCE 和后续单独分配的结果文档任务，核对 exact SHAs，做受影响组合验证并 push。实际结果文档不得回写旧执行 receipt；本设计任务不提前新增研究结果或更改 issue mapping。
- [ ] 报告维护源码状态、实际恢复/账务状态与 C16 原验证结果三个独立结论；列出复用 evidence、最终 SHA 和尚未通过项。COS-12 整体、COS102 actual、COS16/COS18 与 human 完成条件不因此改变。

## 本次设计提交的验证

本次只核对两份文档 UTF-8/中文、相对链接、文件范围及 `git diff --check`，不运行代码测试、不访问凭据、不恢复锁、不写 ledger、不修改 main/push。独立设计 reviewer 由 Root 在收到 exact SHA 后安排。
