# 上次系统启动遗留 owner 的受控恢复

状态：2026-10-17，[COS103 / #104](https://github.com/lrfluobida/Cosmos/issues/104)，id5896315224，已原生挂父[COS102 / #103](https://github.com/lrfluobida/Cosmos/issues/103)、恢复子项已勾选。设计`1d400d75919eca0100b05488534c33e4ef6a4d81`经`cos102_recovery_reviewer`批准；源码`15488a9c41677a23566c8a4d24f7addd0f5224ff`经`previous_boot_recovery_reviewer`审查为`APPROVED_SOURCE_SCOPED`、无P1/P2。两锁实际恢复、原API deadline stop/close、closure22及独立`PASS_C16_INTERRUPTED_RECOVERY_AND_ACCOUNTING_CLOSED`完成，Root已解冻main。唯一merger `batch_previous_boot_merger`合入main `402cfb56b44e211147014691b56b49ac53dc2393`，源码与结果以`376d893b7ae109595cf21f85d5b6f7504e887440`发布；Root已精确核证#104 closed(completed)及父恢复子项勾选，COS102仍open，见[完成记录](https://github.com/lrfluobida/Cosmos/issues/104#issuecomment-6232024845)。见[公开结果](https://github.com/lrfluobida/Cosmos/issues/104#issuecomment-6231925739)与[C16研究记录](../research/2026-10-17-cos102-interrupted-actual.md)。

本规格正文保留已审设计契约与设计时事实；当前结果以上述状态及研究记录为准。最终guard修正前全套49/49、最终affected9/9（重叠不相加）、默认恢复24/24与typecheck/build0按原证据复用。B3是TEMP原2f runtime、真实identity/now及独立Node组合，不是实际游戏。默认recover不变、未kill复用PID；C16仍v1失败/v2未完成，COS16/COS18、完整经典和human未提升，无新付费授权。

## 1. 目标与已定位的缺口

为已证明属于本机上次完整启动的两种 v1 owner 锁提供一个可信 operator 维护入口。只解除该精确 owner，保留原始 bytes 与审计，随后由原 API 收口原 C16 的账务。默认 `recover` 继续按原规则拒绝活 PID、未解决 spawn intent 和 `untrackedWriters`。

设计时固定执行来源为 `2f84eb328e59f20d73ceccdc69ff708f7be200a5`，原仓库 `E:/develop/Cosmos` 的 `main` 保持该 SHA 且 clean。C16 已消耗一次 actual，原 claim 为 `2026-10-16T11:23:14.977Z`，deadline 为 `2026-10-16T12:53:14.977Z`。Root 已保全 revision 3332：C16 window 的 `stopReason` 为 null，repair 尚未有完整结果；snapshot 顶层另有更早的历史 stop，不能把两者混为一项。51 个 C16 请求已结算 1265722 micro-CNY，reserved/unknown 为 0。v1 build 通过、start 第 015 步 board-visible 失败；唯一 repair 的 v2 build 通过，最后 start plan 无 report，watch-result/host-result 缺失。没有证据宣称 C16 完整成功。

| 原路径（相对原仓库） | 保全锁事实 | 默认恢复为何拒绝 |
| --- | --- | --- |
| `.cosmos/validation-shared/.controller.lock` | format 1；owner 27212；acquired `2026-10-16T11:23:15.723Z`；15 个 child；`untrackedWriters:false` | child PID 8448 现被系统服务复用，`requireExited` 的 `process.kill(pid, 0)` 仍报告存活 |
| `.cosmos/e2e/cos20-transfer-validation-16/registry/.commit.lock` | format 1；owner 27212；acquired `2026-10-16T12:36:10.888Z`；children 空；`untrackedWriters:true` | 任意外部 callback 的 writer 生命周期未被 registry 跟踪 |

Root 的只读 OS 观测给出 `LastBootUpTime = 2026-10-17T07:09:16.500Z`；原 Node/Python owner 已消失，原 wrapper 5488 与 child 8448 现为本次启动后创建的 `svchost`，相关端口无监听。这些观测需在实际维护前由可信宿主重新读取；本设计未执行恢复或 kill。端口空闲和 PID 名称仅为旁证。

设计作者另作只读事件核对：System 日志的 `Microsoft-Windows-Kernel-Boot` ID 27/version 1/record 571331，时间 `2026-10-17T07:09:16.9724716Z`，`BootType=0`；`Microsoft-Windows-Kernel-General` ID 12/version 0/record 571324，时间 `2026-10-17T07:09:16.9722393Z`，`BootMode=0`、`StartTime=2026-10-17T07:09:16.5000000Z`，与 CIM 一致。本机完整冷启动证据已可取得，执行时仍须重读并绑定同一次启动。

原始证据在私有 `.cosmos/reconciliation/2026-10-13-c6-provider-usage/`，仅引用下列确切文件，不能读取凭据或会话密钥：

- `case16-interruption-preservation-v1.json`：保全范围、原路径和 metadata，以及 watch/host result 缺失。
- `case16-interrupted-before-recovery-v1.json`：原 snapshot bytes，SHA-256 `f0ba6aea5e07715cfe158d0b7d5fbb7f496ae96e5f104a2b41a990da38d27251`。
- `case16-controller-owner-before-recovery-v1.json`：1085 bytes，SHA-256 `af2956be2c07a6d28303d9d0191f476980e7fe200b909a52335974df4bff4059`。
- `case16-registry-owner-before-recovery-v1.json`：157 bytes，SHA-256 `1309dae7cec52e5a5da12a2414265bc68b5e14764bfc5307b02b293efb441fd2`。
- `case16-root-intent-v1.json`、`case16-watch-start-v1.json`、`case16-claim-observed-v1.json`：原单次启动、来源和原窗口的关联依据。

## 2. 方案选择

| 方案 | 判断 |
| --- | --- |
| **显式 previous-boot 维护入口** | 推荐；用可信本机启动事实、原锁来源、精确批准和相同恢复 guard 处理两个缺口，默认恢复规则不变 |
| 放宽默认 recover，按 PID 创建时间或锁年龄自动回收 | 拒绝；不能证明任意 callback 后代已退出，也不能证明旧锁来自当前机器 |
| 只给未来锁增加 boot ID | 可能改善未来诊断，但不能认证已经落盘的 v1 锁；本项不增加锁版本或迁移现有锁 |

没有发现能用现有 API 同时安全处理当前两把锁的更小路径。手改 flag、删锁、杀复用 PID、伪造 now 或直接改 snapshot 均绕过已有边界。

## 3. 系统重启证明的范围

完整 OS 重启结束上次启动中的本地 owner、普通子进程及 callback 的本地未登记后代。因此，**在原锁确实属于该机器旧启动且 writer 只在本机的前提下**，旧 callback 的 `untrackedWriters:true` 不再意味着它的旧进程仍存活；同数值的新 PID 也不再是旧 writer。恢复函数不向任何这些 PID 发终止信号。

Windows 的 `LastBootUpTime` 是系统上次重启的时间。[Microsoft WMI 文档](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-operatingsystem)；PID 会复用，必须结合进程创建时间解释。[Microsoft Win32_Process 文档](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process)

睡眠、休眠恢复、Fast Startup 不能直接替代完整启动证明；Fast Startup 会保存 kernel session，Restart 才执行完整 boot cycle。[Microsoft Fast Startup 文档](https://learn.microsoft.com/en-us/troubleshoot/windows-client/setup-upgrade-and-drivers/fast-startup-causes-system-hibernation-shutdown-fail)

重启不证明远端 provider 已停计费、共享磁盘上的远端 writer 已退出、新启动中的自动重启服务未重新写入、产物已验收或旧 callback 正常 drain。它也不恢复丢失的 registry 内存 proof。保持本机单用户、可信 host-owned 路径的原威胁模型；不声称防御同 OS 用户恶意替换文件或实现断电事务。

### 3.1 v1 锁来源与本地边界

v1 锁没有 host/boot ID。`acquiredAt < bootAt`、旧 mtime、`Date.now() - uptime` 或一份事后复制件都不能单独认证上次启动。实际批准必须包含可审查的来源链：原本机绝对 root、原启动/claim/执行来源、两份锁的原文件事实与 bytes、重启事实，以及该 callback 的本地 writer 范围。operator 的判断必须指向这些原证据及独立审查，不能只写 `safe:true`。本例由真实启动所在 chat、监督日志、固定 Root intent/quote/claim 与原 repo 本地执行记录建立该链；不要求补造原锁从未记录的历史 host/boot 字段。程序校验引用和精确批准的绑定，旧来源归属由可信 operator 对原证据作判断，不能宣称 JSON 本身独立证明了该历史事实。

本路径仅接受当前 Windows 宿主上的本地固定磁盘，root 和所有祖先无 symlink/junction/reparse 跳转，锁为单链接独立 regular file。拒绝 UNC、映射网络盘、别名跳转、未知卷、从别的机器复制的锁、来源不明和重新创建的同内容文件。复用 `safePath` 并增加本地卷核验，不遍历全部仓库或生成资产。原运行若可能把工作交给能跨重启存活的远端服务、自动启动任务或外部共享 writer，必须保留阻塞。

旧锁身份通过完整 bytes SHA-256、token/PID/acquiredAt/children/flag、canonical root、文件系统身份（volume/dev 与 file ID/ino）、大小及精确创建/修改/变更时间共同绑定。文件身份由本次 prepare 实测并在 apply 重读，用于拒绝审批后的同 bytes 替换；不要求历史日志已有 file ID。时间和文件 ID 用字符串保存，避免纳秒值精度丢失。原文件身份无法稳定读取时拒绝。原锁时间字段和 OS 观测之间矛盾、系统时钟跳变使先后不可确定时也拒绝；不得靠“足够老”的容差消除矛盾。

## 4. 最小 API 与证据契约

仅扩展 `src/runtime/recovery/ownership.ts`，增加一个窄的 Windows 只读观测模块 `src/runtime/recovery/windows-boot.ts`。不改 store/registry/run 的默认调用，不增加 CLI/model tool，不升级 ledger、snapshot 或 OwnerRecord 版本。

新增可信宿主静态入口，具体 TypeScript 类型与实现同审：

```ts
OwnerLock.preparePreviousBootRecovery({ root, name, evidenceRoot, provenanceSource, maintenanceSource });
OwnerLock.recoverPreviousBoot({ root, name, evidenceRoot, quote, decisionSource });
// name 仅允许 '.controller.lock' 或 '.commit.lock'；一次只处理一个精确锁。
```

`prepare` 只读，返回不可执行的 quote。`recoverPreviousBoot` 必须重新读原文件、OS 与批准来源，不能直接信任 quote 自报的安全结论。生产参数不接受 `isDead`、`allowUntracked`、任意 verifier callback、caller boot time、caller now 或测试注入开关。内部 OS 采集可在测试中 mock 原始结果；该 seam 不导出为 operator 能选择的 override。

| 记录 | 必须绑定的字段 |
| --- | --- |
| quote | 精确 root/name/file identity、锁原 bytes SHA/size 和完整 OwnerRecord；本机标识、启动观测、来源证据文件 SHA；维护代码 commit 与入口文件来源；原 generation source SHA；目标 archive/audit 路径 |
| provenance source | 原 case/window/source、原宿主与本地 root 的关联；已保全文件引用与 hash；本地 callback/child 范围；原启动与完整 reboot 的证据；独立审查引用。缺任何所需事实即拒绝 |
| operator decision | 独立 decision ID、可信 actor、实际决定时间、完整精确 quote、来源引用；写成独立 UTF-8 immutable file，读取完整内容比对。它仅授权该次 owner 维护 |
| outcome | quote/decision SHA、maintenance source、原 generation source、归档文件与 SHA、前后启动观测、删除是否已确认、实际观察时间、失败或未决阶段 |

沿用 `regularFile` 与 `publishReceipt` 的路径/不覆盖审计模式。原锁另存 exact bytes，不能 JSON 重序列化后称为原件。quote/decision/outcome 是维护记录，不进入旧执行 receipt 或费用 ledger。来源文件必须在可信 operator 的独立目录，不能接受模型输出目录中的批准文件。

### 4.1 Windows 观测

生产 collector 通过固定、无 profile、有限时的本地 PowerShell/CIM 查询读取 `Win32_OperatingSystem.LastBootUpTime`、机器身份、相关本地卷及所需的完整启动旁证，结果使用严格 JSON schema 与明确 UTC。启动的进程必须隐藏窗口；不把用户路径插入 shell 代码，不输出环境或完整进程命令行。

完整启动旁证取当前 System 原始事件：Kernel-Boot ID 27/version 1/`BootType=0`，以及 Kernel-General ID 12/version 0/`BootMode=0`。两条事件须属于同一机器当前启动，General `StartTime` 与 CIM `LastBootUpTime` 指向同一 UTC 时刻；绑定 provider/version/event record ID/事件时间/StartTime，不把它们硬编码成本文实例值。缺事件、未知版本/枚举、仅 resume 或事件与 CIM 不一致均 blocked；不把调用方提供的 `fullBoot` 当 OS 事实。第 1 节的本机原始观测是受支持 fixture 的依据，实施时补只读 collector 正向核验。

每次 prepare/apply 都由生产 collector 自行读取，apply 持 guard 后与删除前各读一次。机器、卷、完整 boot identity 必须与 quote 一致；查询失败、非 Windows、当前 boot 锁、unknown boot、resume-only、观察中 boot 改变、来源改变均拒绝。当前 boot 的无关活 PID 可以存在，必要时用创建时间记录其复用事实；不要求整个系统无进程。

## 5. 恢复顺序与故障边界

1. 用现有 `${lockPath}.recovery`、`open(..., 'wx')` 串行化旧与新恢复入口。写入本次操作标识并 sync；已有 guard 一律 busy/unresolved，不按年龄删除。
2. 核对严格 v1 记录、路径/文件身份、bytes、可信 provenance 和完整精确 decision。读取当前本机启动事实，证明原锁及所有原 writer 属于上次完整启动；未知 child intent 也须在同一本地旧启动范围内，否则拒绝。
3. 将原 bytes 与不可覆盖 intent 持久化到批准的私有 archive 目录并读回校验。不得先删锁后补原件；任一归档错误保持锁不变。
4. 在 guard 内再次核对原路径/文件身份/bytes、provenance/decision、机器/卷/boot。全部相等后仅 unlink 该锁一次。默认 `requireExited` 不改；该入口依据已证明的旧启动终止范围作决定，不运行 kill/taskkill/Stop-Process。
5. 发布 outcome 后，仅释放本操作持有的同一 guard。删除前失败可释放自己创建且身份未变的 guard；删除是否发生不确定、删除后审计失败或进程崩溃时保留未决 guard/intent，报告未决，禁止自动重试或继续账务操作。不得伪造成功回执、重建旧 owner 或删除未知 guard。

两把锁分别执行，非跨文件事务。先恢复 C16 registry，再恢复 shared controller；第二把失败时保留第一把的真实 outcome，仍不打开 controller。并发新 owner 在旧锁存在时仍被现有 `wx` 拒绝；删除后若已有新 owner，旧 quote 不能处理新锁。既有 acquire 不因维护 guard 获得新的同步语义，因此 Root 的维护冻结与只在成功 outcome 后推进是实际执行前置；不把 guard 当作所有任意 writer 的全局 fence。

## 6. 保持原 source identity 的实际收口

`createReviewedValidationIdentityReader` 要求当前仓库是 **clean main 且 HEAD 精确等于 reviewed SHA**；ancestor 不被接受。因此不能先把恢复代码合进 `main` 再谎称仍是原 C16 执行来源。

1. 专职 implementer 在隔离 managed worktree 从原 `2f84eb3` 实现并提交；独立 reviewer 审实际 diff、TEMP 证据和下列执行边界。唯一 merger 可固定并验证候选分支的精确维护 SHA，必要时发布该候选分支；原 `main` 继续冻结。
2. Root 另记批准的维护模块 SHA、其 import closure、入口文件 hash 与两个精确 quote/decision。原仓库继续 clean `main@2f84eb3`；维护进程只从该已审候选 worktree 的绝对模块路径导入 owner 恢复代码。不得复制新代码到原 source、切换原 main、改 index flags 或覆盖旧 receipt。维护代码来源与原 generation 来源分开记录。
3. 两个 outcome 均确认、独立检查无相关活 writer/端口后，退出维护进程。另起进程从原 `main@2f84eb3` 导入原 `RunController` 和原 C16/D16 identity reader，`openValidationCase({accountingOnly:true,...原 root/case/window/identity})`；不传 `now` override，不派发 task、不重开浏览器、不调用 provider。
4. 原 `openValidationCase` 内部 `expire()` 会按真实当前时间给 C16 持久化 `deadline` stop；如产生新 unknown，保留并先走原 receipt 对账。当前 51 请求已 settled 的基线不应产生新费用。核对原 task/attempt、失败/repair、fees、deadline 等保持，再 close 并核对 owner 不存在。不能调用 `stop('manual')` 冒充中断时发生的停止，也不能手写已消耗状态。
5. 用原 `prepareValidationAllocationClosure` 得到 C16 精确 quote；独立可信 operator 对该 quote 作新的 closure decision，再用原 `applyValidationAllocationClosure` 应用。两次均保留原 identity 检查；quote 过期须重做受影响步骤，不能改它的 revision/hash。先核对全部 reserved/unknown 为 0、固定 artifact root 以及 owner/registry writer 均不存在。
6. 独立后核账务、原 evidence、无活 writer 和未决 guard；记录真实 interruption/deadline/closed 结果。全部通过后 Root 解冻，唯一 merger 集成已审维护代码与结果文档并 push。维护成功不代表 C16 start/220 步/62 字段/交付/human 通过，不授予重跑、第二 repair、预算或时钟。

本项不更改旧 window execution receipt；原 C15、COS16/COS18、完整经典及 human 状态保持。实际操作命令须在 SOURCE 独审后绑定最终精确 SHA，由 Root 按此顺序提交独立执行审查。

## 7. 验收与剩余前置

- 真实 TEMP 文件覆盖两类锁：合成旧 boot 原件中放入**当前仍存活的测试进程 PID**模拟复用，以及 `untrackedWriters:true` 的旧 callback。使用受控 OS fixture，不重启机器；结果明确标为 SOURCE/TEMP。
- 所有负例保持锁、中文 snapshot、ledger 和 artifacts 原 bytes：fresh/current boot、unknown/resume、来源缺失、远端/复制来源、元数据或 bytes 变化、decision/quote 改变、boot 改变、归档失败与并发恢复。
- 显式证明恢复不 kill 当前测试进程：独立父进程观测测试子进程仍存活、响应存活握手；恢复期间禁止非零 kill signal，不能仅依赖“测试跑到了结尾”。正常 `OwnerLock.recover`、`SnapshotStore.recover` 与 registry 恢复的原拒绝/成功路径保持。
- TEMP 串联“新维护模块仅解锁 → 原 accountingOnly 产生 deadline → close → 原 closure quote/decision/apply”；没有新请求、费用、task/attempt、generation receipt 或 repair 授权。精确 identity 行为复用现有测试并补候选维护来源与冻结原仓库分离的必要边界。
- 当前完整启动事件格式与两把 v1 锁原本地执行链已有本例证据；尚需独立设计审查、SOURCE 实施/验收及对精确维护 quote 的实际批准。执行时任何来源或启动证据缺失仍应 blocked，SOURCE/TEMP 通过或事后 snapshot 备份不能替代它们。

实现步骤见 [计划](../plans/2026-10-17-previous-boot-owner-recovery.md)。本项不宣称 COS-12 全部或 COS102 actual 完成。
