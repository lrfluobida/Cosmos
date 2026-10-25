# COS-125 · 普通设计作者的预算压力压缩

状态：已独立APPROVED_PLAN并获Root批准发布与免费实施；设计作者不得自批准，源码独审与集成待完成。

审批记录：[COS125 / #126](https://github.com/lrfluobida/Cosmos/issues/126)；独立 reviewer `design_context_plan_reviewer` 给出 `APPROVED_PLAN`、无finding，Root批准固定输入的规格/计划发布与免费源码实施。此为设计/计划批准，源码须另行独审与集成。

- 批准规格输入 SHA256：`34185a611eceba6feffe664c4c73d3331034f4a7d53c34ec6135b066e7e6f5f2`
- 批准计划输入 SHA256：`6ea930a2b3ad51bf6030e736fc858346d38cbf199683b9f8e66e9661146ddbb5`

配套[实施计划](../plans/2026-10-25-design-context-budget.md)。

基线：main `9ecc24508da4309a574b6f0a53a4300b2300ee6c`；当前相关运行源码为 COS124 `7e51115bdf87aa8cbe7533a27dc858d9fc0932d7`。room9 已永久闭账，shared revision 3354；其原输入、原输出、native session 和账本只作为只读诊断证据。

## 1. 问题与目标

room9 普通设计作者完成 8 次请求后，设计额度 675000µ 已结算 318895µ，余额 356105µ。第 9 次请求的原 SDK 上下文为 206370 bytes；生产报价 `inputBytes * 2 + maxOutputTokens * 8` 在最低 8192 输出时为 478276µ，未发送即被拒绝。全局预算仍有余额，reserved/unknown 为 0，原 deadline 未到。

验收计划经历四次完整写入，旧版本继续留在上下文中。最后两次重写没有改变反馈所指的第一阶段 52 个步骤。最终 design.json 通过生产结构校验，acceptance-plan.json 仍缺第一阶段 checkpoint；本卡不修这些历史产物。

目标是在普通设计作者仍能承担原 8K 请求时，用既有原生 SDK 压缩较早降低上下文；摘要无法按原预算执行时，只允许一个严格限定的未派发跳过，继续原作者轮次。

## 2. 范围

只适用于现 COS124 启用预算内输出选择的普通 design 作者：ordinary 为真，且不是 validation、preparation、human、binding 或 inherited；purpose 为 author、role 为 design。planning、reviewer、art、coding、旧模式和 fixed validation coding 行为不变。

保持 design 的 32768 输出上限、8192 普通输出下限、32 次请求、thinking off、120 秒单请求上限、原 task grant、总预算、原 deadline 和清理时间。只使用已固定的 pi 0.99.2。没有新 session、retry、恢复槽、grant、生命周期或反馈增强。

## 3. 接口与文件

### 3.1 原预算判定的窄类型

在 `src/budget/ledger.ts` 导出 `InsufficientReservationBudgetError extends Error`，带只读 `scope: 'shared' | 'task'`。只将 reserveEntry 现有这两处抛错改为该类型：

- `Shared budget is insufficient.`
- `Task budget allocation is insufficient.`

保持原 message、name=`Error`、抛错顺序、账本变更和正常返回行为。关闭 grant、缺 grant、未知费用、非法金额、重复 ID、group 等错误保持原异常。普通模式不存在 budget group，不增加 group 分类。

必要性：新只读判断需要区分“真实预算不足”和其他拒绝，才能返回 skip。继续用真实 reserveEntry 对 ledger clone 报价，避免复制预算算术或按错误字符串匹配。

### 3.2 作者预算策略

在 `src/roles/author-output-budget.ts` 复用现 guard、estimate 和 clone quote，提供：

```ts
authorBudgetOutputLimit(input): NonNullable<PiSessionOptions['requestOutputLimit']>
authorBudgetCompaction(input): Pick<PiSessionOptions,
  'requestCompaction' | 'requestCompactionAdmission'>
```

两者使用同一 input 类型，保留 controller、original snapshot、task、authority、floor、maxOutputTokens、estimate。共享文件内的私有原 authority 读取与只读 quote 函数，不另建预算服务。

每次读取须保留现 run/spec/ledger/grant/window/deadline 恒等检查，合并 controller/caller signal，并在异步读取前后检查取消和原 5 秒清理余量。quote 对每个候选使用新的 ledger clone，只捕获上述窄类型并返回不可承担；其他异常继续抛出。

输出选择接受可信 Pi 传入的正安全整数 cap，要求 `cap <= configuredMax`；从该 cap 向下选至 `Math.min(floor, cap)`。普通作者实际传入仍为 32768；原生摘要可能传入 8192 或更小值，不能再要求它等于 32768。保留现非单调 estimate 支持、每 64 次让出事件循环和取消检查。

### 3.3 Pi 摘要预检

在 `src/providers/pi.ts` 定义以下可信内部接口：

```ts
type PiCompactionBounds = Readonly<Pick<PiRequest,
  'maxOutputTokens' | 'inputBytes' | 'hasImages'>>;

requestCompactionAdmission?: (input: Readonly<{
  summary: Readonly<Omit<PiRequest, 'estimatedMaxCostMicroCny'>>;
  ordinary: PiCompactionBounds;
}>, signal?: AbortSignal) => Promise<'admit' | 'skip'>;
```

该回调只能与 requestCompaction 一起配置，只在 adapter 创建的自动 optionalCompaction 操作内调用。手动 compact 和 readonlyPrompt 不获得跳过行为。ordinary bounds 是本次成功工具边界的原投影；summary 来自原 SDK 实际交给 streamSimple 的 context，使用现 requestInputBytes 规则，不构造近似摘要 prompt。

在 `RoleFactoryOptions` 增加可信开关 `ordinaryDesignBudgetCompaction?: true`。factory 仅对本节适用的 design 作者设置两回调及 `compactionKeepRecentTokens: 8000`。entrypoint-host 在现 COS124 的同一个 ordinary 条件内传入该开关，其他角色保留原 compaction 设置。

## 4. 确定的执行流程

### 4.1 成功工具边界

保留现非错误 toolUse 边界、readonly 排除、同投影去重、压缩后至少增加 32768 bytes 才再考虑、无收益停止后续压缩等约束。

新策略只在当前原 authority 下同时满足以下两点时返回 true：

1. 完整 32768 cap 的 clone quote 不可承担；
2. 同一实际普通输入的原 8192 floor quote 仍可承担。

不使用 fixed coding 的 131072 字节门槛或“最低输出已经不可承担”条件。如果普通 floor 已不可承担，正常请求仍按原规则失败，本卡不新增晚期挽救路径。

仅对此新策略，adapter 在进入可选压缩前还须留下最多 2 次原生摘要加 1 次普通继续的请求空间；剩余少于 3 个 slot 时直接保留普通执行。此判断不发摘要、不增计数、不产生新生命周期状态。

### 4.2 实际摘要请求的预检顺序

原 SDK 决定摘要内容和分段。adapter 先验证 model、session/caller 状态和 SDK maxTokens，得到真实 summary cap：

```ts
Math.min(config.maxOutputTokens, 8192, sdkOptions.maxTokens)
```

随后计算真实 summary inputBytes/hasImages。**新预检必须发生在本次 request/readonly 计数增加、requestOutputLimit、任何真实 budget.beforeRequest 和 provider dispatch 之前。** 已发生的其他请求计数不得回退。

authorBudgetCompaction 的 admission 回调读取一次最新原 authority/ledger：

1. 实际 summary cap 的 clone quote 可承担：返回 admit。
2. 仅该 quote 抛 InsufficientReservationBudgetError：再检查原 ordinary bounds 的 8192 floor。
3. floor 可承担：返回 skip；floor 也不可承担：抛出预算错误，保留失败。
4. 任何其他拒绝都抛出，不能变成 skip。

admit 后照常进入请求计数、requestOutputLimit、估算器、原 deadline 检查、真实 reserve/admit 和传输。预检不保留钱、不授权请求、不绕过第二次检查。预检后的 authority 或预算竞态按现规则失败。

### 4.3 未派发 skip

adapter 用当前 optionalCompaction 对象上的私有标记记录 skip，并向原 SDK 返回/抛出专用的内部摘要拒绝；该路径不得调用全局 `fail()`、beforeRequest、afterResponse 或 provider，不生成 billing/usage/成功摘要。

只有该私有标记对应的 threshold compaction_end，且非 aborted、无 result、有错误，才记录“native 已拒绝摘要”。不按模型文字或普通异常消息推断 skip。

调用现 native preparation 返回后，复用 length fallback 的检查：没有 sticky failure，caller/session 仍有效，原 leaf 未变，原投影逐字未变，成功 checkpoint 计数未变，且本次操作确实收到匹配的 native 拒绝事件。通过后设置 autoCompactionDisabled，继续原普通轮次；下一请求仍重新选择 cap 并真实准入。任何检查不成立立即失败。

双摘要路径中，第一段若已发送并结算，其费用、记录和请求计数全部保留。第二段在预检处 skip 不增本段请求计数、不产生费用，整个失败摘要不得写 checkpoint；只在当前余额仍能承担原普通 floor 时继续。不得撤销第一段费用或复用其内容伪造摘要成功。

### 4.4 已有行为

- SDK prepareCompaction 无可压缩内容：原 no-op，不发摘要、不写 checkpoint。
- 已结算 length 摘要：保留原安全回落和原费用，不扩大适用条件。
- beforeRequest 的真实 reserve/admit 异常：保持 fatal；严禁 catch 后转 skip。
- 取消、deadline、权限漂移、未知费用、坏 estimate、SDK 异常和非法 summary tool call：保持 fatal。

## 5. 原始来源与成功边界

原 loader 始终提供 systemPrompt + config.context。SDK checkpoint 保存当前完整 system message，projection 将其与模型摘要分开恢复，下一轮仍按原 loader 刷新。原 packet、输入引用、inputFiles、ownership、文件工具权限闭包和 beforeTool/source 校验继续生效。

SDK 将摘要中的 toolResult 截至 2000 字符，因此模型必要时通过原授权路径重读完整来源。摘要不是需求或权限的新 authority。capture、validator、独立 reviewer 和原作者 JSON handoff 继续读取/验证真实输出；不能从压缩或文件存在推断完成。

## 6. room9 的免费容量依据

请求 6 工具完成后：下一输入 127550 bytes、余额 507835µ、完整 32K quote 517244µ、8K quote 320636µ，满足提前触发条件。keepRecent8000 的原 SDK 实际摘要输入为 47042 bytes，8K quote 为 159620µ，保留最后一版完整计划和反馈。

原 SDK model contextWindow=1000000/maxTokens=384000，此处 native 摘要 maxTokens 为 384000，经 adapter 限为 8192。keepRecent8000 只影响保留上下文，不是摘要输出上限。

纯函数 fake-stream 测量中，摘要为 8192/32768/65536 个 ASCII bytes 时，摘要最坏预留加下一次 8K 报价为 342372/391524/457060µ；100000 bytes 时为 525988µ，超过该余额。这些是容量测例，不是实际模型摘要。不得假定 token 对应固定字节；真实摘要与压缩后的普通输入分别按原账本准入，不保证本卡使游戏完成。

## 7. 验收与交付

必要 SOURCE 验证走真实 createRoleFactory → createPiSession → pinned SDK，仅底层 transport 使用 fake；不替换预算策略、compaction、session manager 或实际工具边界。测试见配套 plan。

通过条件包括：早触发、实际摘要 quote、合法小 cap、skip 无派发/计数/账务、副作用不变、双摘要已付费用保留、原输入权限保留、严格失败边界、capture/独审要求不变。既有兼容证据按代码影响复用。

实施者在独立 managed worktree/branch 提交 exact SHA、测试证据和缺口；独立 reviewer 审实际 diff。Root 安排唯一 merger 集成。本规格已获批准发布与免费实施；源码尚未完成独审和集成，仍不授权重新运行 room9。
