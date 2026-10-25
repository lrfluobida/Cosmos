# COS125 Ordinary Design Context Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在普通 design 的原预算内提前调用原生压缩，并让明确无法准入的可选摘要在未派发时安全跳过。

**Architecture:** 原 factory 只对 COS124 普通 design 范围接入预算策略；Pi 在原 SDK 实际摘要 context 上、计数和真实准入之前调用只读预检。复用现 optional length fallback 的原上下文检查，摘要和普通请求始终各自经过原账本准入。

**Tech Stack:** TypeScript、Node 22.22.2、node:test、固定 @earendil-works/pi 0.99.2；只 fake 底层 provider transport。

---

状态：已完成独立源码审查与主线集成，source-scoped-complete。配套规格：[COS125规格](../specs/cos125-design-context-budget.md)。基线 main `9ecc24508da4309a574b6f0a53a4300b2300ee6c`。本计划不恢复永久闭账的 room9，不操作 shared3354。

源码结果：独立cos125_reviewer对 `47f975ece24ee32b4361cd9af0c15bbead9a42e9` 完成规格/质量审查，APPROVED_SOURCE_SCOPED、无finding；唯一merger合入发布 `2fbb61d569f88458cc454e2b6f8cb997ced5e5be`，11文件精确一致，主线typecheck/build及3/3短代表通过。[批准](https://github.com/lrfluobida/Cosmos/issues/126#issuecomment-6396523398)、[完成关闭](https://github.com/lrfluobida/Cosmos/issues/126#issuecomment-6396526720)已核证。仅SOURCE范围完成，父COS18仍open/partial；room9永久关闭，新源码尚无真实游戏通过结论。

审批记录：[COS125 / #126](https://github.com/lrfluobida/Cosmos/issues/126)；独立 reviewer `design_context_plan_reviewer` 给出 `APPROVED_PLAN`、无finding，Root批准固定输入的规格/计划发布与免费源码实施。此为设计/计划批准记录；源码后续独审与集成结果见上述状态。

- 批准规格输入 SHA256：`34185a611eceba6feffe664c4c73d3331034f4a7d53c34ec6135b066e7e6f5f2`
- 批准计划输入 SHA256：`6ea930a2b3ad51bf6030e736fc858346d38cbf199683b9f8e66e9661146ddbb5`

## 工作与文件边界

Root 指派独立 implementer、独立 reviewer 和唯一 merger。实现者创建独立 managed worktree、`codex/` 分支；本计划已正式发布；实现提交仍在独立worktree进行。所有文本先检查 UTF-8，最小 patch，保留中文，写后重新打开检查。出现非 UTF-8 时先停止该文件编辑并报告。

预计源码仅五个文件：

| 文件（相对独立 worktree 根） | 职责 |
|---|---|
| `src/budget/ledger.ts` | 两种额度不足的窄 Error 子类，原行为保持 |
| `src/roles/author-output-budget.ts` | 共用原 authority/clone quote；合法摘要 cap；两压缩回调 |
| `src/providers/pi.ts` | 实际摘要预检和受限未派发 skip |
| `src/roles/factory.ts` | ordinary design 可信开关与 keepRecent8000 |
| `src/runtime/entrypoint-host.ts` | 在现 COS124 同一条件启用开关 |

测试修改 `tests/budget/ledger.test.ts`、`tests/roles/author-output-budget.test.ts`、`tests/runtime/ordinary-design-request-capacity.test.ts`、`tests/runtime/ordinary-author-thinking.test.ts`；新增 `tests/providers/ordinary-design-compaction.fixture.mjs` 与 `tests/providers/ordinary-design-compaction.test.mjs`。不复制真实 run 到仓库测试夹具，不读取真实凭据，不改 node_modules。

## Task 1: 只读 quote 的窄错误分类

**Files:** Modify `src/budget/ledger.ts`; Test `tests/budget/ledger.test.ts`.

- [ ] **Step 1: 写 RED。** 断言 shared/task 不足分别是新 `InsufficientReservationBudgetError`，scope 正确，name 仍为 Error，message 与现值逐字相同；原 ledger 不变。对 unknown、closed、missing grant、duplicate ID、invalid amount 断言不是该类型。
- [ ] **Step 2: 跑 RED。** `node --experimental-strip-types --test tests/budget/ledger.test.ts`；预期因未导出的新类型/缺少分类失败，不能用夹具无效失败代替。
- [ ] **Step 3: 最小实现。** 导出 `class InsufficientReservationBudgetError extends Error { readonly scope: 'shared' | 'task'; constructor(scope: 'shared' | 'task') { super(scope === 'shared' ? 'Shared budget is insufficient.' : 'Task budget allocation is insufficient.'); this.scope = scope; } }`，仅替换 reserveEntry 两个对应 throw。显式字段和赋值兼容 Node 22 --experimental-strip-types，不使用参数属性。不要改 group、未知费用或 reserve/admit 的状态流转。
- [ ] **Step 4: 跑 GREEN 并提交。** 同一命令通过，记录原 messages 和无副作用断言；提交 `fix: classify reservation budget insufficiency for read-only quotes`。

## Task 2: 共用原 authority 与预算策略

**Files:** Modify `src/roles/author-output-budget.ts`, `src/providers/pi.ts` 的类型声明；Test `tests/roles/author-output-budget.test.ts`.

- [ ] **Step 1: 写 RED。** 覆盖正常 cap32768、摘要 cap8192/4096/1、非法 0/NaN/超配置 cap、非单调估算器和 caller cancel。新增真实 quote 策略测例：full cap 不足且 floor 可承担时选压缩；full 可承担不压缩；floor 不足不进入压缩。
- [ ] **Step 2: 写 admission RED。** 对真实 summary bounds 分别断言 admit、仅摘要不足而原 normal floor 可承担时 skip、两者都不足时抛错；unknown、closed、authority drift、deadline、invalid estimate 必须抛错，ledger clone 不污染原状态。
- [ ] **Step 3: 跑 RED。** `node --experimental-strip-types --test tests/roles/author-output-budget.test.ts`。
- [ ] **Step 4: 实现规格接口。** 提取文件内私有原 guard/quote，保留现全部恒等检查；quote 只 catch Task 1 的类型。保持 authorBudgetOutputLimit 导出，搜索区间为 `[Math.min(floor, request.maxOutputTokens), request.maxOutputTokens]`，保留每 64 次 yield。新增 authorBudgetCompaction 返回 requestCompaction/requestCompactionAdmission，按 spec 的同一次 state/authority 读取执行 quote，结果只为 admit/skip；真实预算变更仍由后续 beforeRequest 负责。
- [ ] **Step 5: 跑 GREEN 并提交。** 同一命令通过；提交 `feat: select ordinary design compaction within original authority`。

## Task 3: Pi 在实际摘要准入前安全跳过

**Files:** Modify `src/providers/pi.ts`, `src/roles/factory.ts`; Create `tests/providers/ordinary-design-compaction.fixture.mjs`, `tests/providers/ordinary-design-compaction.test.mjs`.

- [ ] **Step 1: 建真实 SDK 夹具。** 沿用现 coding-compaction fixture 的 transport mock 方法；使用临时工作区、原 createRoleFactory/createPiSession/SDK 和真实 scoped tools，env 只提供明确 fake key；全局 fetch 禁止网络。不要 mock requestOutputLimit、requestCompaction、预算、SDK compact 或 SessionManager。本任务同时接通 factory 的可信开关，以便真实调用链可测；Task 4 再接通公开 host。
- [ ] **Step 2: 写 skip RED。** 让普通 8192 floor 可承担、实际摘要不可承担；观察真实摘要 callback。预期零 provider、零 beforeRequest/afterResponse、零本段请求/readonly 计数增量、零 checkpoint，原 leaf/投影不变，下一次普通请求正常派发。当前源码应失败或没有该接口。
- [ ] **Step 3: 实现前置预检并接通 factory。** 新回调只用于自动 optional operation。先从实际 SDK context 计算 requestInputBytes 并验证/clamp SDK cap，再预检；必须先于本次计数增加、可能 fatal 的 requestOutputLimit 和真实 beforeRequest。admit 保留原后续流程。factory 增加并校验 ordinaryDesignBudgetCompaction 开关，要求有效 design floor/cap，仅为 purpose author、role design、无 validation 的 session 设置两回调和 keepRecent8000。普通请求和未配置新回调的 fixed coding/manual 路径保持原行为。
- [ ] **Step 4: 实现窄 skip。** 当前 operation 的私有 skip 标记触发专用内部摘要拒绝，不调用 fail；compaction_end 只确认匹配的 threshold、无 result、非 aborted 错误。沿用现 length 路径的 leaf/projection/checkpoint 核验，通过后禁后续自动压缩。禁止根据普通错误字符串或 catch beforeRequest 来 skip。
- [ ] **Step 5: 写边界 RED/GREEN。** 无可压缩内容 no-op；匹配事件缺失、leaf/投影改变、caller cancel、close、deadline、SDK error/toolCall、未知费用、预检后真实 reserve/admit 拒绝均保持 fatal。预检拒绝后不产生成功摘要或 handoff。对新可选模式，剩余少于 3 个请求 slot 时不进入压缩，保留普通继续机会。
- [ ] **Step 6: 写双摘要测试。** 在同一合法原生会话建立历史 turn，使 SDK 自己产生 history+turn-prefix 两段摘要；第一段实际 fake transport 成功并结算，第二段预算 skip。断言第一段费用/记录/计数完整保留，第二段无计数/准入/dispatch，checkpoint 数仍不变；余额够原 floor 才可继续。另测第二段连原 floor 都不可承担时失败。
- [ ] **Step 7: 跑 GREEN 并提交。** `node --experimental-strip-types --test tests/providers/ordinary-design-compaction.test.mjs`；预期所有断言通过、网络调用为 0；提交 `feat: skip unaffordable optional summaries before admission`。

## Task 4: 限定普通设计入口与 room9 等量容量

**Files:** Modify `src/roles/factory.ts`, `src/runtime/entrypoint-host.ts`, `tests/runtime/ordinary-design-request-capacity.test.ts`, `tests/runtime/ordinary-author-thinking.test.ts`; Extend 新 compaction fixture/test.

- [ ] **Step 1: 写范围 RED。** 新 `ordinaryDesignBudgetCompaction?: true` 只对现 COS124 ordinary design 作者生效，keepRecent8000；planning/reviewer/art/coding/validation/preparation/human/binding/inherited 不获得新回调。原 cap/floor/32请求/off/120s 不变。
- [ ] **Step 2: 跑 RED。** `node --experimental-strip-types --test tests/runtime/ordinary-design-request-capacity.test.ts tests/runtime/ordinary-author-thinking.test.ts`。
- [ ] **Step 3: 接通公开 host。** 使用 Task 3 已实现的 factory 开关；host 只在已有 COS124 条件内传 true，不新建执行分支。由本任务范围测试确认 factory 的排除条件和角色设置。
- [ ] **Step 4: 写 room9 等量测试。** 用合成中文需求、计划 write arguments 和只读反馈构造约 127550 bytes 的真实 SDK 普通输入及 507835µ 余额；以观察到的精确输入计算阈值，不把重造历史字节当证据。让 full32768 不能预留而 floor8192 能预留，断言该成功工具边界触发 summary。另保留不开启新开关的对照，增长至约 206370 bytes/356105µ 时原 floor 拒绝。
- [ ] **Step 5: 验真实请求报价。** transport 只返回受控响应，不生成上下文。观察 SDK 给摘要的 native cap、Pi 传输 cap、summary 的真实 requestInputBytes、原 reserve/settle，以及压缩后下一普通请求重新计算的 quote。真实 SDK 场景断言当前 native cap384000 被限制为8192；更小 cap 的选择契约复用 Task 2 的8192/4096/1边界测试，不伪称当前SDK自行产生较小 cap，不替换SDK来制造通过。不得把 keepRecent8000 当输出上限。
- [ ] **Step 6: 验摘要长度与原来源。** 以短/较长/含中文、反斜杠和引号的合成摘要覆盖不同序列化字节；至少一个较大摘要导致后继 floor 不足时正确失败。usage 为明确的测试输入，不宣称 synthetic text 与 token 数是模型真实比例。断言每个恢复后普通 request 仍含完整冻结 config.context，工具和读写范围不变；从原合法路径读完整来源，越界读取仍拒绝。
- [ ] **Step 7: 验成功边界。** 缺 checkpoint 的计划仍被真实 validator/capture 拒绝；摘要不产生作者完成 JSON、capture、review 或游戏成功。有效夹具只证明 SOURCE 行为。
- [ ] **Step 8: 跑 GREEN 并提交。** 运行本任务两个 runtime 文件和新 compaction test；提交 `feat: enable early native compaction for ordinary design authors`。

## Task 5: 组合验证、独审与唯一集成

**Files:** 当前实现提交、受影响测试；正式发布文档由 Root 安排，不自行扩大文件范围。

- [ ] **Step 1: 编译检查。** `npm run typecheck` 和 `npm run build`，预期退出 0。
- [ ] **Step 2: 跑受影响组合一次。** `node --experimental-strip-types --test tests/budget/ledger.test.ts tests/roles/author-output-budget.test.ts tests/runtime/ordinary-design-request-capacity.test.ts tests/runtime/ordinary-author-thinking.test.ts tests/providers/ordinary-design-compaction.test.mjs tests/providers/coding-compaction.test.mjs tests/providers/pi.test.ts`。Pi 与 coding-compaction 受共享 adapter 修改影响，此处需要验证；其余未受影响历史结果按原 evidence/版本复用。
- [ ] **Step 3: 保存实现证据。** 报 exact SHA、具体命令/退出码、测试数、原 RED 到 GREEN、SOURCE-only 范围、已知限制。原失败输出也保留，不重跑已通过且没有实质变化的检查。
- [ ] **Step 4: 独立审查。** Root 派不同 reviewer，以批准 spec 和实际 diff 先查规格再查质量。重点核计数/预检顺序、错误分类、真实 beforeRequest 异常、双摘要费用和原 authority；作者修 actionable findings 后只复查受影响变化。
- [ ] **Step 5: 唯一 merger。** Root 指定的 merger 校对获批 SHAs，集成并做受影响组合检查；复用仍有效结果，记录合入结果。实现者/设计作者不 merge main、不 push batch、不自审批。

完成声明只能是 COS125 source-scoped 能力通过。room9 仍永久关闭；任何后续真实验证由 Root 在新的既有授权窗口处理，不包含在本实现计划中。
