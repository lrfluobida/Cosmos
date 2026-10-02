# COS20 固定验证案例入口

本段准备声明和固定输入校验，尚未接入窗口激活或实际执行。它不读取真实验证快照、会话或模型配置，也不产生游戏需求确认、已通过阶段、计时或费用记录。

- 声明：`probes/e2e/validation-declaration.ts` 当前固定 `cos20-native-validation-2`。单例增量 ¥5、45 分钟、40 次调用、一次语义修复；规划、评审、格式纠正和压缩共同计数。共享生命周期 ¥150 与首批累计 ¥30 同时约束。
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

## 固定入口准备与真实范围读取

`validation-run.ts` 提供内部主机 API，尚未把新 flags 接到旧 `run.ts`。`preflightValidationRun` 只读核实际 main/准确 SHA/脏工作区与隐藏 index 标志、源级前置的审查/集成祖先、冻结输入、固定原账本及原费用，再生成 core 的未激活 quote；不打开 controller、不写停止、锁、receipt 或案例目录。COS10 实测通过不作为循环前置，已消费或存在案例目录/marker、原 writer 未收敛、未知费用、过期的错误入口等继续拒绝。

`runValidationWithHost` 接受可信 host 的免费只读准备与执行能力，供下一原生装配固定绑定；CLI/环境没有替换 host 的开关。免费准备后重核准确 quote，保存真实协调方传入来源的 `operator_validation` receipt，再 claim/open 同一账本的案例。45 分钟从 claim 开始，包含之后的案例目录、工具链、运行、检查和清理；启动零请求失败也消费 case 并保存安全类别报告。原费用、时间、失败和 humanDecisions 保持原事实。

完成时，wrapper 在自己的单例结束 stop 之前检查现有 case stop、截止与 5 秒清理余量、已结算加预留/未知费用和三层费用上限；host 返回 passed 还须与 registry 当前已提升候选引用匹配。清理后再核截止和费用，不以本次正常结束记录覆盖先前停止，也不将未知费用清零。原生 host 下一步仍必须实际证明完整玩法/媒体 AC、独立评审与 promotion；wrapper 的候选引用检查不能代替这些证据。

`validation-driver.ts` 当前仅提供固定 `createValidationScopeReader`。它真实重读冻结九文件及 SHA 下的 `stageAcceptance`，核 operator 原字节/hash/完整 quote JSON，检查 planning 输入 capture 的固定位置、类型、来源、文件集合及实际内容；相同验收 ID、弱化 steps/expected/evidenceKinds、未登记输入或改变的来源均拒绝。它不接受调用方传入已认可的 scope。

离线证据：9 项临时真实 Git/原账本 fixture 的入口测试通过（包含 4 个 host 误报 passed 的先红后绿边界），1 项真实输入 reader 与 registry 检查通过，全部零模型调用。对两个新 probe 和三个 fixture/test 文件的显式 strict noEmit 通过。尚无 public paid flag、native host、owned bootstrap/build/render/browser 装配或完整反馈文件认证；不得把本步作为实际生成通过。

完成竞态修复：独立审查复现了读取已提升候选期间收到真实 stop 却仍报告 passed。入口现在在该 await 后重读窗口；在没有 await 的同一步观察 controller 尚未 aborted、case 尚未停止，再发起自己的正常结束 stop，并以之后新增的唯一停止事件及时间核对，而非仅比较理由字符串。drain 后再次检查候选引用、费用和截止，外部停止不会被覆盖。真实 registry 提升 fixture 的竞态反例先红后绿，正常结束正例及旧 stopped/unknown 两项邻接检查通过；fixture 不是原生生成或游戏通过证据。

正常结束补充：core 对 stop 和 event 分别读取时间，二者不保证同一毫秒。验证保留上述信号/事件边界，仅要求 stop 时间不晚于对应新事件；强制真实时钟跨过 3ms 的正常提升 fixture 先红后绿，外部停止竞态仍拒绝。没有修改 core 时钟、原截止或停止事实。

## 原生固定入口候选

本段将两个严格参数绑定到唯一原生 host，供独立审查并合入 main 后使用：

```powershell
node --experimental-strip-types probes/e2e/run.ts --validation-preflight <准确已审main-SHA>
node --experimental-strip-types probes/e2e/run.ts --validation-case <准确已审main-SHA> "真实协调方授权来源引用"
```

只读 preflight 路径不加载收费准备；执行路径在 claim 前仅检查环境内存中的凭据、已安装 SDK/Playwright 与 root lock 版本、npm 和 Windows Edge。没有 CLI/env fixture 开关、自选 case/root/clock 或 reset；旧 flags、旧 16384 probe 常量、冻结 COS10 JSON 和模板均不变。领取后才复制和安装工具链，bootstrap、build、renderMedia、normal-input runner 都通过共享 gated Node helper，由原账本 owner 以真实 planning/art/coding/repair task/window 登记。worker 使用过滤环境，不能取得模型密钥；旧 host 的正常关闭及进程树清理继续生效。

新 validation 分支复用旧 pilot callbacks，跳过模拟访谈和自行 confirmed:true，保存显式 validation-requirement。规划提示固定三个声明 ID/grant，角色规则明确当前 validationCase 截止与 5 元/45 分钟/40 请求，原 originalDeadlineAt 只留历史。browser plan 仅在新分支绑定当前 coding/repair taskId，原八项玩法、媒体观测、步骤及版本不变。成功仍须全部 host 检查、独立 reviewer 和同 registry 的真实 proof/promotion。

