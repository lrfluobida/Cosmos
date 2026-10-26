# COS-130 · 免费失败回放与阶段交接检查

状态：已独立APPROVED_PLAN并获Root批准免费实施；源码已最终独审批准并合入，仅source-scoped完成，本文件不授权真实确认、启动或付费。

源码阶段记录：最终源码 `88cdf0ca6fc6475b0890d836ce20f498cc410d66` 经独立preflight_plan_reviewer APPROVED_SOURCE_SCOPED、无finding，合入发布 `ac1c745eb0be016f8a556edbadabad013fbf61bd`，4个文件与批准树精确一致；主线typecheck/build exit0。新增入口真实交付组合1/1、0skip已独审：真实编译、Edge9/9、clean delivery、CompletionTiming eligible=true及cleanup通过；原14项有效证据复用，不合计或重跑。newEntryHandoff=source_verified；模型传输合成、费用0，realModelGeneration=unverified、userExperience=not_confirmed、paidAuthorized=false。[批准](https://github.com/lrfluobida/Cosmos/issues/131#issuecomment-6424827662)、[完成关闭](https://github.com/lrfluobida/Cosmos/issues/131#issuecomment-6424834548)及父[x]已GET核证。

审批记录：[COS130 / #131](https://github.com/lrfluobida/Cosmos/issues/131)；独立 `preflight_plan_reviewer` 已给出 `APPROVED_PLAN`、两个P2已闭合，Root批准固定输入的免费实施。实现者validation_preflight_implementer，独立源码reviewer preflight_plan_reviewer，唯一merger public_agent_batch_merger；源码已最终独审批准并合入，仅source-scoped完成。

- 批准规格输入 SHA256：`aeee5bbb1718fff620c4831f10544f67671b6f4222b950c2b63b203e296a18f4`
- 批准计划输入 SHA256：`d50925cb6f7a53d80f2cf4130e86a4b49819257cffd7b0afbfd743ca87c421f7`

登记/实施基线：`5f1c1db0162fd523714439bc046f49e142977f31`。复用COS124/125/127/128已批准证据；最终新入口交付组合依赖[COS129 / #130](https://github.com/lrfluobida/Cosmos/issues/130)，已独审新增1项组合代表。COS129已source-scoped完成，COS131已source-scoped完成，本卡最终wrapper交付组合已source_verified；测试paidAuthorized=false。room14已由Root未确认结案，merger未操作真实run。

配套[实施计划](../plans/2026-10-27-public-validation-preflight.md)。
基线：main `5f1c1db0162fd523714439bc046f49e142977f31`；已集成运行源码 `93b1b0f8e9da14a804542d3f6f4380baed54e12f`。
范围：复用 SOURCE 证据，补一条无人执行的免费命令及缺失交接；目标产品仍是 Cosmos agent。

## 1. 问题和交付

Root 已确认本批 room1–13 有 11 次进入 generation，全部止于 planning/design，尚无 art/code attempt；room10、room13 止于 intake。该统计作为一次性背景，不重新遍历旧运行或审计闭账。
当前 `public-author-protocol.test.ts` 在 art 前主动截止；`ordinary-design-host.test.ts` 连接 ordinary capture/consumer，但编译和浏览器为合成；`entrypoint-delivery.integration.ts` 使用真实编译、媒体渲染、Edge 和独立清洁包，但采用非 ordinary 草稿与确定性作者。
交付 `npm run validate:public:offline`：按固定清单重放代表边界，补 ordinary 捕获→独审→art/code 消费→真实编译/正常输入/交付；明确输出每项的预期和实际结果。
命令只读取仓库里的安全样本/测试，创建独占 TEMP 运行；不接收真实 run、controller 或共享账本路径。模型传输全部固定为合成响应，费用为零。

## 2. 窄方案比较

| 方案 | 改动 | 收益与限制 |
| --- | --- | --- |
| A：仅组合已有测试 | 一个命令入口 | 最小，但 ordinary 与真实交付仍分段，room10/13精确预算边界未入固定清单 |
| B：薄 runner + 缺口测试（推荐） | runner、历史预算小测试、现有交付测试的 ordinary 分支、package script | 复用实际生产 helper/host/SDK 和既有夹具；补已知缺口，不形成新 harness |
| C：完整历史 native 重放平台 | 新采集器、脱敏器、场景引擎 | 范围过大，容易重审闭账和重复已有测试，不采用 |

## 3. 文件边界

- 新增 `tests/runtime/public-validation-preflight.mjs`：短顺序 runner；只编排固定 Node test 选择和汇总，不复制预算、协议或 host 逻辑。
- 新增 `tests/roles/public-validation-replay.test.ts`：一张两行表，复用 `interview-budget.fixture.ts`、`ordinaryDraftOutputLimit`、`reserveEntry`。
- 修改 `tests/runtime/entrypoint-delivery.integration.ts`：保留原用例，增加 ordinary 正例和一个 capture 漂移负例；复用其工具链、媒体与交付检查。
- 修改 `package.json`：增加上述单一 npm 命令。实现登记后的正式 spec/plan 和任务卡由 Root/merger 管理。
- 不改 `src/`、CLI/intake/confirmation、现有预算、schema、cap、模型、重试或真实运行。若测试暴露生产缺陷，记录红灯并交回 Root 定义独立修复，不顺手扩张本卡。

## 4. 样本来源和最小组合

只取已公开/已批准材料中的数字、结构和错误类别；无需复制真实需求、作者文件、native 全文、凭据或安装游戏素材。输入长度按 UTF-8 bytes，费用按 µCNY。

| 类别 | 固定来源/复用测试 | 预期 |
| --- | --- | --- |
| intake 输出截断 | `tests/cli/intake-truncation.test.ts` 的 funded public resume 用例 | 原长度失败保留费用；原单次 successor 成功后仍需 TEMP 真实确认；不能把截断当草稿 |
| intake 原 grant 不足（新增） | `cosmos-issues.md` COS126 room10：250000 grant、128821已用、58649 bytes、8192 floor；room13已发布 `parent-comment.md`：53997已用、66697 bytes、同 grant/floor | quote分别182834/198930，大于余额121179/196003；无派发、无新增收费，结果 `expected_rejection` |
| 作者输出容量/累计收费 | `author-output-budget.test.ts` 的 native normalized input 用例：121633 bytes、170761已用、675000 grant | 两次真实SDK归一化报价选32621/32620，保留每次结算；`flow_passed`仅指该角色边界 |
| 设计上下文压力 | `ordinary-design-compaction.test.mjs` 的 real native summary 用例：约127550 bytes、余额507835；来源 `cos125-design-context-budget.md` room9 | 原SDK实际摘要先估价、费用保留、完整来源仍可读；不能宣称未知摘要必然可负担 |
| 请求次数 | `ordinary-design-request-capacity.test.ts` 的 request32 / request33 两例 | 32可交接；33在传输与计费前拒绝，不提高cap |
| planner JSON 与职责归属 | `planning-json-output.test.ts` 的 validation=false / invalid 两例；`planning-acceptance-binding.test.ts` 的 preserves proposal 用例 | 合法proposal成功；坏JSON拒绝；按可信policy绑定原AC，保留原proposal和其它契约 |
| review 原grant | `design-review-budget.test.mjs` 的 complete approved / length 两例；来源 `cos127-design-review-budget.md` room11：675000 grant、445787已用、剩229213 | 真实SDK实际bytes决定原4096..8192 cap；完整意见可进入评审，length结算后不能批准 |
| public作者格式 | `public-author-protocol.test.ts` 的 corrects prose-prefixed handoff once | 原作者一次readonly纠正到capture/verify/review；不把art前截止算完整链 |
| ordinary 到交付（新增） | 现有 `entrypoint-delivery.integration.ts`、`generic-media.fixture.ts` | 一条正例真实编译/媒体/Edge/clean package；一条capture漂移在下游派发前拒绝 |

清单固定为14个选中测试（两个历史预算边界放在一个表驱动测试内），不运行全仓套件；选择未命中、选中项skip或数量不符均失败。非选中测试的filter排除不计成选中skip。
已有SDK测例采用合成内容并核实际归一化bytes；历史精确数字的helper负例与SDK路径结果分别标注，不把合成上下文说成原native逐字回放。

## 5. ordinary 交接必须实际经过的边界

1. 新 ordinary 草稿有 `ordinaryProfile`、完整客观AC和体验条目；验收scenario只由确定性设计作者写入 `acceptance-plan.json`。需求确认仅发生在独占TEMP。
2. ordinary分支通过真实 `executeGeneration({root,draft,requirement,resume:false,createHost})` 进入生产链；createHost复用 `createBrowserHost`，只注入确定性planner/作者/reviewer响应。由生产planner构造任务，并调用task policies、`validateTasks`、可选 `bindPreparedTasks`、`preAuthor`、capture、verify、独立review context和`finish`；保留真实 artifact registry 和 approval receipt。不得手写 passed/capture/receipt 来跳过阶段。
3. 设计作者写有效 `design.json`、experienceMapping和plan；独审确认固定输入/证据后，修改作者工作副本为带毒标记的无效plan。art/coding只能消费捕获的design/plan，断言毒标记未进入consumer和最终browser plan。
4. art读取固定design产物并生成既有原创media fixture；coding读取同一design引用、捕获plan和真实media manifest，复用已有点击后胜利的fixture，不编写PvZ。
5. 真实锁定tsc/Vite、媒体渲染、Node服务和Edge正常输入必须通过；独立clean package、对应browser report、candidate/version、交付提升及子进程清理断言沿用现测试。`executeGeneration` 必须实际调用生产 `publishGenerationReport` 并完成清理；用 `readAutomaticReport` 读回发布的报告，核对其candidate/ordinaryExecution与执行结果，并对执行结果和落盘报告断言 `userExperience === 'not_confirmed'`。禁止手填该字段或仅在`host.finish`结果上断言。
6. 负例仅在TEMP设计批准后改变捕获plan，在调用下一角色前触发现有preAuthor校验；art/code没有派发，交付不存在。不能只在报告末尾比对后补报失败。

## 6. runner 和结果语义

入口先检查Node22、已安装锁定依赖及Edge等本地前置，再运行一次build和固定清单；不自动下载、联网安装或请求用户输入。缺前置直接非零退出并报告缺项。
Node22的 `test.run` 没有env参数，测试进程继承其调用进程的环境。runner父进程仅以 `spawn(process.execPath,[当前文件,'--worker'],{env:白名单环境,shell:false})` 启动同文件内部worker；父进程不调用`test.run`。worker首次build/test前已处于仅含所需本地变量的环境，测试只由worker启动，fixture显式提供假凭据；不得继承真实provider key、未知NODE_OPTIONS或读取用户凭据文件，也不修改调用shell环境。所有选中provider路径须明确mock且无live fallback；浏览器只访问本地fixture服务。
输出到独占TEMP下 `summary.json`/测试日志，打印其绝对路径；内容只含source SHA、Node/SDK/Edge版本、固定caseId、预期/实际分类、计数、费用断言和安全证据路径，不输出原native/context或环境值。
每项记录 `expected: flow_passed | expected_rejection` 与 `observed`；负例成功拒绝只证明守卫生效，不进入成功交付计数。缺例、错类、意外派发/费用、skip、未知结果、清理失败均红灯。
总结果分开显示 `checksPassed`、`handoffPassed`、`expectedRejections`、`uncovered`；即使exit0，报告仍为 `source_only`、`realModelGeneration: unverified`、`paidAuthorized: false`。
新runner只使用 `node:test.run` 的 `test:pass/test:fail/test:summary` 事件核对固定测试名（本地Node22类型已确认支持files、process isolation、execArgv和testNamePatterns）；不引入自制TAP解析、缓存系统、插件或场景语言。相同源码/输入/环境已有有效报告由Root直接复用，不再次运行命令。

### 与需求复用任务的最小组合触点

交付integration的文件内ordinary helper只接现有host输入 `{root,draft,requirement}` 和fixture故障模式，初次由当前TEMP准备流程提供，不预设新需求复用API。
待并行任务接口批准/集成后，由本卡implementer作为该文件唯一写者增加一个薄wrapper：新入口产出上述三个既有输入，再进入同一ordinary真实交付分支。另任务不修改该文件。
两卡集成后必须新增一次“新入口→ordinary消费→真实交付”组合代表；基础14项保持原定义，该组合单独记录，不复跑14项。缺少组合结果时明确 `newEntryHandoff: unverified`，不能据基础结果宣称付费可运行。

## 7. 复用证据与验收红绿

直接引用COS124/125/127/128已批准来源SHA和任务卡；本地 `.cosmos/cos125-integration/checks-summary.json`、`cos127-integration/checks-summary.json`、`cos128-integration/checks-summary.json`已给出代表通过记录。其余恢复、权限、账本、格式纠正矩阵不重跑。
COS65真实交付夹具和COS112 ordinary消费者的既有断言复用；新增ordinary真实交付组合必须自身执行一次，不能由两段旧结果拼出“通过”。旧宽矩阵与本次14例不累计成新通过数。
新增预算负例先证明未保留累计已用费用会错误变绿；ordinary新增正例先以遗漏plan/preAuthor或丢失绑定的局部变体证明检查能失败，再恢复真实路径通过。该红绿只验证测试敏感性，不修改生产代码制造永久失败。
验收：14项全命中且预期吻合，ordinary正例完成真实交付，负例无下游派发，provider实际费用0、无真实状态变更、证据中文完整；独立reviewer审实际diff后由唯一merger集成。

## 8. 下一次付费启用条件

本卡及并行需求复用任务必须完成各自独审、唯一merger集成；使用同一候选源码的有效免费报告及新增入口组合代表。已知intake预算负例不能写成已修复：下一run若仍需相同不够额度的输入，继续阻止启动。
Root须对下一次已确定的需求版本、入口、原费用/余额和已构造请求核对原准入；确认并行需求复用是否实际消除了重复intake前提。预算/要求/输入变化仅重测受影响项。
真实当前需求仍由用户明确确认；实际启动/paid遵守原授权和共享账本流程，当前room14保持待确认/未生成。本卡不检查或改变其运行资格、不重开room1–13。
免费回放不能预测未知LLM输出、保证未来长度或语义质量，也不能保证游戏完成；最终模型生成、真实玩法与用户体验须由后续授权运行分别给出证据。
