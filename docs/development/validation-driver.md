# COS20 固定验证案例入口

本段准备声明和固定输入校验，尚未接入窗口激活或实际执行。它不读取真实验证快照、会话或模型配置，也不产生游戏需求确认、已通过阶段、计时或费用记录。

- 声明：`probes/e2e/validation-declaration.ts` 固定 `cos20-native-validation-1`。单例增量 ¥5、45 分钟、40 次调用、一次语义修复；规划、评审、格式纠正和压缩共同计数。共享生命周期 ¥150 与首批累计 ¥30 同时约束。
- 新 planning grant 为 ¥2；design/art/coding/repair 分别为 ¥1.9/5.7/7.6/3.8，总计 ¥21，仅可使用旧账本未分配额度。旧 allocations、费用、首窗截止、停止和失败事实留存。claim 后即消费新 case ID，包括零请求启动失败；旧三个实验 ID 不重开。
- 模型固定 `deepseek-flash`。新原生 art/coding 作者明确选用 65536 输出上限；design/reviewer 保留 16384，planning 保留 4096。接线必须从同一声明读取上限，并让已有 `requestReservation` 按 SDK 实际请求大小预留；旧 probe 常量保持不变。
- `validation-input.ts` 核对既有 COS10 `cos10-pilot-v2` 文件及八个已跟踪通用模板文件的固定字节摘要。排除构建目录和依赖目录，额外模板源文件、缺文件、内容或编码改变均拒绝。返回 `validation-case-input`，不把原固定范围伪装成刚完成的真人访谈。
- 新解析器仅接受 `--validation-preflight <reviewed-main-sha>` 或 `--validation-case <reviewed-main-sha> <operator-validation-source>`，返回未激活的 intent。当前旧 `run.ts` 尚不接这些参数；不提供自定义 root、case ID、时钟或 reset。真实入口须核当前已审 main、原账本与窗口准入，再记录既有授权内的真实 `operator_validation` 来源。

后续接线复用同 `SnapshotStore`/`RunController` 的 validation 权限分支、原 planner/角色/registry/正常输入验收与有限 repair；新路径跳过旧 driver 自行填写 `confirmed:true` 的访谈包装。所有目标游戏专属代码及素材仍由原生角色在实际运行中生成；离线 fixture 明确不计为生成游戏。正式生成 ¥200/12h 及其人类准确报价续窗不受这套开发验证入口改写。

付费运行仍须源码独立 READY、合入 main 且实际准入通过，由协调方执行；声明、参数解析和本段测试均不构成一次已执行实验。

本段验证：`node --experimental-strip-types --experimental-test-isolation=none --test --test-reporter=spec tests/e2e/validation-declaration.test.ts`，9 项先红后绿。另对两个新 probe 模块及测试运行显式 `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --types node`，通过；根项目 build 不包含 probe，因此未用它代替此类型检查。测试仅复制临时固定输入、改变副本并检查拒绝，不创建模型会话、浏览器、子进程或生成游戏，亦不访问真实验证目录。

## V2b：真实源码身份读取

`validation-identity.ts` 的 `createValidationIdentityReader({ repository, reviewedPlatformSha })` 返回接收 `AbortSignal` 的只读 reader，供后续 core 在 claim/open/每次 reserve/admit 调用。它核对真实仓库根、实际 main 分支、HEAD 和包含未跟踪文件的 Git status，再完整读取冻结输入，并重复分支/HEAD/status 检查；调用方不能通过传入“已验证”标志替代这些检查。

每次读取重新检查源码，返回实际 `reviewedPlatformSha` 与 `sha256(JSON.stringify(VALIDATION_CASE.inputs))`。Git 使用原有有界 `runChild` 和环境白名单；参数以数组传递，关闭可选 index 写锁、fsmonitor 和 untracked cache。忽略 Git 已忽略的产物；源码变化、脏工作区、额外未跟踪源码或固定输入漂移均拒绝。检查预算最多 5 秒，也接受 core 更早的取消，Git 终止仍等待原有受控清理，不把超时当作成功。

审查修复：普通 Git status 会隐藏标有 `assume-unchanged` 或 `skip-worktree` 的实际改动。reader 在前后两轮检查中只读查询 `git ls-files -v -z`，发现任一隐藏标志便拒绝；不会清除标志或刷新 index，带这些标志的干净或稀疏 checkout 也不用于本验证。两个真实 Git 反例先红后绿，且拒绝前后全部文件与 index 字节/mtime 不变；原 10 项证据复用。

本段只新增身份读取，没有接入运行权限、执行输入契约或 paid driver。10 项测试使用真实临时 Git 仓库与冻结输入副本，覆盖 clean 读取无写（含 index 字节/mtime）、错误 SHA、错误分支/游离 HEAD、脏输入/源码、未跟踪源码、已提交输入漂移、后续 commit、取消及并发源码变化；不读取真实账本、历史 case 或会话。