仅 coding 的可信 code_defect 且 design/art 已过时可领一次修复。独立 review 的 changes_requested 只有同时具备可信 host code_defect 诊断才进入语义修复，其余 insufficient_evidence 安全报告差距，不保证所有软性评审问题自动修复。driver 读取原 session 的严格 UTF-8 feedback，核对 task/attempt/完整 AC/输入与产物版本、author/capture journal、immutable 原文件、registry 来源；再核对 validation 专用 write-once failure-snapshot，含合法 build 新增 dist 的当前完整文件集合和证据，最后按原字节 wx stage feedback、claim 唯一 repair。新 workspace/context/v2 保留旧 authors/v1/failure；任何签名漂移或快照存储失败均不 dispatch。

### 本段离线与真实工具证据

- 假 SDK 完整路径最终在时间戳修复后 **passed**：9 个假请求（含一次 design review 格式纠正），design/art 通过、原 coding 失败、新 coding repair 通过并得到 registry v2 promotion；原 authors/v1 留存。该次目标检查 40.47 秒，配套 public flag 检查也通过。早期 design 失败路径只发出 planning/design 两个假请求，后续角色和 repair 不启动。所有 fixture 都是非可玩通用数据，`generatedByCosmos:false`。
- 失败快照 7/7 通过：完整 dist、source/evidence/dist 漂移拒 claim、快照或原 feedback 存储失败零 claim，以及旧停止/当前 case 策略边界。
- 单次实际通用 smoke 1/1：test 34.08 秒、Node 总 37.02 秒，按 owned bootstrap → build → 正常鼠标点击 → art fixture render 串行；modelRequests=0，真实 browser PID 19764 退出，原 owner 关闭。证据保留于 `.cosmos/validation-host-smoke-47f42edc-82d2-4450-85b2-21c796117ecf/`（`smoke-report.json`、`owner-closed.json`、正常输入截图、worker 记录）。它只证明通用模板/fixture 媒体的进程与 registry 桥接，不证明 COS10 八项目标玩法、目标素材导入、听感或生成能力通过。
- 旧 preparation/diagnostics 11/11；其中完整 diagnostics 文件额外包含一次 1.83 秒的真实 Edge 小 fixture，已退出，未重跑整套旧 formal smoke。源码 strict build 和 native probe/test/smoke 显式 strict noEmit 通过；UTF-8/LF 与中文复读保留。

当前仍是待独立审查的源码候选，未执行真实新 case，实际模型费为 0。真实运行由协调方在最终 source READY、合入 main 后重新做准确 SHA preflight；此前 main 的只读 quote 不随新源码沿用。完整经典基准、正式生成 ¥200/12h 成绩和用户最终试玩均不由这些离线/通用 smoke 通过。

## 第二个有界 native case 的声明与准入

当前入口声明 `cos20-native-validation-2`，全部 grant ID 从该 ID 派生；沿用相同 `cos10-pilot-v2`、九个冻结输入文件、模型、输出上限和资源约束。五项新 grants 总计 ¥21，仅追加到原未分配额；原 case 1 的 grants、费用、窗口、operator 决定、manual stop 和失败结果保留。case 2 是独立窗口，claim 后立即消费，包括零请求启动失败；精确已消费决定的 core 幂等读取不会重新开启窗口，公开入口仍拒绝重跑。

免费准入要求原 snapshot 为 profile 3，当前 `cos20-native-validation-1` 已明确停止；仅过期而未保存停止记录也拒绝。额外源级前置 COS21 必须具有 `WINDOWS_PUBLICATION_SOURCE_READY`、已集成状态（包含 `offline-verified-awaiting-live` 或 `source-integrated`）以及属于准确 main SHA 的 reviewedCommit/mergeCommit，任务 closed 不能绕过这项门槛。COS10/COS20 的实际验收仍为本次验证产出。原未结算或预留费用继续阻止准入；这些检查都在 host 准备、operator receipt、claim、凭据读取与新 case 写入之前。

本段免费测试仅使用临时真实 Git 仓库、固定输入副本和实际 `RunController` 创建/领取/停止的合成 case 1；不读取真实账本、历史 case、模型会话或凭据，不伪造真人确认或生成结果。它检查新 clock/grants/operator 与旧记录分离、历史字段不变、一次消费与 core 幂等、未知/预留费用拒绝，以及 COS21 未审、错 marker、未集成或任一 SHA 不属于 main 时零新副作用。唯一原生 host 和严格公开 flags 保持原接线；真实 case 2 留给协调方在两项源码独立审查并合入 main、实际 Windows publisher 免费检查和最终准确 SHA preflight 通过后执行。

验证证据：声明 9/9；入口 25 项中 23 项首次通过，修正两个费用 fixture 后定向 2/2；只读 quote、完整范围 reader 和公开 flags 代表 3/3。声明的三个 ID 断言及入口的 11 项新门槛先红后绿。费用 fixture 仅模拟 admission intent 和未对账预留，实际 provider 从未调用；未派发的 reservation 会由 core 正常取消，已模拟 admission 的预留在 stop 后保留为 unknown。两个 probe 与相关 test/fixture 的显式 strict noEmit 通过，UTF-8/LF 与中文复读正确；未重复旧 fake native 全流程或实际 browser smoke。
