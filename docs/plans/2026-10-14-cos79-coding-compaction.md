# COS79 有界编码上下文压缩实施计划

> 使用 writing-plans、TDD 和 verification-before-completion。`cos77_implementer` acting COS79 implementer；`cos76_implementer` 在完成 COS78 后独立 review COS79；`batch75_76_merger` 为唯一 merger。COS78 仍由 `cos77_implementer` 独立审查，其最终 diff 审查优先。本计划先审，生产实现另等设计实验后的独审批准。

**目标：** validation coding 作者及同角色 repair 作者，在成功工具回合之后、下一次普通请求准入之前，能够在原费用、请求次数和时限内使用原生 Pi 压缩，并继续同一 attempt。

**基线：** `9698a54cf9898d03746af18b4e47d78cef04fb4f`，managed `cos74-frozen-template/Cosmos`，分支 `codex/cos79-coding-compaction`。COS79 [#80](https://github.com/lrfluobida/Cosmos/issues/80)，id5835178325，父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)。生产阶段复用 COS78 已审集成后的 main；不集成未审 COS78 改动。

## 已核实调用链与窄设计

SDK 0.99.2 的成功工具回合在 `agent.prepareNextTurnWithContext` 进入现有 `_compactBeforeNextAssistantResponse`；native threshold compaction 经 `_runDefaultCompaction → compact → completeSummarization → agent.streamFunction → ModelRuntime.streamSimple`，仍经过当前 Pi budget/window guard。原生 `compact()` 会先 abort 当前 run，不能从 busy 工具回合调用。

只为目标角色提供可信可选配置。adapter 保存 `SettingsManager.inMemory`，包装公开的 `session.agent.prepareNextTurnWithContext` 并调用原 hook。已完成、未失败/取消的工具回合且确有下一普通请求时，可信 host 策略评估上下文字节和当前 authority；触发时临时 `applyOverrides` 设 enabled=true、reserveTokens=model.contextWindow、keepRecentTokens 保持，await 原 hook 后 finally 恢复 disabled。正常 post-run/overflow 自动恢复保持关闭，不直接调用 private SDK 方法，不增加第二套摘要器或消息重试。

临时 reserveTokens 也会抬高 SDK 摘要请求值，所以独立摘要上限必须先接通：目标角色原生摘要的有效上限不超过 `min(8192, 原配置cap, SDK本次有效maxTokens)`；SDK maxTokens 无效时拒绝。仍使用 COS77 收缩策略、实际 inputBytes/hasImages 和原报价，不降低字节保守估算。原生 split-turn 可能串行两次摘要，逐笔使用原 author grant、ledger、request count、deadline，均不得绕过费用守卫。

订阅 native compaction_end，失败/取消锁定 session failure，原 hook 返回前检查，防止 SDK 内部 catch 吞错后发送普通请求。摘要 length/unknown/非法工具调用不能成为已保存 summary；第一笔已收费而第二笔拒绝时保留第一笔真实费用，不退款、不写残缺摘要、不继续。固定系统包与工具 loadout 由原 hook 恢复；task、attempt、author/context 身份、文件权限、handoff 与 capture 验证不变。

## 第一阶段：免费设计实验，生产文件不改

- [ ] 初始计划获独立 PLAN_APPROVED 后，在独立 SOURCE/TEMP 目录写最小合成实验。使用真实 createPiSession/AgentSession、native compaction 和真实免费 controller；fake provider 只经原 stream 返回合成结果，fetch 禁网并计数。只读代码与本实验新建的合成会话；禁止读取或改写真实/旧 session、thinking、ledger、key。
- [ ] 用公开 AgentSession.prompt 的测试注入点安装上述公开 hook；通过已有可信 requestOutputLimit 在实验中限制摘要cap，生产源码不改。摘要必须由 native 摘要请求的 fake provider 返回并走 usage/保存路径，不直接注入 compaction entry 或 extension summary。
- [ ] 构造多次 read/toolResult、长工具结果及大 thinking 的合成原生回合，包含 `251339 bytes / remaining1069753µ`：65536 普通输出的1026966µ仍可预留时，必须提前触发压缩。不得先让预算失败锁住 session，再吞错重试。
- [ ] 仅以 128KiB projected-input 字节阈值和普通 full-cap 预留占剩余额度的压力为候选，实测实际 native summary 输入、1/2笔请求cap、预留与结算、压缩后普通输入、实际剩余额度和同 attempt 继续。候选值不是批准的生产阈值，不保证费用或模型效果；本阶段输出明确固定条件、每个边界的数字与不足。
- [ ] 覆盖摘要本身预算不足、两笔中第二笔不足、unknown、deadline/stop、余额race、length、摘要工具调用；不得发送后续普通请求或保存失败摘要。覆盖重复相同投影不重复付费、压缩不降低下次输入时不循环摘要，以及固定验收包、工具集合、文件状态与正常 handoff/capture 未降级。
- [ ] 保存原始测试输出和合成输入构造方式；把最终触发规则、去重/无收益条件与实验结论补入本计划，交独立 reviewer 再审。若在合成边界无法产生安全且可承担的压缩，停止该路线并报告证据，不以调大预算或改旧会话绕过。

## 第二阶段：经实验设计批准后才实施

- [ ] 在 `src/providers/pi.ts` 最小接入可选可信配置、公开 hook、独立摘要cap及失败锁；同一不变投影不得重复摘要，使用本 session 的 SDK 投影/边界状态，不新增仓库或会话扫描框架。
- [ ] 在 `src/roles/factory.ts` 仅为 validation coding author/同 coding-role repair 接线；reviewer/formal/planner/design/art、只读格式纠正及未配置路径保持。费用仍由既有 provider-budget/controller 处理，无新账本字段、额外额度、次数或时钟。
- [ ] 将合成实验的必要边界纳入定向 tests，先 RED 再最小实现；运行新 source、compiled 代表、COS77 cap 与现有 compaction/request-window 受影响回归。复用已审重型迁移/repair证据，不重建20分钟seed或重跑17分钟链。
- [ ] 若实际 C9 尚未消费，在 COS78 固定 C9 entry 的 sourceMarkers 增加 COS79 `VALIDATION_CODING_COMPACTION_SOURCE_READY`，沿用 reviewed/merge 双祖先门禁；覆盖缺标记/非祖先拒绝。不创建 case10、不放宽旧历史来源。
- [ ] typecheck/build、affected strict 检查、UTF-8/LF/中文回读、git diff --check；提交 exact SHA 与证据交 reviewer 规格→质量独审，再由唯一 merger 集成。共享 PROGRESS/spec/issues/mapping 由 merger 记录。

## 修改范围与状态

当前只新增本计划及 `docs/specs/cos79-coding-compaction.md`。实验后预计仅 Pi adapter、role factory、必要 C9 marker caller与定向测试；不改 SDK依赖、预算/ledger schema、自动重试、author capture 或其他框架。阈值和最小源码补丁在实验后明确，不把只读诊断当作已通过实现。

Root反事实背景：用同一C8元数据和历史费用从1233190µ开始，前14请求cap仍65536，之后只剩745662µ；下一405672-byte普通请求的输入预留811344µ、加4096输出844112µ均不可承担。这不预测随机C9，也不证明native摘要一定不可承担或必能省钱。C8保持停止；C9未消费，paid暂不开始。当前 SOURCE_NOT_READY / PLAN_PENDING，仅源码与免费fixture范围。
