# COS161 · 保留结构有效草稿实施计划

[COS161 / #162](https://github.com/lrfluobida/Cosmos/issues/162)，GitHub ID `6167661047`。原生父任务为 COS18/#19，直接依赖结构化写入工具和有界设计诊断。[COS156 / #157](https://github.com/lrfluobida/Cosmos/issues/157) · [COS145 / #146](https://github.com/lrfluobida/Cosmos/issues/146)

2026-11-03，`design_draft_guard_reviewer` 独立批准 v2（APPROVED_DESIGN），v1 的 F1–F8 已处理，Root 批准实施。`design_draft_guard_implementer` 在独立分支开发，源码待独审，`planning_budget_merger` 在 Root 批准精确版本后集成。当前状态为 `source-pending`。

v2 批准稿的 SHA256 为规格 `938cfa0523a7dab2897d4a8474c142c218b1dada9a7e23273a82b55ea5b018f2`、计划 `b9abe3808d9a412c376c1b18e1692b87722bb7e0fe40c8fd56bc9e8526b0c443`。

实施和审查均以[正式规格](../specs/cos161-valid-design-draft-preservation.md)及已批准的 v2 计划为准。

**Goal:** 在现有作者写入边界拒绝“当前结构有效 → 拟写后结构无效”，保留当前字节与全部原验收/预算门槛。

**Architecture:** 新ordinaryPlanAuthoringPolicy选择下，四类writer共享同一before-write候选检查。当前/候选均复用原ordinary双文件校验；SDK负责edit结果和sequential顺序。无历史快照、ledger、自动回滚或新batch工具。

**Tech Stack:** 当前TypeScript/Node/Pi SDK与node:test，不增依赖。

本版仅修订 v1 的 F1–F8。实施基线 ef77913e3527b92549f1c3b5e3ec15e5774af4c6，运行时代码与 d606f465fc8ff2acb23e414c8860dce0377c0e4f 相同。

## 1. 最短生产文件范围

| 文件 | 必要改动 |
| --- | --- |
| src/providers/workspace-tools.ts | 可选可信before-write callback接入write/edit的operations.writeFile；仍保留原安全路径/编码/access与SDK算法；未选择时保持旧实现路径。 |
| src/roles/factory.ts | 仅为host选择的design作者传入回调，并将raw write/edit声明sequential；reviewer及其他角色不获得写入能力。 |
| src/runtime/entrypoint-design-check.ts | 将现有ordinary双文件读取与检查适度分离，以同一实现评价当前bytes与内存candidate；复用诊断，无第二套schema。 |
| src/runtime/entrypoint-plan-authoring.ts | 接入相同writer回调；扩展政策枚举与冻结规则核对，保留旧值/规则；新规则说明拒绝边界。 |
| src/runtime/entrypoint-design-authoring.ts | save/set接入相同writer回调，不改变参数/合并语义。 |
| src/runtime/entrypoint-host.ts | 在同一fixedWorkspace、task/attempt与原guard下建立并共享检查器；新值仍提供两个structured工具。 |
| src/runtime/entrypoint.ts | fresh默认选择structured-design-plan/2；resume只读取原选择，沿原planning/execution载体传递。 |

不改严格validators、capture/review/provider预算或SDK源码。revision已继承冻结任务规则和execution选择；没有发现需新增origin字段的调用点。若实施发现额外必要文件，先说明实际依赖，由Root调整范围。

新增 tests/runtime/ordinary-draft-preservation.test.ts；用现有 ordinary structured fixture 做 native 混合 writer 代表。按以下处置更新测试（行号以基线为准）：

| 现有用例 | fresh /2 或冻结旧值（F1） |
| --- | --- |
| ordinary-design-write-feedback.test.ts:77–111 | 测 fresh /2：valid 后三次坏写入分别拒绝，检查候选的真实诊断、原文件不变；原 advisory 仍用未满足 pair 的构建阶段及冻结 /1 代表验证，不再要求 fresh /2 保存坏稿。 |
| 同文件:139–160 | Windows raw write/edit 的大小写变体都按 fresh /2 拒绝坏修改，检查两文件原字节；合法变体仍有原反馈。另保留冻结 /1 的原 advisory 语义。 |
| ordinary-structured-plan.test.ts:39–89、102–109 | fresh 断言 /2（含 planning 中断），main 先包含 click 后两个 checkpoint 检查；不完整 reopen 首批拒绝且原 bytes 保留，再一次 append checkpoint 与完整有效首批，通过后可继续 append。 |
| ordinary-structured-design.test.ts:36–90、140 起 | fresh marker/工具说明/规则断言改 /2，漂移覆盖 planning、execution、冻结规则单边 /2↔/1；seeded revision 仍用隔离工作副本，并实证保护。冻结旧值矩阵显式加入 structured-design-plan/1，沿既有 frozen-fixture 机制保留原 marker、工具、规则、origin 字节及 valid→invalid 旧行为；不得为旧运行回填。 |
| 两个 ordinary-structured-*-tool.test.ts | 无 /2 回调的直连工具仍测原协议；新增保护路径由真实 factory 测。上述五个已有测试文件均整文件运行。其余 fixture 消费者按第4节清单执行。 |

## 2. 写入前精确拦截（RED→GREEN）

- [ ] 在专属managed worktree记录与上列基线的差异；所有目标严格UTF-8检测，最小补丁并保留原行尾。
- [ ] 新增有效pair→raw malformed write与structured save空steps的有效RED：确认旧代码实际覆盖原文件，不能用fixture缺失或guard配置错作为RED。
- [ ] 分离受信文件读取与纯 pair 校验：两个文件均用 regularFile 安全读取、fatal UTF-8 解码后，才计算 current/candidate。只把 ENOENT 当缺文件。不复用 check() 将任意 plan 读取异常转诊断的 catch；取消、授权、越界、unsafe-link、EACCES 等在校验前传播。TEMP 使**非本次目标**为 nlink>1 的硬链接，分别覆盖写 plan 与写 design；必须拒绝、原字节不变。（F8）
- [ ] pair 只测 validateDesign、validateOrdinaryAcceptancePlan 和 exact requirement。fresh ordinary classic 用例：有效双文件且含必需 reopen，即使 classic-entry-plan 缺失/无效，坏 pair 修改仍拒绝，保持有效的 viewport 等修改不因第三文件而被阻止；显式 check/capture 仍执行原 classic 检查。旧 classic 与 modular 行为不改。（F5）
- [ ] /2 只给 role==='design'、无 purpose、无 validation 的绑定作者（含其合法 revision）启用。raw fileTools 在 hostTools 前构造，不能在构造时取 map 值。每次写入时按受信 taskId 延迟查 designWriteChecks，并用原 attemptId、fixedWorkspace 和活跃授权 guard 核对当前实例；缺失或不匹配直接报错、零写入。structured 实例绑定同一检查器/原 attempt。测试查不到、旧 attempt 和 workspace 不符；其他角色不加钩子。（F4）
- [ ] 继续先做 scope、symlink、编码检查；用 relative(resolve(fixedWorkspace,file), absolutePath)==='' 与原 afterFileWrite 的 win32 路径身份一致，禁止字面字符串比较或将全盘路径统一小写。大小写变体必须命中保护。（F3）
- [ ] SDK 的 operations 是整组替换且 writeFile 没有 signal 参数。/2 每次 execute 单独构造 operations 并在闭包捕获本次 combined signal，不共享可变 signal。write 保持 mkdir({recursive:true})；edit 保持 access(R_OK|W_OK)、fs.readFile 返回 Buffer 及 SDK 匹配/BOM/换行还原；两者都在 SDK 原 per-file mutation queue 内的 operations.writeFile 收到 finalContent，以 Buffer.from(finalContent,'utf8')（含 BOM）做候选。guard/安全读取前、await 后及实际 UTF-8 writeFile 前检查取消。拒绝不触发 writeFile 或成功 post-hook。旧选择保留默认 operations。（F6）
- [ ] 被拒绝时抛可读tool error，含candidate错误和“current draft preserved”；让原SDK转为toolResult error，不故意污染Pi session failure。原bytes、captures、task和ledger不变；不增加模型重试。
- [ ] 覆盖partial→partial/valid允许、valid→valid允许、valid→invalid六种操作拒绝：raw write、raw edit、plan save/append、design save/set；非法UTF-8/来源/权限/取消保持原拒绝。

## 3. 新选择与跨writer顺序

- [ ] /2 冻结 spec 中作者规则的必备内容，requirePlanAuthoringTasks 断言该 canonical guard rule 恰好一次且旧值为零。仅 /2 对两个 structured 工具的说明和有效规则限定“partial 仅在 current 不通过时可保存”，不能同时给作者无条件保存坏稿的说明。用原工具演示已有合法 main → 准备 main 的两个可见 checkpoint 检查 → 单次追加完整有效 reopen 首批，或一次完整有效 save；不能把新事务/override 当作解法。检查作者实际 packet.rules 和工具说明，旧 canonical rules 字节不改。（F2）
- [ ] 沿原fresh eligibility替换新运行默认值，planning-started/execution保持原写入时序。旧省略及两个v1值不加新规则、回调或语义；resume不升级，单边删改政策/规则仍拒绝。
- [ ] 选中作者的raw write/edit设为sequential；structured工具原来已为sequential。保留现有role/session busy与owner控制，不增加全局锁或新mutation scheduler。
- [ ] 在真实 Pi fake transport 先断言全部四种 mutation tool 的 executionMode 均为 sequential。做跨两个文件的混合回复和仅 raw write/edit 的回复：在测试钩子用显式 barrier 暂停首调用，记录 enter/exit、active 和 SDK start/end；负控用并发测试调用可确定触发同一重叠探针，不能仅观察“最终顺序碰巧正确”。拒绝者 isError 且没有迟到写入；同回复下一次合法调用按顺序读取保留字节并成功（仅 abort 按原规则中止），而非跳过后续调用。（F7）
- [ ] 测新policy的初稿/revision都实际经过保护；旧policy仍允许原partial行为且冻结task/origin bytes不变。检查readOnly reviewer无mutation工具。

串行依据：当前SDK core agent-loop.js:366–394按executionMode选择整批sequential并逐个await；raw SDK write/edit的operations.writeFile分别在其原mutation queue内调用。单文件queue不足以证明跨文件，所以以实际native混合回复作为集成证据。

## 4. R26原数据与有限验证

- [ ] 使用已归档的私有 R26 TEMP 证据，按原诊断来源哈希核验覆盖前的 49052B 计划和 15754B 设计文档，复用诊断回放结果。
- [ ] R26 原稿及 replay 脚本只用于未提交的私有 TEMP 检查，不进入 tests/、提交物或公共报告；不复制 raw reasoning 或凭据。以原 native97 候选核拒绝与原 bytes，再用不同非法 JSON 反证字符串特判；提交测试完全使用合成数据。复用原评审已核的 before/terminal 与 reopen 基线，不重复重建历史。（F8）
- [ ] 用有效pair及structured save空steps做R21类型合成反例；这只证明同类操作无法绕过，不重开或重放R21实际会话。拒绝以后可提交完整有效scenario，证明没有永久锁定作者。
- [ ] R26旧稿无reopen仍通过原结构检查；明确记录它仍需独立语义review，测试不得直接capture/promote为accepted，不假造COS160激活。
- [ ] 运行新增测试及受影响测试的**整文件**，不使用 test-name-pattern 过滤。用 rg 清点所有 ordinaryHostFixture 引用，含 .fixture.ts/.mjs 的下游测试；凡用 fresh 默认并经实际 scoped writer 写入、比较选定 marker/规则/工具，或依赖这些 fixture 写入结果的测试，一并整文件加入命令。记录最终清单、各文件命中数、排除依据、SHA 和 TAP；v1 的32/32仅为旧基线。无需重跑无关全仓/付费矩阵。（F1）

~~~powershell
$mainWorktree = (git worktree list --porcelain | Select-Object -First 1) -replace '^worktree ', ''
$env:COSMOS_TEMPLATE_ROOT = Join-Path $mainWorktree 'templates/2d'
rg -l 'ordinaryHostFixture' tests
$cos161Files = @('tests/runtime/ordinary-draft-preservation.test.ts','tests/runtime/ordinary-design-write-feedback.test.ts','tests/runtime/ordinary-structured-plan.test.ts','tests/runtime/ordinary-structured-design.test.ts','tests/runtime/ordinary-structured-plan-tool.test.ts','tests/runtime/ordinary-structured-design-tool.test.ts')
# 完整覆盖直接使用 ordinaryHostFixture 的 .test 文件；再依清单加入相关间接 fixture 消费者。
$cos161Files += @(rg -l 'ordinaryHostFixture' tests -g '*.test.ts' -g '*.test.mjs')
$cos161Selected = @($cos161Files | ForEach-Object { $_.Replace('\','/') } | Sort-Object -Unique)
node --experimental-strip-types --test @cos161Selected
npm.cmd run typecheck
npm.cmd run build
git diff --check
~~~

复用未变parser/schema、COS145诊断、readonly收尾、原额度/截止、独立review和历史会计证据；writer hook、政策选择、串行属于实质变更，必须跑上述定向用例。新测试使用COS161前缀；命中0项或全skip不能算通过。

## 5. 交审与取舍

- [ ] 独立reviewer核全部实际入口覆盖、无写后回滚、旧选择不升级、SDK拒绝仍为tool error、跨writer顺序及两份文件bytes守恒。
- [ ] 跨文件变更若需要暂时结构无效，作者需调整顺序或提交完整有效替换；不追加batch事务/override来消除这一有意限制。
- [ ] 实施者提交exact SHA，唯一merger有限集成。Root已批准v2实施，SOURCE集成须取得独立源码审查及精确版本批准。R26仍为已闭账的历史记录。

v2设计已获独立批准，当前工作为SOURCE实施与免费验证。
