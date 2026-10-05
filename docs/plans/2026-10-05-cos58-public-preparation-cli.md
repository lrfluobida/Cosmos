# COS58 Public Preparation CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` with the same dedicated COS58 implementer in this managed worktree. A separate reviewer checks the actual implementation diff; only the batch merger integrates approved commits into main and pushes.

**Goal:** 公开 Windows CLI 经真实 stdin 确认后，在原 human 正式运行窗口内生成并冷恢复固定推箱子准备模式。

**Architecture:** 将公开 `sokoban` 映射到已有固定 `cos16-input/1`，复用 COS53 的访谈、草稿、确认和原账本激活。新增直接接收 human RequirementContract 的生产 preparation factory；规划前只准备固定 refs，规划后绑定真实任务及预留 coding repair 身份。复用 transfer oracle、四输出捕获、双计划、八段 consumer、媒体观测和已有 coding repair，不将 human 输入转换为 validation requirement。

**Tech Stack:** TypeScript 5.9.3、Node 22、pi 0.99.2 / `deepseek-flash`、现有 planner / journal / registry / owned work、Node test runner；免费验证仅 SOURCE / TEMP 与 fake SDK。

## 执行前置与当前边界

- 计划准备时基于只读工作树 `codex/cos58-public-preparation-cli`，HEAD `746089dc7f8b284958bc5012aa62fbf83dc7f996`。
- `docs/specs/cosmos-issues.md` COS58 / #59 和 `docs/specs/github-issues.json` 要求 COS52–COS57 independently-reviewed-and-integrated-source。计划准备时 COS57 未放行；Root 提供其 approved SHA、merge SHA 与明确 source release 后，才同步该依赖并启动源码和 RED/GREEN。
- 计划准备提交仅新增本计划，未写产品源码、未运行 tests；后续实施证据记录于文末。独立架构审查已确认单卡可实施；以下步骤属于同一 COS58 实现任务。
- 不读取真实 `.cosmos`、ledger、sessions、API key 或参考安装。未来 fixture 只建于隔离 TEMP，使用 fake SDK 和合成 stdin；合成确认不代表实际 human 验收。
- 不新增付费运行或额度。共享验证 ¥150（首阶段 ¥30、COS16 原 ¥10）；正式运行 ¥200 / 12h，¥100 / 6h 为优化目标。原账本、一次激活的截止和停止事实保持连续。

## 已读源码与最小文件归属

| 文件 | 当前接口 / 缺口 | 计划变更 |
| --- | --- | --- |
| `src/cli/index.ts` | `runCli` 的 new 仅接受 `--brief`；默认装配 `createProductHost` | 严格解析有限 `--adapter sokoban`；new/resume 传入选定模式，拒绝未知、重复、缺值参数 |
| `src/cli/session.ts` | `runProductSession` 已有 `draftMode`、真实问答、展示、`confirm <revision>`；`readConfirmedGeneration` 保存模式 | 复用访谈/确认；resume 可信读取原模式并核对显式选择，保留原资料字节绑定 |
| `src/cli/continuation-session.ts` | 确认、quiescent、prepare、activate 前读取原需求 | 准备模式额外 formal continue / resume --window 在这些 effects 前拒绝 |
| `src/runtime/entrypoint.ts` | `GenerationHost` 无 async prepared binding；`executeGeneration` 以 browser 默认校验草稿 | 以保存模式严格校验；加入可选 awaited binding / preparation cleanup，覆盖 initial、cold、既有合格 coding repair 派发前 |
| `src/runtime/entrypoint-host.ts` | prepared factory、scope、任务表、生命周期目前仅 validation；普通 author 已用 `executionAuthority` | 新 human prepared factory；共用 core 的必要 scope / binding / task workspace 分支；ProductHost 由可信保存模式装配 host |
| `src/runtime/entrypoint-preparation.ts` | `initialize` 上下文已要求 design/art/coding/repair ID | 加有限两步准备接口：refs 与 scope 先就绪，真实 PreparedTask 身份绑定后完成上下文 |
| 新增 `src/runtime/entrypoint-human-preparation.ts` | 当前无 human preparation scope / durable binding | 集中原 human 需求字节、run/ledger/deadline、执行源码闭包和真实任务绑定核对；不建通用工作流系统 |
| `src/runtime/adapters/transfer/runtime-host.ts` | `createTransferConsumerHost`、原 prepared receipt、origin / plan 身份写死 operator_validation | 增 human consumer factory；共用算法，按明确 human profile 封存原 refs / 四输出 / 双计划 / candidate 身份 |
| `src/runtime/adapters/transfer/design-validation.ts` | 原会话一次语义重写已具备；workspace 固定 `validation/...`、authority 固定 `validationAuthority` | human 分支读取绑定的原 PreparedTask.workspace 与 `executionAuthority`，核对原 journal/attempt/输入签名 |
| `src/runtime/adapters/transfer/loopback-origin.ts` | binding 固定 case/window / SHA40；原端口恢复与 listener 清理已有 | 增明确 human origin binding；核对实际执行闭包 digest，保存原 run/ledger/window 和端口，不制造 case 身份 |
| `src/runtime/adapters/transfer/binding.ts` | `freezeTransferDesign` 已支持 `ExecutionInputProfile`，默认 `validateRequirement` | 优先复用现有 `human` profile 与完整 host stages；仅在新测试证明必需时作局部类型/guard 修改 |