## V2c 首步：显式验证执行输入

`src/roles/execution-input.ts` 定义原真人 `RequirementContract` 与 `ValidationRequirement` 的联合类型。新验证数据保存 specVersion/sources/完整 acceptance，以及 run/ledger/case/window、平台 SHA、冻结输入 hash 和 operator 决定的 `source`/`sourceRefs`；不制造 confirmedBy、confirmedAt、GameDraft、humanDecisions，也不添加预算或时间字段。构造器只校验并深冻结数据，旧 `validateRequirement` 完全保留，显式 profile 不接受另一种输入。

这只是形状校验，不证明来源、固定范围或权限。后续入口须从冻结 evaluation 输入及原 `stageAcceptance` 构造要求，核对完整 steps/expected/evidenceKinds，再与真实持久 case/window、operator 来源文件、registry 及 controller 权限核对，不能凭相同 acceptance ID 或调用方字符串放行。详见 [接线计划](../plans/2026-10-02-validation-driver.md)。本步 9 项纯数据回归先红后绿，fixture 明确 `generatedByCosmos:false`，没有运行 core、账本、provider、文件 writer 或游戏。

验证命令：`node --experimental-strip-types --experimental-test-isolation=none --test --test-reporter=spec tests/roles/execution-input.test.ts`（9/9）；对新模块与该测试执行 `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --types node` 通过。本提交未合入 V1 core 依赖，未重复已有运行测试。

## V2c 运行时接线

planner、角色工厂和原串行 DAG 已增加显式 validation binding。可信 `readScope(signal)` 必须重新读取完整固定要求和 operator 来源字节；runtime 将其与当前持久 case/window、quote、决定 JSON/hash 逐项比对，验收相同 ID 但 steps/expected/evidenceKinds 改变也拒绝。校验先于会话、origin、task/attempt 写入，受 case 信号与最多 5 秒限制；固定公开 driver 尚未提供这个真实 host adapter。

模型调用继续使用原 SDK 与 `createRoleBudget`，每次实际请求携带 case/window/purpose 和实际 cap/input 字段。规划、作者、review、格式纠正和压缩都进入同一请求计数；原运行时间与停止事实保留，角色 packet 单列真实 validation 窗口。语义修复尚未接入；当前只支持串行 validation DAG，不接受并行 scheduling 配置。

若 reserve 成功但 admit 拒绝，SDK 尚未收到允许发送的返回：hook 保存 `admission_rejected_before_provider_dispatch` 的 host `not_sent` receipt 后按零费用取消；保存失败保留预留或未知 exposure，并阻断后续付费。已返回 hook 后真实发出的请求仍按原响应回执处理，未知费用不会自动清除。

离线证据：`tests/runtime/validation-routing.test.ts` 23/23；`tests/roles/roles.test.ts tests/roles/repair-protocol.test.ts tests/runtime/recovery/dependencies.test.ts` 74/74；`tests/runtime/continuation-runtime.test.ts` 中 `explicit v2 pipeline|v2 role construction` 两个代表 2/2。均用 `node --experimental-strip-types --experimental-test-isolation=none --test --test-reporter=spec`，仅最后代表组增加 `--test-name-pattern`。源码 strict build 与 routing 测试显式 strict noEmit 通过。所有新 fixture 标明 `generatedByCosmos:false`，没有模型网络调用、真实浏览器、游戏编译或旧 case 重跑；并不证明新付费 driver 或生成游戏通过。

## 共用 worker 与一次修复的基础

正式 host 和待接入的验证 host 共用 `runOwnedNode`：在原 controller 持久记录 spawn intent 和 launcher PID 后才启动固定 Node worker，使用真实任务/窗口权限、信号、剩余时间与既有进程树清理。IPC 保持至 worker 退出；Windows owner 异常退出时 launcher 清理 worker 树。helper 不替代原 browser runner 对自身清理的检查，也不允许将任意孤儿进程当作已结束。

repair policy 已识别显式 validation case，以本次 deadline 和预分配 repair grant 作判断；原 stop/deadline 永久保留。一次 coding 修复必须使用已 claim 的新 ID/context/输出版本和同一验收，design/art 早失败只报告差距。只有原失败回执写入成功才记录固定 feedback 引用，保存失败不会 claim。实际 driver 仍需认证反馈文件的内容、版本和来源；单凭引用相等不够。

本步新增 3 项实际 Node child 检查与 3 项 validation repair 检查通过；另有 24 项旧修复策略及 2 项正式 host 定向回归通过。strict build 和新测试显式 strict noEmit 通过，所有 child fixture PID 已退出；无浏览器、API 或真实 case 操作。工具链 planning child 的 core purpose 修复由独立 V1 作者负责；固定 entry、实际 readScope、owned host worker 与反馈文件认证仍待下一步接通。
