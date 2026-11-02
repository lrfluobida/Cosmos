# COS161 · 保留当前结构有效的设计草稿

[COS161 / #162](https://github.com/lrfluobida/Cosmos/issues/162)，GitHub ID `6167661047`。原生父任务为 COS18/#19，直接依赖结构化写入工具和有界设计诊断。[COS156 / #157](https://github.com/lrfluobida/Cosmos/issues/157) · [COS145 / #146](https://github.com/lrfluobida/Cosmos/issues/146)

2026-11-03，`design_draft_guard_reviewer` 独立批准 v2（APPROVED_DESIGN），v1 的 F1–F8 已处理，Root 批准实施。`design_draft_guard_implementer` 在独立分支开发，源码待独审，`planning_budget_merger` 在 Root 批准精确版本后集成。当前状态为 `source-pending`。

v2 批准稿的 SHA256 为规格 `938cfa0523a7dab2897d4a8474c142c218b1dada9a7e23273a82b55ea5b018f2`、计划 `b9abe3808d9a412c376c1b18e1692b87722bb7e0fe40c8fd56bc9e8526b0c443`。

工作基线：main ef77913e3527b92549f1c3b5e3ec15e5774af4c6；runtime d606f465fc8ff2acb23e414c8860dce0377c0e4f。两者仅元数据/文档不同，src/tests 相同；v1 和原审查记录保持原字节。

## 依据与目标

R26 native66 的计划有159步、49052字节，与随后完整分页读取逐字节一致。独立只读诊断在 TEMP 调用现有 createGameDesignCheck、validateOrdinaryAcceptancePlan 均通过。native97 的 raw write 随后用25字节非JSON内容覆盖计划；native99再次raw write，随后三次structured append重建到52步，最终仍有非法坐标、缺6项AC且无reopen。不是特定字符串检查需求，也不是 strict validator 错误。

该旧稿没有reopen。原通过仅证明设计结构/ID映射、计划外层、步骤、AC存在和前置输入等既有结构条件；不证明完整存读档语义、浏览器、独立review或游戏通过。validate-game-design真实可用，实际调用0；不能归因不存在的工具。

目标：当前两份设计文件已满足既有结构检查时，后续raw或structured修改不能把它们降为结构无效；尚未完整的初稿仍能分步构建，完整有效的替换仍允许。

## 最小行为

保护路径仅为作者工作副本中的 authors/design/design.json 与 authors/design/acceptance-plan.json。现有范围和 symlink 检查通过后，用 relative(resolve(fixedWorkspace, file), absolutePath) === '' 匹配实际目标，与 afterFileWrite 一致；Windows 大小写变体须识别为同一文件。对每次拟写入其中一个文件：

1. 沿用当前task/attempt/workspace/source/ownership/UTF-8/截止与取消守卫。
2. 安全读取两文件，用 validateDesign、validateOrdinaryAcceptancePlan（含原 benchmark 对 reopen 的要求）及固定 requirement 引用计算 currentPassed。它只评价这两个文件，不用整个 check() 的 passed：classic-entry-plan.json、模块接口等附加文件不参与此谓词，原显式检查、advisory和capture仍照常校验它们。
3. 用本次最终拟写文本仅替换内存中的目标文件，复用同一检查计算candidate。不存在临时落盘再回滚。
4. 仅在 currentPassed=true 且 candidatePassed=false 时拒绝写入；原两文件字节不变。其他情形继续现有写入行为及落盘后advisory反馈。

~~~text
current = evaluateCurrentPair(currentBytes)
candidate = evaluateCurrentPair(currentBytes with target := proposedBytes)
if current.passed && !candidate.passed:
    return tool error(candidate diagnostics, "write rejected; current draft preserved")
else:
    commit through the existing scoped writer
~~~

拒绝反馈必须明确“本次修改未保存、当前草稿保留”，返回拟写内容实际产生的错误；不能把current通过包装成本次修改成功。复用现有诊断展示上限/省略说明，不加新诊断目录或状态账本。拒绝后原会话可继续合法修改；仍消耗原有调用/时间预算，不赠送重试。

### 全部写入入口

- raw write与edit均在SDK operations.writeFile边界检查最终拟写内容；edit的匹配、BOM、换行及差异生成仍由原SDK完成，不重写编辑算法。
- write-game-plan的save/append，以及write-game-design的save/set，都通过同一scoped writer回调；不能只保护raw write。
- 任一文件 ENOENT 或安全读到的 UTF-8 内容存在 JSON/结构缺陷时允许继续构建。若另一文件无法安全独立读取，则即使本次不修改它也须拒绝；两文件都要完成安全读取。非 ENOENT 的 I/O、硬链接/软链接、权限、UTF-8、取消和授权检查失败不能解释为 partial。
- 候选读取/计算是纯检查，不写文件、不生成模型请求、不改ledger/task/journal，不创建“last good”历史副本；现有守卫和最终capture/review保持权威。

### 串行与兼容

新选择下四个 writer 都声明 executionMode=sequential。同一回复按原 SDK 顺序 await 各工具；普通结构拒绝只影响该次调用，下一调用须基于保留下来的当前字节重新判定，可能成功。取消仍按原规则终止。用真实 native fake transport 验证跨文件顺序；不依赖单文件队列代替跨文件串行，不新增 batch API 或锁账本。

使用已有ordinaryPlanAuthoringPolicy的新枚举值 structured-design-plan/2 表示此选择。沿现有fresh ordinary eligibility在planning-started/execution写入；同时将明确的新规则标记绑定至冻结task.rules，因此原origin精确比较仍有效。初稿及该运行的合法revision继承选择。旧省略、structured-plan/1、structured-design-plan/1继续原行为，不回填字段、不改旧origin/规则/运行字节；未知或单边漂移拒绝。其他profile和原未选择路径不扩展。

**作者可执行的 /2 规则**：在初稿及修订作者冻结规则中精确出现一次；两个 structured 工具说明也要按 /2 明示：仅在当前双文件尚无效时允许中间无效稿。一旦有效，每次修改都必须保持有效，否则不落盘。多项改动按有效顺序提交，或一次 save 完整有效替换；save 始终整体替换其目标，不能用空草稿重置当前有效稿。对象/section 的其余规则、旧政策的规则和工具说明不改。

给已有有效 main 增加 reopen：先用现有 main append（必要时 afterStepId）或 edit，使 main 在正常点击后包含两个不同的可见文本 selector 的检查，二者 expected 均为同一个 checkpoint 字符串。再一次调用 write-game-plan 的 append，stage=reopen，同时提供 checkpoint 及已经有效的首批步骤：正常点击后分别检查这两个 selector 的同一 expected，且满足本阶段其他既有约束。不能先建仅有 click 的 reopen 再补断言。也可一次 save 完整有效的双阶段 scenario。host 不生成步骤、选择器或期望。

## 取舍与排除

- 两文件关联变化若任一中间状态结构无效，需要调整编辑顺序或提供一次完整有效替换；不为此增加多文件事务、强制override或额外临时文件。
- 当前结构有效仍可能语义错误；有效到有效的替换可以改变内容或删除未被结构规则强制的行为。原语义review、预算、capture及验收不得跳过。
- 不因拒绝写入自动交接、不将旧稿自动捕获或接受，不修改步骤/期望、不猜游戏内容、不改变任何cap、额度、attempt或review策略。

## 验证与完成范围

R26真实pre-reset双文件与native97内容只在私有TEMP作为原样反例；拒绝后字节仍为pre-reset，但不标为游戏通过。原稿、native内容和replay脚本均不进 tests/ 或提交物。提交的测试只用合成数据；用有效草稿+structured save空steps覆盖R21同类reset，并验证partial构建、valid到valid、全部writer、取消/权限失败、跨writer串行和旧选择字节兼容。

SOURCE完成只说明上述写入边界成立。R26历史失败、无reopen的语义缺口、独立review和COS160实际激活状态均不提升。实施文件、测试命令与证据复用见[实施计划](../plans/2026-11-03-valid-design-draft-preservation.md)。
