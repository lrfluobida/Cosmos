# 免费失败回放与阶段交接检查 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkboxes; this fixed plan has independent approval and Root implementation authorization.

**Goal:** 用一条免费命令复用已知失败测例，补 ordinary 设计捕获到真实编译/试玩/交付的组合缺口。
**Architecture:** 一个固定清单runner复用Node test runner；一个小预算表驱动测试与现有交付integration的ordinary分支。所有运行只在TEMP，生产helper/host/SDK照常执行，模型传输合成。
**Tech Stack:** Node22、TypeScript strip-types、node:test、已锁定Pi SDK0.99.2、tsc/Vite、Playwright/Edge；无新依赖。

基线 `5f1c1db0162fd523714439bc046f49e142977f31`；技术规格见[正式规格](../specs/cos130-public-validation-preflight.md)。状态：已独立APPROVED_PLAN并获Root实施批准，源码独审与集成待完成。

源码阶段记录：基础源码9a8f97e71b95eed318849a026dabcecbecc6a178已APPROVED_SOURCE_BASE_SCOPED；wrapper680fe61b714faaf015a017593ab30bb67d6ac165仅STATIC_APPROVED_PENDING_COMBINATION，尚未合入/完成。本卡在已发布COS131修复上只补1项新入口真实交付组合，已有14项有效报告复用；newEntryHandoff=unverified，paidReady=false。

