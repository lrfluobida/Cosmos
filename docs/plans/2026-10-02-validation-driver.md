# COS20 V2c：固定验证案例接线

## 分步与归属

1. **执行输入数据层（本提交）。** 新增 `src/roles/execution-input.ts` 与纯校验测试。`ExecutionRequirement` 是原 `RequirementContract` 或显式 `ValidationRequirement`：共享 specVersion/sources/acceptance，验证分支另存 run/ledger/case/window、已审 SHA、冻结输入 hash 与 `operator_validation` 的决定来源；不包含 confirmedBy、confirmedAt、GameDraft 或新预算/时钟。校验通过仅表示形状合法，不授执行权限，也不证明验收范围正确。
2. **窗口与请求接线（下一步，复用已审 V1）。** 在 factory/provider-budget/planner/orchestrator/journal 中使用明确 validation 分支；入口先核真实 `requireValidationCase`、已持久 window/决定/输入及任务所属 grant，再调用 `validationAuthority`。旧真人输入不能进入验证权限，验证输入不能进入旧 v1/formal v2。PiRequest 的实际模型、输出上限、输入字节与图像标志一并进入同账本；规划、评审、纠错与 compaction 全部计数。planner 的 legacy gate 暂归 B，等主线 checkpoint 后再改。
3. **固定 driver（等待上述权限接通）。** 新增 probes 的 validation-run/validation-driver 入口，复用已审声明/input/identity、旧 driver 的构建/素材/捕获/验收逻辑与同一编排器。新路径从冻结 evaluation 输入和既有 `stageAcceptance` 构造完整要求，逐项核对 steps/expected/evidenceKinds，不调用模拟访谈或伪造确认。固定新 case ID，claim 即消费；artifact root 独立，session 仍保持原两层结构，所有写入与子进程纳入原 ledger owner。
4. **一次修复与交付。** policy 读取真实 case 时钟，不改旧 snapshot deadline/stop。V2 先核失败任务、固定反馈文件的内容/来源及 registry 证据，再调用 `claimValidationRepair`；引用字符串相等不算文件已认证。复用有限 repair，保留原失败及全部费用，正常鼠标与媒体验收分母不变；结果不称正式生成或最终试玩已通过。

## 验证与边界

- 本步先写纯数据红灯：合法真人/验证输入、交叉 profile、伪确认字段、缺来源/错误身份形状、重复或非法验收、深冻结；fixture 明确不是生成游戏和真实授权。
- 后续再用真实 controller + fake provider/build/browser 验证同账本请求归属、真实当前窗口、输出上限/reservation 一致、旧任务禁止派发、一次修复、停止与中断收敛；实际 core 的 quote/claim/identity/gates 由 V1 证据复用，仅测新接线。
- 根 build 不覆盖 probes；新 probe 模块需显式 strict noEmit。编译、真实子进程与浏览器先协调；本 implementer 不读取真实验证目录、session 或模型配置，不调用付费服务。
- B 独占 runtime validation core、run/run-types/run-validation/execution-window 及 legacy gate；本步不修改这些路径。V1 `d46294d` 已独立 SOURCE_READY，本步仅只读核对其 API；后续 routing 以 merger 的已审主线 checkpoint 为依赖。

## V2c 运行时路由小步

- 已无冲突合入 V1 主线 checkpoint `afbbd15`。新增 `validation-scope.ts`，由明确 case/window 和可信只读 `readScope` 返回完整验证要求及真实 operator receipt 字节；在 planner、roleFactory、DAG、每个新 task phase 和评审格式纠错前核对持久窗口、完整要求、原决定 JSON/hash。读取最多 5 秒并保留清理时间，停止或超时后的迟到结果不授权。该回调与 capture/verify 同属可信 host，不能自证任意恶意 callback；固定 driver 的实际 reader 下一步接入，Git/input 身份仍由 core 每次 reserve/admit 复核。
- 复用原 planner 和串行 DAG；validation 禁止 scheduling 配置，`withDagOwner` 仅新增显式 case/window guard，继续共用原 WeakSet。规划只使用已声明 planning grant，不保存已通过的伪任务；三角色 ID、grant 和 coding 的 design/art 依赖由主机检查。profile 3 journal 明列 validation window，历史 deadline 留原值；部分捕获恢复复用固定来源和内容签名，未启动下游保留未启动及阻断，不重付作者。
- `createRoleBudget` 把实际 PiRequest 的模型、输出上限、字节和图像标志随 case/window/purpose 传入原 reserve/admit。角色 SDK 配置直接取声明权限：planning 4096、design/reviewer 16384、art/coding 65536。reserve 已成功而 admit 在 SDK 发出请求前失败时，先落真实 host `not_sent` 证据再取消预留；证据保存失败则留存 exposure 待核实，不制造 provider usage。
- 新接线两项正向先红后绿，两个 admission 未发送边界及捕获中断各先红后绿。最终 23 项 `validation-routing.test.ts` 通过，涵盖真 controller/registry、fake SDK/build/browser、完整三角色+一次评审格式纠错、计费/compaction/不重付、全文 AC/operator 来源漂移、旧 profile 拒绝、DAG owner、取消/超时及迟到结果。受影响角色/planner/协议/依赖恢复 74 项及两个 v2 管线代表通过；源码 `npm run build` 与新测试显式 strict noEmit 通过。
- 该小步没有修改 B private core、正式 CLI/host 或旧 probe；尚未接 `validation-run/validation-driver`、原生 host 子进程归属和 coding-only 一次 semantic repair。首个固定 case 沿旧 bounded pilot 范围：design/art 失败报告差距，不新增上游重规划或替换下游任务。后续须核真实反馈文件、原失败任务与 registry，不能让旧 policy 的 original stop 冒充当前 case 时钟。