`src/roles/preparation-mode.ts`、`requirements.ts`、`interview.ts` 已提供固定八项验收、严格草稿 union、模式 origin 和原问题/答案，无预置地图或解法；优先原样复用。Source57 release 后只读其批准接线和来源记录，按实际 delta 调整必要调用，不重复已通过审查或验证。

新测试集中在 `tests/cli/public-preparation.test.ts`、`tests/runtime/human-preparation.test.ts` 和 `tests/transfer/human-preparation.test.ts`；共用 TEMP fixture 放在 `tests/transfer/human-preparation.fixture.ts`。若已有受影响测试能直接扩展，则复用该文件，避免重复矩阵。

## 必要 API 与执行顺序

新增 source-owned factory 的输入保留真实类型：

```ts
createHumanPreparedBrowserHost({
  root, controller, requirement, draft, resume, work, preparation,
  // requirement: RequirementContract; draft: PreparationGameDraft
  // tests only: existing BrowserHostIO / sessionFactory injection
});
createHumanTransferConsumerHost(input: HumanPreparationHostInput);
// GenerationHost additions, absent on the unchanged ordinary browser path:
bindPreparedTasks?(tasks: PreparedTask[]): Promise<void>;
closePreparation?(): Promise<void>;
```

1. 公开参数解析在任何存储/provider effect 前完成；唯一公开 adapter 为 `sokoban`，映射固定内部 `cos16-input/1`。new 可与 `--brief` 任意顺序组合；resume 未显式选择时读取保存模式，显式选择时必须与原模式一致。未知/重复/缺值选择不能创建运行。
2. 原 session/controller 完成真实问答、完整展示和当前 revision 精确确认。unsupported、EOF、cancel、旧 revision 不生成。原 `IntakeController.activateGeneration` 保持 human profile、原 ¥200 ledger 和一次 12h 激活。
3. human scope 核对原 runId、ledgerId、scope、确认 actor/time/evidence、mode origin 与完整 RequirementContract。读取所有确认 source 的实际 bytes，封存并复核 digest；结构相同但 bytes 被改仍拒绝。执行入口先沿原 reconciliation 处理未知/残留预留，未核实的费用与持久停止不获得新派发。
4. host 规划前建立固定 requirement/template/design/media/candidate/transfer/双 plan refs 和 design 输出契约，仅含来源元数据。此时不产生地图、解法、可执行计划或占位任务 ID；human adapter 使用 refs 阶段接口，validation 继续使用其已声明 grants。
5. planner 返回后，严格检查实际 design/art/coding PreparedTask 的 role、policy、依赖、outputs、workspace、权限和预算；封存完整任务及原 journal 范围。coding repair ID 用原 `continuationTargets` 规则 `${coding.taskId.slice(0, 57)}-repair`，仅预留身份和 v2 plan/candidate refs，不预先分配新费用或创造 repair task。
6. `execution.json` 与 host-owned human binding 必须在作者 context、签名和 dispatch 前封存；`await host.bindPreparedTasks?.(tasks)` 校验两者一致后才进入 DAG。绑定冷恢复读原文件，禁止重新 planner、重新 activation 或从产物猜任务 ID。
7. design 在原 workspace、原 author session/attempt/grant/deadline 写运行时地图。host tool 使用原 `executionAuthority(designTaskId)` 和 journal，保留首次失败一次不同语义重写、重复提交复用、第二失败耗尽等既有规则；不得使用 fakeValidationRequirement 或假 validation workspace。
8. 地图通过后捕获实际字节；封存 generic design + transfer design + v1/v2 两个计划四输出，再允许独立 design review 与后续 art/coding。art/coding 的准确 refs / capture 路径和当前 input signature 使用现有 COS54/COS55/COS56 接口。
9. consumer 使用同候选八段计划、实际媒体载入、build diagnostics、固定 origin 和精确 promotion。同原 human 窗口的合格 coding defect 仍按既有 assessment/grants/`continuationTargets` 自动产生一次 linked repair；repair 派发前 await 绑定，实际 ID 必须等于预留 ID，v2 plan 绑定原新 task。设计/美术通过阶段不重派或重付。
10. 原 run 的 cold resume 复核 source/requirement/task/candidate/plan/origin bytes 与 journal 后才恢复 pending；正确 through stages 零额外 author/reviewer 调用。所有 early failure、planner failure、停止/取消和 finish 路径均在 drain 后关闭 listener/准备 envelope，并移除本次 listeners。