审批记录：[COS130 / #131](https://github.com/lrfluobida/Cosmos/issues/131)；独立 `preflight_plan_reviewer` 已给出 `APPROVED_PLAN`、两个P2已闭合，Root批准固定输入的免费实施。实现者validation_preflight_implementer，独立源码reviewer preflight_plan_reviewer，唯一merger public_agent_batch_merger；源码独审与集成待完成。

- 批准规格输入 SHA256：`aeee5bbb1718fff620c4831f10544f67671b6f4222b950c2b63b203e296a18f4`
- 批准计划输入 SHA256：`d50925cb6f7a53d80f2cf4130e86a4b49819257cffd7b0afbfd743ca87c421f7`

登记/实施基线：`5f1c1db0162fd523714439bc046f49e142977f31`。复用COS124/125/127/128已批准证据；最终新入口交付组合依赖[COS129 / #130](https://github.com/lrfluobida/Cosmos/issues/130)，须独审另增1项组合代表。COS129已source-scoped完成，COS131已source-scoped完成，本卡最终wrapper交付组合待验；本批不新付费或操作room14。

## 0. 固定输入与协作

- [ ] Root登记GitHub子任务、原生依赖和批准的spec/plan SHA256；本卡依赖现有COS124/125/127/128，不修改并行需求复用任务的CLI/intake/confirmation范围。
- [ ] 指定独立implementer、独立reviewer和本批唯一merger；implementer从已批准基线创建managed worktree及 `codex/` 分支。
- [ ] 读取AGENTS/CONTEXT/总spec/本卡；确认四个目标源码/测试文件UTF-8并记录行尾。改动前说明文件；不force-add忽略的真实运行资料。
- [ ] 复用规格第7节已过证据，只核相关文件/SDK/输入是否有实际变化；不重跑全仓测试、不遍历旧run、不打开真实controller或账本。

## 1. 新增精确预算负例

**Create:** `tests/roles/public-validation-replay.test.ts`。
**Reuse:** `tests/roles/interview-budget.fixture.ts`、`src/roles/interview-budget.ts`、`src/budget/ledger.ts`。

- [ ] 写单一测试 `public offline replay preserves settled intake costs at room10 and room13 boundaries`，顺序遍历 `{caseId:'room10',spent:128821,inputBytes:58649,quote:182834}` 和 `{caseId:'room13',spent:53997,inputBytes:66697,quote:198930}`。
- [ ] 每行新建现有TEMP预算fixture，用原 `spend` 形成真实settled记录，读取before快照。floor8192、grant250000，使用fixture生产估价规则 `inputBytes*2 + maxOutputTokens*8`；调用 `ordinaryDraftOutputLimit`，必须拒绝不可负担floor。
- [ ] 同时用原 `reserveEntry` 在before.ledger clone验证floor拒绝；断言全快照不变、mock provider bodies为0、既有settled合计和余额准确。数据标签只叫历史边界合成回放。
- [ ] 测试敏感性：临时不扣spent时负例必须失败（因为会错误接受）；恢复后运行 `node --experimental-strip-types --test --test-name-pattern="^public offline replay" tests/roles/public-validation-replay.test.ts`，应1个选中通过。
- [ ] 不修改intake源码、不抄真实问答、不造真实billing/native。使用现有fixture清理；记录该1项通过，不扩展旧budget矩阵。

## 2. 补 ordinary 真实交付组合

**Modify:** `tests/runtime/entrypoint-delivery.integration.ts`。
**Reuse:** 同文件的toolchain/clean package/browser检查，`tests/acceptance/generic-media.fixture.ts`，ordinary host现有生产方法。

- [ ] 将现有test正文中确需共享的setup保留为文件内小helper，保持原非ordinary case语义和断言。ordinary分支只接既有 `{root,draft,requirement}` 和fixture模式，以便集成后接新入口；不预设未批准API。新增固定测试名 `public offline ordinary captured design reaches real clean delivery` 和 `public offline ordinary changed capture blocks downstream dispatch`，不新增通用fixture框架。
- [ ] ordinary分支用 `ordinaryProfile:'ordinary-design/1'`、一个点击胜利AC及一个状态可读体验条目；需求draft不携带scenario。TEMP确认/activation保持原路径；设计作者单独写ordinary acceptance-plan与experienceMapping。
- [ ] ordinary helper调用真实 `executeGeneration({root,draft,requirement,resume:false,createHost})`；createHost复用 `createBrowserHost` 并注入确定性roleFactory。planner只按host policies返回proposal，PreparedTask由生产planTaskDag构造；生产entrypoint调用validateTasks/bindPreparedTasks、DAG及原preAuthor/capture/verify/reviewImages/diagnoseFailure/recovery。原非ordinary case保留现有直接DAG路径，新增分支不手工补passed或批准。
- [ ] 三角色在各自输入引用读取捕获来源；独立reviewer context检查inputVersions/evidenceIds。设计批准后只改变作者工作副本plan为毒标记，正常路径必须继续使用捕获plan。
- [ ] art读取固定design后写既有media定义；coding读取同一design、plan和捕获media manifest，写既有genericMediaFixture；不增加游戏功能或PvZ素材。
- [ ] 正例沿用真实tsc/Vite、renderer、Edge、独立clean package、browser evidence、candidate/version和清理断言；让executeGeneration实际完成 `publishGenerationReport` 和cleanup，再用生产 `readAutomaticReport(root)` 读回落盘报告。核对报告与执行结果的candidate/ordinaryExecution/scenario，分别断言 `userExperience === 'not_confirmed'`，且报告为awaiting_user_experience；禁止手填体验字段、mock报告发布，或只读host.finish元数据。该同一helper继续供最终reused入口组合使用。
- [ ] 负例仅在TEMP批准后的捕获plan发生变化；必须在art/code派发前拒绝，calls无art/code且无delivery，仍正常清理。期望拒绝不计成功交付。
- [ ] 测试敏感性：临时遗漏plan验证正例失败，临时不传preAuthor验证漂移负例失败，随后恢复真实路径。若生产缺陷而非测试遗漏导致红灯，停止本卡扩张并报告独立修复事项。
- [ ] 执行 `npm run build`，再 `node --experimental-strip-types --test --test-name-pattern="^public offline ordinary" tests/runtime/entrypoint-delivery.integration.ts`，应2项命中且预期吻合；本机无Edge则明确阻塞，不能skip或降为fake。

## 3. 薄runner与固定命令

**Create:** `tests/runtime/public-validation-preflight.mjs`。
**Modify:** `package.json` 增加 `"validate:public:offline": "node tests/runtime/public-validation-preflight.mjs"`。

- [ ] runner父进程使用 `spawn(process.execPath,[fileURLToPath(import.meta.url),'--worker'],{env:safeEnv,shell:false})` 启动同文件内部worker，转交退出码；父进程不build、不调用test.run。worker用child_process argv调用本地build，再用 `node:test.run({files:[file],isolation:'process',concurrency:1,execArgv:['--experimental-strip-types'],testNamePatterns:[exactPattern]})` 顺序运行各组；不加文件/依赖/框架，不接受真实root/ledger/run/授权输入，不自动联网安装。
- [ ] safeEnv在启动worker前按白名单构造，只含PATH/SystemRoot/TEMP/TMP及Edge所需目录等本地变量，显式保留合法COSMOS_TEMPLATE_ROOT；不展开整个process.env，不继承API key、用户Pi凭据路径或未知NODE_OPTIONS。Node22 test.run无env参数，测试继承已净化worker的process.env；首次test.run必须发生在该worker内，调用shell环境保持。各选中fixture显式注入假凭据/fake transport且无live fallback。
- [ ] 读取 `node:test.run` 的 `test:pass/test:fail/test:summary` 结构化事件核对完整测试名及失败；只为下面固定清单记录结果，不解析人类TAP文本。fixture非匹配过滤项可忽略，选中项skip/零命中/重复/失败/超时均非零退出。runner失败也保留已取得的安全结果。
- [ ] 每组使用独立子进程，测试顺序执行；real browser组仅允许本地fixture服务。创建一个独占TEMP结果目录，保存summary和安全测试日志、必要清理状态，打印绝对路径。
- [ ] 输出source SHA和运行时版本；每例expected/observed用 `flow_passed`/`expected_rejection`，汇总checksPassed/handoffPassed/expectedRejections/uncovered，固定source_only、realModelGeneration=unverified、paidAuthorized=false。不要打印环境、native/context或真实凭据。

固定选择（完整名按下列既有名称锁定；共14项）：

1. `tests/cli/intake-truncation.test.ts`：`funded public resume preserves old answers and charges, then requires actual draft confirmation`。
2. 新预算文件：Task1的单一表驱动测试。
3. `tests/roles/author-output-budget.test.ts`：`COS124 native normalized input, selected cap, real reservation and six billing fields agree across settlements`。
4. `tests/providers/ordinary-design-compaction.test.mjs`：`COS125 real native summary is quoted before dispatch and preserves original sources`。
5. `tests/runtime/ordinary-design-request-capacity.test.ts`：`COS122 native design author reaches protocol handoff on model request 32` 和 `COS122 native request 33 is denied before transport and accounting, including readonly correction`。
6. `tests/roles/planning-json-output.test.ts`：`trusted planning reaches native JSON transport and preserves host bindings: validation=false` 和 `JSON transport remains fail closed for invalid responses without correction`。
7. `tests/roles/planning-acceptance-binding.test.ts`：`trusted acceptance binding preserves the proposal and every other task contract field`。
8. `tests/providers/design-review-budget.test.mjs`：`COS127 SDK complete approved uses native compact reads and the original grant` 和 `COS127 SDK length with complete-looking approved JSON settles and cannot approve or retry`。
9. `tests/runtime/public-author-protocol.test.ts`：`COS128 public ordinary corrects prose-prefixed handoff once`。
10. 交付integration：Task2新增的2项。

- [ ] 定向验证runner：用临时不存在的选中名证明零命中红灯；用临时移除本地前置证明缺项红灯；恢复后运行 `npm run validate:public:offline`，确认14项全命中、selectedSkip0、paid0、1条真实ordinary交付与负例分开。无需给短runner新增镜像实现的单元框架。
- [ ] README说明可直接放runner头注释和npm输出；不要创建无关用户流程或文档体系。已有成功报告在同SHA/输入/环境下复用，不由runner构建自动缓存机制。

## 4. 审查、集成与交付

- [ ] 逐个读回修改文件，确认UTF-8、中文、行尾和无无关格式改动；运行 `git diff --check`。记录新增/受影响测试、命中数、未覆盖语义及真实费用0。
- [ ] implementer提交四文件，报告exact SHA、命令、日志路径、两类成功计数和缺口。独立reviewer先审spec遵从再审实际diff质量，核fake边界、原预算不变、真实host链和报告不误导。
- [ ] 若review finding，只由implementer改原分支；reviewer重审受影响delta。禁止把预算不足期望拒绝改成加钱、降floor、skip或放宽schema来变绿。
- [ ] 并行需求复用API批准并合入候选组合后，由本卡implementer单独修改交付integration，增加 `public offline reused requirements reach ordinary clean delivery` 薄wrapper；先走已审新入口，取实际 `{root,draft,requirement}` 后调用同一ordinary helper。另一作者不写该文件，未定API不提前耦合。
- [ ] 独立reviewer审这项affected diff；唯一merger核批准SHA后合入main，运行一次build/typecheck及上述新入口组合代表。同输入14项报告复用，组合代表另记1项，不重跑全套。缺该代表的报告须写 `newEntryHandoff: unverified`。记录集成SHA与结果并更新GitHub任务。
- [ ] 只标记SOURCE检查完成。Root按spec第8节判断下一paid条件；room14待确认、room1–13永久关闭、共享ledger和实际授权均保持原状态。
