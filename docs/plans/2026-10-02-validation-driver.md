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