source receipt 只记录实际执行的 source `.ts` 或 compiled `.js` 闭包、实际 resolved SDK/工具依赖来源及固定 lock/version。以当前执行入口 `import.meta.url` / worker URL 选变体，核对实际 module bytes，不用 source 副本证明 compiled 执行；只覆盖本路径执行闭包，不 hash 全 repo。Git HEAD 和声明 sourceVersion 作为辅助字段；human origin 的主身份是该闭包与确认资料 digest。复用 Source57 批准实现中可直接使用的来源记录；此规则不扩展文件读取权限。

## 实施步骤与 RED / GREEN

### 1. Source release 与有限公开入口

- [x] Root 明确放行 Source57；核对批准 SHA / merge SHA，按 merger 给定基线同步本 implementer branch，保留同一隔离窗口。
- [ ] 检查目标编码；在修改前声明源码/测试路径；每处只做必要 patch，保留 UTF-8/LF 和原中文。
- [ ] 先写 public parser/stdin RED：source `runCli` 接受固定 adapter；未知/重复/缺值参数无目录、无 prepare/provider；default browser 仍走原路径。resume 保存模式与显式匹配，不匹配零 effects。
- [ ] Run: `node --experimental-strip-types --test tests/cli/public-preparation.test.ts`。当前预期 RED 为公开选项拒绝 / 准备模式未装配；然后最小 parser + ProductHost 模式接线到 GREEN。
- [ ] 针对 continue（含 quote）和 resume --window 写准备模式 effects 前拒绝用例：无 stdin 确认、无 prepare、无新增 decision/window/reservation；在 continuation session 及公开入口必要处加入早 guard。

### 2. human scope、refs 与真实任务绑定

- [ ] 写 human factory RED：真实型 RequirementContract + 准备草稿、原 source bytes、human ledger/window 被保留；operator proposal / validation requirement / 错 mode/scope/source bytes / stopped / unknown reservation 在生成派发前拒绝。
- [ ] 加 human scope/receipt；封存实际 module/dependency 来源，复用现有 authority；refs 阶段不提供 fake ID。将 core 里的 validation-only prepared 分支局部扩展到 human，不修改默认 browser/validation 契约。
- [ ] 写 planner 后 binding RED：使用非预设 task IDs；漏 design/art/coding、错 workspace/role/output/current candidate、repair ID 不符均在 author sentinel 前拒绝。记录 binding 已持久化后才计算 context / input signatures。
- [ ] Run: `node --experimental-strip-types --test tests/runtime/human-preparation.test.ts`。当前预期 RED 为缺 human factory / async binding hook；实现上述 API、await 顺序和 early cleanup 到 GREEN。

### 3. 原 design 会话、双计划、consumer 与恢复

- [ ] 写真实 host + fake SDK RED：fake SDK 经正常角色工具写 TEMP 作者输出；host 从该输出取得地图，fixture 不提前给 host 地图/解法或手写目标游戏。验证原 human design workspace/authority、一次 semantic rewrite、四输出、双计划在 art/coding 前封存。
- [ ] 仅解除 runtime-host/design-validation 的 validation-only 类型和 authority 假设；binding 使用 human profile，所有事实来自实际原 source、captured bytes 和 journal。
- [ ] 增 cold resume：模拟 pending 中断后同原 binding / ledger / deadline / port 恢复；passed design/art 无新增 provider/reviewer。修改 requirement bytes / 执行 module bytes / task / candidate / plan / origin 时拒绝恢复，已有结果保留。
- [ ] 增合格 code_defect 的一次自动 coding repair：原 assessment/grants 通过，actual repair ID = 预留 ID，v2 不改 v1 expectations，八段 consumer + media + exact promotion 属于同 candidate；无第二次 repair、无额外 formal window。
- [ ] Run: `node --experimental-strip-types --test tests/transfer/human-preparation.test.ts`。当前预期 RED 为 human profile/workspace 被拒绝或任务绑定不完整；运行最小受影响实现至 GREEN。持久化浏览器 consumer 用合成报告/隔离 IO；不重跑未改实际 Edge 矩阵。

### 4. compiled 代表入口与独立交付