## 共用子进程与修复策略小步

- 从正式 host 抽出 `recovery/owned-command.ts`，正式 host 只留薄 wrapper，验证 host 后续使用同一 helper。helper 根据明确 formal 或 validation case/task/window 向真实 controller 查询权限、deadline 与已知费用，原 `prepareOwnedChild` 先落 ticket、spawn gate launcher、登记 PID，最后才向 worker 发送 start。保持环境白名单、无 shell、Windows 隐藏窗口、输出与时间上限；不新建 owner 或 executor。
- launcher 保持与 owner 的 IPC。Windows owner 丢失时 launcher 用原 `stopBrowserProcess` 清 worker 树并等待退出；父侧取消/超时沿原树清理并等待 close，POSIX 断连使用所属进程组终止。正常 helper 成功仅表示可信 worker 正常退出，浏览器及其内部资源仍须由原 runner 的 finally/cleanup 报告证明；不能由任意 worker PID 退出推出所有外部子进程都已结束。未登记 PID 的未知 spawn intent 保留原恢复拒绝语义。
- 原 repair policy 新增显式 validation 分支：按真实 case stop/deadline、已声明 repair grant 和累计/增量 exposure 评估一次 coding 修复，保留原始 run 时间与停止；不伪造 active v1。`createLinkedRepairTask` 复用原独立 context、固定新版本、验收及失败历史，只接受 core 已 claim 的唯一 repair ID。完整实际反馈文件与 registry 认证仍由下一 driver 完成，policy 本身是纯判断。
- validation 失败回执成功持久化之后，才把该回执的固定引用加入同 attempt 的 failure evidenceRefs；旧 v1/v2 不变。写入失败不会补引用或 claim；这不是 passing evidence。
- 证据：`tests/runtime/owned-command.test.ts` 三项真实 Node child 先红后绿，覆盖登记前禁写、validation coding 取消 worker/孙进程退出、父死断 IPC 清理并保留崩溃 owner；所有 fixture PID 退出。`validation-repair.test.ts` 三项通过（两个先红后绿及一个回执保存失败）；旧 `repair-policy.test.ts` 24 项、正式 `entrypoint-host.test.ts` 两项定向代表通过。`npm run build` 与两项新 test 显式 strict noEmit 通过，无浏览器/游戏编译/API。
- planning bootstrap 的 core child purpose 修复由 B 独占，候选 `3704bdd` 尚未作为本提交依赖；本提交不绕过它，也不表示 validation 工具链启动或 fixed driver 已完成。

## 固定入口准备与 scope 小步

- 新 `validation-run.ts` 的只读 preflight 直接读原 snapshot，不调用旧 `RunController.open`。实际 main/SHA/index/dirty、源级 READY+祖先、冻结输入、原 ledger 身份/历史费用及 core quote 均核实；不创建 owner、目录、receipt 或停止事件。任务前置只要求源代码就绪，避免把 COS10 实测结果作为自身循环前置。
- 可信 host.prepare 只做免费只读准备；重核 quote 后才持久 operator 来源、claim/open 和创建案例目录。单例 OwnedWork 覆盖执行，结束停止、drain、报告和 owner 关闭保留同一账本事实。未完成启动仍消费该 case；原生 host 尚未绑定，新 flags 暂未公开到旧 `run.ts`，测试 host 不可由 CLI/环境选择。
- 新 `validation-driver.ts` 当前只装配 actual readScope：固定 repository/root/case，真实 Git+九文件、原 operator regular bytes/sha/JSON、registered planning input 的 provenance/type/file-set/bytes，以及 `stageAcceptance` 全文。它只读且接受现有 runtime scope 的信号与五秒边界；不构造真人确认或 passing evidence。
- root 穿刺发现 host 字符串 passed 不足以报告成功。四个 stopped/expired/unknown/missing accepted 反例先红后绿；wrapper 自身结束前检查当前窗口和费用、匹配真实 registry.current，清理后再检查时间与费用，原停止理由/未知预留保留。真实游戏 proof、完整 AC 和独立 review 仍属待接原生 host。
- 验证：`tests/e2e/validation-run.test.ts` 9 项、`tests/e2e/validation-scope.test.ts` 1 项均通过；初始入口四项缺接口红灯，完成门槛四项误 passed 红灯均有记录。真实 Git 只操作临时 repo，ledger 为明确 fixture；无 key/session/真实验证根读取或模型/browser调用。显式 strict noEmit 覆盖两个新 probe 和三个 test/fixture，最终 exit 0；没有无关根 build。

