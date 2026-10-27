# 普通设计作者的预算内只读收尾

状态：独立 `reuse2_recovery_plan_reviewer` APPROVED_PLAN、无remaining，Root已批准固定工程设计、免费源码实施及登记；本卡已最终独审并集成，仅source-scoped完成。下文待审/未授权源码字样属于批准前原文，当前状态以本段为准；未授权真实模型、结算或旧run恢复。

任务：[COS-136 / #137](https://github.com/lrfluobida/Cosmos/issues/137)，原生父COS18/#19、父[x]。实现者 `author_budget_recovery_implementer`，独立源码reviewer `author_budget_recovery_reviewer`，计划reviewer `reuse2_recovery_plan_reviewer`，唯一merger `public_agent_batch_merger`。

- 批准规格输入 SHA256：`39f13d74d89cc5e2789f7714f16307b96f6ac28cf95a563b7407ec8b5ec00150`
- 批准计划输入 SHA256：`c52c6679543d68f3aeccc9cbd1dd3f76dae4ff404a131b647b3d8760abe43bcd`

工程基线：`50f4633b1e682ccadf4844bf8414994a866813a5`。[配套计划](../plans/2026-10-27-ordinary-design-budget-finalization.md)。两卡并行且不互阻；两卡源码和必要组合已通过，实际运行仍由Root另行安排。reuse-2已由Root原API完成会计结案，child112和旧receipt保持、永久不恢复；本卡merger/implementer不操作真实controller/ledger/coordinator。

状态：固定草案 v1，待独立规格与计划评审。仅授权写本目录的规格和计划；本稿不是源码实施批准，也不授权操作真实 run、账本或模型。配套计划：[正式实施计划](../plans/2026-10-27-ordinary-design-budget-finalization.md)。

诊断基线：`50f4633b1e682ccadf4844bf8414994a866813a5`；已发布源码组合 `06709f34e11512f62fc83d2b1ef4591f9c467f32`。相关契约为 COS128 的单次作者格式纠正、COS132 的原额度内独审保留及 COS134 的独审后设计修订。当前主线可能并行进行独立的交付生命周期修复；本卡不包含该修复。

源码结果：COS136 / #137已源码范围完成；[精确批准](https://github.com/lrfluobida/Cosmos/issues/137#issuecomment-6431623562)、[完成关闭](https://github.com/lrfluobida/Cosmos/issues/137#issuecomment-6431628170)及父[x]已GET核证。独立author_budget_recovery_reviewer批准 `6e7228e17c26dd27ff49872dba1f0f19d5091f86`，无剩余P1/P2；无冲突合入发布 `aa50ecd1a18fc88fed5a27e8966cdcdddde34a38`，14候选独有文件精确一致，COS135四独有文件及entrypoint证明选择改动完整保留。

main typecheck/build exit0，最小组合5/5、0skip、TAP46061.5526ms：native无工具收尾、实际host/capture/独审、codingrepair祖先认证、支持的continue无新window收尾权限，以及COS135初轮失败proof。新ordinary design可信未发送预算拒绝只复用原同session/单次correction槽；预算/独审保留/32计数、严格proposal与完整验收保持，checkpoint只补字段反馈。

F3原完整历史TEMP证据复用：95134 bytes、4096 cap、223036µ≤231989µ、余8953µ；最高合成结算后余383953µ≥375000µ独审保留。最终prompt/provider/factory/原生编码路径未变，COS135组合只影响执行后的证明/资金reader。原native/affected、Edge10/v2交付、媒体171步/四故障按有效范围复用，未新跑浏览器或大矩阵，不把小输入代表混为F3测量。 仅SOURCE范围完成，真实模型生成和人工体验仍未验证；本批未操作真实funding/controller/ledger或启动付费。总136/root100/父30个源码子项完成，父COS18整体仍open/partial；后续实际运行由Root另行安排。

## 1. 问题与已经建立的事实

reuse-2 的作者在写后结构校验通过后仍选择两次 read，中间发生一次摘要，随后普通请求的 8192 输出下限无法准入。原始错误是 `author_review_reserve`，并非 proposal 解析失败、provider 截断或达到 32 次上限。

只读证据根目录：`E:/develop/Cosmos/.cosmos/public-validation/room-20261027-reuse-2/run`。原生文件为 `sessions/6e5aeed6-6f61-4d4a-9dee-615ce93d9b70/author/2026-10-26T22-38-00-844Z_01a17a5d-0c8c-7145-b216-f9b58679f36c.jsonl`。

| 事实 | 原证据 |
| --- | --- |
| 最后 edit 的写后 advisory 为 passed | 原生 L46/47 |
| 唯一显式 validate-game-design 返回 failed | L40/41，Invalid visible save checkpoint |
| 两次额外 read，中间一次摘要 | L48/49、L50、L51/52 |
| 下一普通请求未发送，usage 全零 | L53；failure.json 的 author_review_reserve |
| 作者已发 24 次，含 3 次摘要 | 24 个 author billing，全部 settled |
| 作者费用 518011µ；摘要费用 92408µ | 原 billing 与 snapshot ledger |
| 全 run 540200µ，含 planning 22189µ | 原 snapshot；reserved/unknown 均为 0 |

实际 task grant 1125000µ，其中保留 `floor(grant/3)=375000µ` 给独审。作者上限 750000µ，故末次拒绝时可动用余额为 **231989µ**。用 pinned SDK 的纯内存 projection 复原，原 L52 后请求输入为 **93428B**，8192 报价为 **252392µ**，差 20403µ。对同一旧输入计算 4096 仅为 219624µ；新增提示、原生错误条目与工具禁用都会改变最终输入，所以这不是收尾请求已经可付的证明。

不存在报价和实际费用双计：报价 reserve 操作的是 ledger 克隆；真实 reserve 前再核对独审保留；settle 会把 reserved 清零后写 actual。原预算保护应保持。三次摘要均成功，冷却内的唯一预算压力例外已在第二次用掉；第三次后增长不足 32768B，不能再靠摘要获得机会。

`requestAuthorProposal()` 只有在原 `author.prompt()` 成功返回后才解析或纠正。此次 prompt 先抛资源错误，现有 4096 只读格式纠正入口不可达，最终 proposal、纠正、capture、独审均为 0。原始失败和生命周期状态由 Root 保留，本卡不恢复它。

## 2. 选择与范围

采用：**可信发送前资源拒绝后，在原活会话中使用原唯一只读机会，请真实模型报告当前工作状态。** 普通写作下限、摘要策略、总额度、独审保留、时钟及请求计数均保持。

另外两个方案不采用：

- 统一把普通写作下限降到 4096：同时改变文件写作容量，仍不能保证留下交接机会。
- 结构通过后由 host 填 proposal 或自动判定完成：会把结构反馈升级成语义结论，也没有真实作者交接。

本卡只覆盖新普通设计执行中的 design 作者及同一新运行按 COS134 真实独审意见获准的 design revision。后者是原已授权的新 task/attempt，仍受自己的原 grant、原会话 32 次与该运行截止约束；本卡不增加修订次数。planning、reviewer、art、coding、fixed validation、preparation、modular 与追加 continuation 不获此能力。

必要邻接改动仅为 visible save checkpoint 的字段级错误信息。它减少本例已经发生的试错，不调整 schema、验收要求、步骤上限或任何通过条件。

## 3. 最小持久化版本

在现有 `execution.json` 增加一个可选字段：

```json
{"ordinaryDesignFinalizationPolicy":"budget-followup/1"}
```

- 只由可信新普通入口选择，必须同时有 `ordinary-design-execution/1`、`ordinaryDesignBudgetPolicy:"review-reserve/1"`、`authorProtocolCorrections:1`，并满足当前普通需求且无 preparation/codeProfile 的范围。不能由模型、CLI 数值或任务字符串选择。
- 省略保持旧行为和旧记录形态；null、其他字符串或不兼容范围在角色创建前拒绝。resume 读取原 execution，不能因当前代码升级而补选。
- 不升级 `review-reserve/1` 的含义，避免把收尾功能混入已冻结的预算分配及 COS134 兼容判断。只有上述一个新可选版本值，不建立可配置策略框架或新的策略文件。
- 同一字段仅镜像到获准 design task 的既有 `RecoveryOrigin`；非 design origin 仍省略。`TaskJournal.open` 继续精确比较。初始 design 和 COS134 对旧 design/source origin 的认证、revision origin 构造必须使用同一条件；execution 单边增删、unknown 值、origin 漂移均在派发前拒绝。
- COS134 已有 execution bytes 绑定覆盖新字段，不给 revision-plan 或 selection 再加平行策略载体。新字段不复制成 repair/continuation 的执行授权；这些既有路径仍不传入新能力。旧 execution、旧 origin、旧 correction、旧 revision 记录不得补写。

## 4. 可信触发及 Pi 边界

### 4.1 唯一可接住的拒绝

仅接住以下交集：

1. 当前为受上述策略固定的 design 作者；原 session、actor/context、task/attempt 均未改变。
2. 普通工作请求在 `requestOutputLimit` 选择原 8192 下限时，由可信 `authorBudgetOutputLimit` 抛出 `author_output_budget` 或 `author_review_reserve`。
3. 拒绝发生在 `budget.beforeRequest`、reserve/admit 及 transport 之前；该请求没有入账、没有 provider 发送，且不是摘要或只读请求。
4. Pi 能把这个精确异常对象与本 session 内刚发生的拒绝关联；不能凭 message/code、模型输出、工具文本或用户提供的对象判断。

最小实现是 Pi 保存一个会话私有的待收尾拒绝记录，含错误对象、请求 ID、实际输入字节、原 floor、已用请求计数及原生会话位置。该记录只从上述内部 catch 写入。对新策略，这个拒绝结束当前普通 prompt 并向 host 交回原错误，但允许一次指定的只读后续；普通 prompt/compact 仍不能继续。旧策略继续当前粘滞失败行为。

不要用通用 `clearFailure()` 或重新创建 session 绕过失败。待收尾拒绝与取消、provider、账务等终止错误分开；一旦出现任何新终止错误，不能借原待收尾标记忽略它。原生拒绝消息和已计数尝试保留。

### 4.2 不适用的失败

以下情况直接保留原停止，新增 provider 请求数必须为 0：已发送的请求错误/length/aborted、usage 或费用 unknown、未决 reserved、会话取消或关闭、原 deadline/清理余量不足、actor/context/attempt/输入权限改变、无原请求槽、只读隔离不可用、共享槽已消耗、普通以外角色、摘要拒绝、实际 beforeRequest 发生的权限/竞态拒绝、来源未能证明为上述本地 unsent 拒绝。

本卡故意不兜住所有带资源错误码的异常。失败来源无法证明时按原失败处理。

### 4.3 原计数、报价和时间

- 保留 Pi 现有计数位置。原普通请求在输出选择前已计数，即使最终未发送也不退款；最终只读请求再占原计数一次。不能按新 prompt、错误分支或收尾方法重置 32。
- 例如已发送 30 次，下一普通拒绝占第31次，最多再派发第32次只读；已发送31次后拒绝占第32次，则只读不得派发。摘要、格式纠正、先前未发送而已计数的尝试均按原规则计入。
- 收尾禁用全部 callable tools，包括 read 和自检；无新摘要、无文件修改、无工具执行。native `activeTools` 与实际发送 payload 必须同时证明工具禁用。
- 只读输出固定 cap/floor **4096**，不向下探测到更小值，不降低普通8192或摘要容量。沿现有 author output quote、review reserve、actual reserve/admit/settle、authority 与 deadline 清理余量。
- 完整收尾提示进入原生 SDK 后，按实际归一化输入重新报价；只有真实 4096 请求在原余额内才允许发出。报价与派发输入不一致、期间 ledger/authority 改变或实际 admission 拒绝均停止，不二次收尾。

## 5. 与格式纠正共用唯一机会

复用现有 `author-correction-started` / `author-correction-response` 两个 write-once 阶段。新增 `kind:"budget_finalization"`，不增加第二套文件或额外计数。

| 本 attempt 已发生的情况 | 允许后续 |
| --- | --- |
| 正常首答合法 | 直接沿既有交接流程，零额外请求 |
| 正常首答格式无效、共享槽未用 | 原一次 format correction |
| 上述可信 unsent 普通拒绝、共享槽未用 | 本次 budget_finalization |
| 任一种 follow-up 已开始或已有局部 started 文件 | 禁止另一种 follow-up |
| 收尾返回格式无效、toolCall、length 或错误 | 保留失败，不再 format correction |
| format correction 自己遇资源不足 | 保留失败，不再 budget_finalization |

host 在同一 `requestAuthorProposal()` 内识别资格，核对原运行仍 active、原 attempt 正在 running、无 unknown/reserved、原输入与工作区仍固定，且存在同会话只读入口。没有资格则重新抛原拒绝。

`started` 在派发前写入并消耗共享槽；即使其后实际报价失败或中断，该槽也不恢复。新 kind 不伪造 `originalReply` 或 `parseFailure`，因为本次没有已完成的原回复。它保存既有身份、原输入/工作区签名和一份窄 `unsent` 原因记录：固定资源码、`stage:"ordinary_output_limit"`、原请求 ID/B/floor、原请求计数/上限及该 session 原生错误条目引用。普通 format / coding_scope 记录形态保持。

`response` 保存真实模型返回全文、既有 hash 与前后签名，kind 必须匹配 started。严格 `decodeModelJson` 与三字段 schema 保持；不得从 prose 抽取 JSON、补空数组、删拒绝内容或人为生成交接。

固定收尾提示候选如下；实施可为准确性微调文字，但每次改动都须重跑最终 native 容量证据，不能再引用旧 B：

> The next ordinary request was not sent because its minimum output reservation does not fit the original author budget. All tools are disabled. Using only facts already in this session, return exactly one JSON object {summary:string,remaining:string[],uncertainty:string[]}. Report the current assigned design work honestly. Preserve every unfinished deliverable and unresolved blocking uncertainty, including any correctness or coverage you cannot establish. Structural feedback does not prove semantic completion. Pending host capture, verification and independent review belong in summary and remain pending. Do not perform work, invent evidence, change requirements, or hide defects to empty the arrays. This uses the single follow-up shared with format correction; there is no further attempt.

结构 advisory passed 既不是触发条件，也不是批准条件。未结构通过的作者也只能报告真实未完成情况；合法且带 remaining/uncertainty 的收尾沿既有失败处理，art/code 派发为0。若语义不足，作者可以报告不确定或拒绝，不能声称一次只读收尾保证完成。

保持既有先 capture、再 handoff 状态判定及 host verification/review 顺序，不为本卡移动验收阶段。合法空数组仍须经过固定 capture、完整 host 验证和独立 reviewer；真实 reviewer changes_requested 沿 COS134 现有有界修订，不能被新收尾绕过。

## 6. 恢复与失败证据

- 只有新 execution 和匹配 design origin 才能解释新 kind。旧记录或 unknown kind 不因新代码获得额外请求。
- 冷恢复永不派发收尾模型。只有完整 started+response、同身份、原输入/工作区签名、严格合法 proposal 和匹配原生 unsent 来源才可按已有恢复路径复用回执。
- started 无 response、partial 文件、签名变化、response kind 不符、原生引用丢失或不匹配，均阻止恢复；不能重做付费请求或从当前文件推断完成。
- 该待收尾权限只存在于原活 Pi session 内；不能从磁盘 receipt 重建它。落盘的 unsent 原因用于审计和完整回复复用，不是新授权令牌。
- 如果后续失败，保留原资源原因和一次收尾尝试事实，actual settlement 仍归原 task。既有资源错误停止策略保持；不要将它改为自动 code repair。
- 不恢复本次 reuse-2，也不修补其 handoff、snapshot、completion 或 funding。Root 的生命周期修复单独办理。

## 7. Visible save checkpoint 的字段反馈

只细化 `src/roles/requirements.ts` 内当前合并的 `Invalid visible save checkpoint` 分支，保持原规则和短路顺序：

- checkpoint 缺失/不是对象：指出 `scenario.reopen.checkpoint`。
- 多余字段（本例为 checkpointAssertionIds）：指出完整字段路径及允许字段 expected/snapshot/savedSnapshot。
- expected 空值/错误类型/超过现有长度：指出 `.expected` 和原限制。
- snapshot 或 savedSnapshot 的对象、kind、selector、额外字段错误：指出对应路径；仍只允许 `{kind:"text",selector:非空原长度内字符串}`。
- 两个观测相同：明确指出 `scenario.reopen.checkpoint.savedSnapshot.selector` 必须不同于 `.snapshot.selector`。

后续每阶段必须在正常点击后包含两个 checkpoint 断言的检查保持；已有 Missing checkpoint 路径、expected 及 stage 提示继续复用。仅报告有限字段和固定规则，不回显任意大输入，不自动修改 selector、expected 或步骤顺序。

## 8. 免费验收与发布门槛

| ID | 必须建立的事实 |
| --- | --- |
| F1 | 新 ordinary 的 opt-in 持久化；旧省略、旧 origin、非目标角色与 unknown 值保持正确拒绝/旧行为。 |
| F2 | 真正 factory/Pi/SDK 普通输出下限拒绝前 transport=0，原错误和 native 计数保留；只允许同 session 的一次只读请求。 |
| F3 | 最终提示、native 错误记录、工具禁用后的真实归一化 B 与 actual dispatch 完全一致；4096 报价不超过固定余额231989µ。 |
| F4 | 原 grant1125000µ、review reserve375000µ、已花518011µ不变；全请求/摘要/未发送计数不超过原32；费用真实 reserve/admit/settle且无双计。 |
| F5 | 只读与format共享 write-once 槽；全部失败和中断路径不再获得第二次 follow-up。 |
| F6 | 合法真实模型回复沿正常 capture/verify/fresh reviewer；remaining/uncertainty、格式失败或review拒绝不能派发下游。 |
| F7 | 冷恢复只复用完整可信回执，零模型网络；缺失/漂移/partial或旧策略不能补授能力。 |
| F8 | checkpoint 同selector、多余字段与坏kind/expected能定位字段，原合法/非法集合及每阶段断言规则不变。 |

F3 是实施与集成的硬门槛：使用真实工厂与 Pi/SDK，仅替换 transport，并在独占 TEMP 中保存中性合成身份。一次私有只读诊断可把原会话复制到 TEMP，先用已知 billing 校准字节，再接最终代码；原路径只读，不打开真实 controller，不提交原会话或内容。可提交回归使用合成同形记录，并明确区分它与原记录的精确报价证据。不得仅mock `requestOutputLimit`、只手算旧93428B，或用空history/短placeholder代替实际输入证明容量。

如果新增提示/元数据使最终最低报价超过231989µ，本例容量验收失败。提交精确 B/差额并修订最小提示或设计供独审；不得增额度、减保留、降到4096以下、改旧ledger、偷偷裁掉原事实或启动付费试错。即使通过，也只证明该路径可派发；模型可能给出真实未完事项、错误格式或被独审拒绝。

一名专属 implementer 在独立 managed worktree 实施并报告 SHA/证据；独立 reviewer 先规格后源码；只有本批唯一 merger 集成。当前只交本草案供独审。