- [ ] 新测试内一次 `tsc -p tsconfig.json --outDir <TEMP>/dist`，复用该编译结果实际执行 compiled CLI + compiled host + compiled orchestrator；测试禁止 source/compiled HostFailure 混用。使用同类 fake SDK/IO，实际 bytes 来源应为 `.js`，worker 来源仍使用现有 URL 选择。
- [ ] compiled 代表用例覆盖公开参数、stdin 精确确认、human assembly/运行时 design、cold resume 和一笔 coding repair。 source/full case 的完整矩阵不复制到 compiled。
- [ ] Run: `node --experimental-strip-types --test tests/cli/public-preparation.test.ts tests/runtime/human-preparation.test.ts tests/transfer/human-preparation.test.ts`，预期受影响新用例全部 PASS、0 skip；Run: `npm run typecheck`，预期 exit 0。
- [ ] 只复跑有实际 delta 的既有代表 tests：`tests/cli/preparation-session.test.ts`、`tests/runtime/entrypoint-host-preparation.test.ts` 和被修改的 default browser / continuation tests，按 test-name-pattern 限定。未改 Edge、预算、生命周期和 validation 历史证据复用；不全面审计或反复全套测试。
- [ ] 严格 UTF-8 复读实际修改文件，检查原中文行、LF、无 replacement character；`git diff --check`，核对没有真实运行资料、key 或目标游戏加入 diff。
- [ ] implementer 提交候选并报告 exact SHA、实际 RED/GREEN 命令/结果、source/compiled 来源、known gaps。独立 reviewer 先 spec 再 code quality 检查实际 diff；本 implementer 修 actionable findings 并回审受影响变化。

## 完成判据与未决阻塞

源码交付以免费 source / TEMP 证据和独立 reviewed SHA 为准。真实 human 端到端、C6、迁移整体、完整经典基准及最终体验分别保持原状态，不由本卡的 fake SDK/stdin 结果自动转为通过。implementer 不 merge main、push 或更新 GitHub；Root 作为本批唯一 merger 记录批准与集成。

准备阶段的 Source57 阻塞已解除：Root 放行 reviewed `d7d7e8a4cabe039b99ce41e4d53717e72bde7383` / merge `9ffd5e2f1c3d81ff80e2d8e8874293e320d359a3`；本分支已 ff 同步。源码候选仍须 COS58 专属独审，集成等待 Root 解除 SOURCE_MAIN_FREEZE，由本批唯一 merger 执行。

## 实施与验证记录

- 公开参数 / SYNTHETIC stdin 首轮 RED 为 3 个缺少 adapter 接线的失败；parser 与额外正式窗口早拒绝随后 4/4 GREEN。
- human factory 首轮 2/2 RED（缺 factory）；确认实际 bytes、refs-only、stop / 未核实预留、source receipt drift / origin 清理、缺 captured dependency 均分别经历对应 RED / GREEN。
- 真实 host + fake SDK 首轮在 browser 默认草稿校验处 RED；随后运行时原 human workspace / executionAuthority、实际三角色身份、四输出和双计划、passed 阶段冷恢复通过。后续代表 1/1 GREEN，14880.4299 ms。
- 同窗口 coding repair 的 RED 暴露原编码 workspace 仍有已封存 v1 输出；仅在 live author bytes 与不可变 source capture 完全一致时允许既有修复。最终 1/1 GREEN，54296.5658 ms；两候选各八段 consumer、精确 v2 promotion、原 fee/deadline 连续、零额外 passed author/reviewer。
- 新异步绑定间隙的两处冷恢复（执行计划已封存、task binding 前 / 后、DAG 注册前）先 RED，再 1/1 GREEN（两个 checkpoint，24961.6853 ms）：只恢复原 binding / journal / task registration，没有再次 planner 或时钟激活。
- 新 source 用例及受影响 preparation 回归 22/22、0 skip、exit 0，15351.1814 ms；受影响 default browser / continuation / intake 回归 73/73、0 skip、exit 0，23434.3722 ms。原 product interviewer 的 disconnected guard 用例改为保留原 abort-before-intent 条件；实际准备模式已接通。
- compiled 代表入口在 TEMP 实际加载 CLI / host / orchestrator 的 `.js`；fake SDK 经真实角色工具写 runtime design，完成原 human 确认、一次 coding repair、cold resume。记录实际 JavaScript 与 resolved SDK / 固定 lock 字节；改 compiled module 后零新派发。初轮 1/1 GREEN，64679.3364 ms；新 bootstrap delta 后 1/1 GREEN、0 skip、exit 0，61540.0529 ms。
- `npm run typecheck` exit 0；UTF-8/LF、原中文逐行保真与 staged diff 核对随候选提交执行。未重跑真实 Edge、历史费用/生命周期矩阵或付费能力验证。
- 全部新运行资料、billing、stdin、浏览器传输报告、作者输出均为 SOURCE / TEMP / fake SDK / SYNTHETIC。实际 human 端到端与体验 NONE；不关闭 COS16/COS18、C6 或完整经典验收。