## 原生 worker、反馈认证及公开 flags 收尾

- 已合入已审 main `6695cea`，复用 planning child purpose 修复。新增 validation-host/worker 装配原 toolchain/build/renderMedia/runAcceptance；旧 driver 仅扩明确 validation 分支与受控 IO 参数，不复制执行器。原生准备在 claim 前只读，case 目录与全部工作在 claim 后，45 分钟包含启动/工具链/检查/修复/清理。公开 run.ts 两个严格 flags 固定 native host，无 fixture/root/reset/time 参数。
- 新分支读 actual scope，跳过旧模拟访谈包装，planning ID/三 role ID/额度来自同声明；validationCase deadline 单列到模型规则与 packet。正常输入 plan 仅换当前实际 taskId，原 8 AC/媒体/步骤不变，legacy COS-10 标识保留旧路径。
- 写入 failure-snapshot 新 journal stage，记录原真实 feedback 字节摘要与当时 input/artifact/evidence 全文件签名；它不是 passing evidence。driver 验原 author/capture/失败快照、原 immutable 文件、原 session 和 registry/code 来源后才 wx stage、claim 及创建新 repair workspace/context/v2。保存失败或源码/evidence/dist 漂移不领 repair。只 coding code_defect 一次，design/art 失败和无可信诊断的评审意见报告差距。
- 最终 fake native flow 在 `9a91f75` 时间戳修复后 passed（40.47s，9 假请求、一次评审格式纠错、一项 coding repair，原失败与旧 authors/v1 留存）；public routing/早失败检查通过。新增失败快照测试 7/7，旧 preparation/diagnostics 11/11（包含一次额外 Edge 诊断 fixture 1.83s，已退出）。不以这些 fake 成绩冒充真实游戏生成。
- 唯一新实际 generic smoke 1/1，test34.08s/runner37.02s：planning owned bootstrap、coding 实际 build/正常点击、registry proof、art render 按序，0 model request/generatedByCosmos:false，Edge PID 19764 已退出，owner 已关闭。完整证据保留在 `.cosmos/validation-host-smoke-47f42edc-82d2-4450-85b2-21c796117ecf/`。没有真实验证账本或旧 consumed case 操作。
- 本段通过 `npm run build` 与显式 `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --types node`（新 probes/native tests/worker smoke/repair test）。源码仍须独立审查及 merger 主线组合核对；真实付费 case 留给协调方在最终 main 新 preflight 后执行。

## Case 2 声明与免费准入

- [ ] 专属 implementer 在复用 managed worktree 的 `codex/validation-case-two` 分支仅更新固定声明为 `cos20-native-validation-2` 和入口门槛；相同冻结输入、caps、¥150/¥30/¥5、45 分钟/40 调用/一次 coding repair 保留。fixture 用真实 core 合成并停止 case 1，保留旧字段和 grant 前缀，先红后绿验证一次消费、幂等及拒绝路径。入口要求已停止 case 1 与 COS21 独立 `WINDOWS_PUBLICATION_SOURCE_READY`、正确集成状态及两项 main 祖先提交；不等待 COS10/COS20 实际结果关闭。独立 reviewer 检查实际 diff 后，仅 batch08_merger 合入；协调方随后检查实际 Windows publisher 和最终 main preflight，才执行真实 case 2。

## COS-22 / Case 3 请求包络

- [ ] `codex/validation-case-three` 复用干净 managed worktree，从已审 `f5522e8` 主线开始。最小 core 改动仅允许声明 v2 最多 80 请求，v1 的 40 次与未知版本拒绝保留；固定新 case 3、同账本新 ¥21 grants，原 ¥5/45 分钟/¥30/¥150、caps、输入及完整验收保留。
- [ ] 入口要求历史 case 1 存在、current case 2 已明确停止、费用已对账；COS20/COS21 精确 source marker、集成状态和两项 main 祖先 SHA 均通过。零 API 临时 core/Git/FS fixture 明确 seed 两个 v1/40 历史 case，核对 quote/决定/grant/fee/request/clock 前缀及一次消费；先红后绿检查新 ID/version、80/81、旧 40/41、保留预算和拒绝路径。
- [ ] 专属 implementer 提交准确 SHA、定向测试与 strict noEmit 证据，交独立 reviewer；仅 batch08_merger 合入 main。复用未变更的 browser/registry/native 完整路径证据，协调者核对最终 main、最新只读 quote 和资金后运行真实 case 3。源码候选和合成 fixture 不声明真实生成通过。
