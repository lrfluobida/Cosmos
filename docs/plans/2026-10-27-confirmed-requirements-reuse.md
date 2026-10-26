# 已确认需求与生成尝试分离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 新普通生成尝试引用原完整真实确认版本，使用自己的预算和时钟。

**Architecture:** 复用完整 confirmed-source reader，增加显式 requirementsSource 分支及原字节本地副本；现有 intake 激活、执行、capture 与体验链共用该分支。来源确认与新执行授权各自保留身份。

**Tech Stack:** Node 22 / TypeScript、node:test、现有 SnapshotStore/receipt publisher/ordinary source reader；无新依赖。

基线 `5f1c1db0162fd523714439bc046f49e142977f31`；唯一依据为[正式规格](../specs/cos129-confirmed-requirements-reuse.md)。Root 已授权此范围，不再要求重复需求确认。固定设计/计划已独立APPROVED_PLAN并获Root批准免费实施；源码独审与集成待完成，实行独立作者、独审与唯一merger流程。全程 SOURCE/TEMP、无真实 run/controller/ledger/模型/凭据操作。

审批记录：[COS129 / #130](https://github.com/lrfluobida/Cosmos/issues/130)；独立 `reuse_plan_reviewer` 给出 `APPROVED_PLAN`、无P1/P2，用户与Root批准新方法及固定输入的免费源码实施。实现者confirmed_requirements_implementer，独立源码reviewer reuse_plan_reviewer，唯一merger public_agent_batch_merger；源码独审和集成待完成。

- 批准规格输入 SHA256：`52b79cd81647b76b9c0b4603c9b1c775c52341d7aff25b2b2b2c0cbdc9b977ea`
- 批准计划输入 SHA256：`bfb2dcfa7656115373bb8b62263da9f510e75915d9f0d74e91ba0a15d01e976a`

登记/实施基线：`5f1c1db0162fd523714439bc046f49e142977f31`。本批不新付费重跑，不操作真实run/ledger/coordinator；room14未确认，不能作为批准来源。

## 文件范围

| 文件 | 改动职责 |
| --- | --- |
| 新 `src/runtime/confirmed-requirements-source.ts` | 小型类型/验证与完整原来源读取；固定引用、校验本地副本；原 confirmed reader 的共用逻辑。 |
| `src/runtime/intake.ts`、`run-types.ts`、`run-validation.ts` | 可选来源字段、bind 操作、互斥确认分支和激活；不改预算算法。 |
| `src/runtime/recovery/receipt-file.ts` | 提供原字节 write-once 发布；原 JSON publisher 委托同一原子机制。 |
| `src/cli/index.ts`、`session.ts`、`run-limits.ts`、`control.ts` | CLI 来源选择、无访谈创建/恢复、完整显示、来源 reader 兼容导出、限额与状态。 |
| `src/runtime/render-frame-selection.ts`、`modular-repair-policy.ts` | 原确认选项的来源分支；新 origin 允许来源字段。 |
| `src/runtime/entrypoint.ts`、`entrypoint-host.ts`、`experience.ts` | 执行与 persistent 实际消费者的来源接线，报告/体验绑定。 |
| `src/runtime/continuation-quote.ts` | 对引用型新 run 清楚拒绝本卡未实现的 continue，不改变旧继续路径。 |
| `src/runtime/public-validation-funding-types.ts`、`public-validation-funding-validation.ts`、`public-validation-funding.ts`、`probes/public-cli/validation.ts` | v2 来源授权与原 funding 生命周期接线。 |
| `tests/runtime/confirmed-requirements-source.test.ts`、`tests/cli/confirmed-requirements.test.ts`（新） | 原来源、激活、公开入口和实际链路测试，少量 TEMP fixture helper 可另文件。 |
| `tests/runtime/ordinary-design.fixture.ts`、`tests/cli/public-validation-funding.test.ts`、`tests/cli/ordinary-experience.test.ts` | 最小扩展现有纵向夹具/funding/体验覆盖；旧测试不重写。 |
| `docs/specs/ordinary-design-intake.md`、`probes/public-cli/README.md` | 文档补充来源与尝试区别、命令及 v2 授权；正式任务卡/计划路径由 Root 登记后确定。 |

`ordinary-profile-source.ts` 原机制优先直接复用；只有抽出共用来源核验确实需要时才做最小调整。`entrypoint-acceptance-plan.ts` 已调用统一 reader，优先不改。禁止扩展成需求仓库、阶段导入框架、旧来源迁移或自然语言等价判断。

## Task 1：固定原来源与原字节发布

- [ ] 作者在独立 managed worktree/`codex/` 分支读 AGENTS 与上述契约；记录编码与换行，写前列文件。
- [ ] 先写最小 RED：由旧 CLI 路径用真实测试 stdin 形成 ordinary v2 原确认；调用新的只读 reader，要求完整版本、原确认身份及原字节返回。新 API 缺失可作初次 RED，但后续必须有行为级 RED。
- [ ] 再写行为 RED：原来源仍合法时引用预期 revision/hash 不符，必须拒绝；改变一个 EX expected 或原 answers 后也拒绝。未确认草稿不能被只存在的 confirmation 文件批准。
- [ ] 将 `session.readConfirmedGeneration` 的原核验抽成共用读取，保留原导出与返回契约；补 IntakeSnapshot 已确认未激活分支，检查原完整问答、profile、原 receipt/evidence/current revision、local-user、specVersion 与 unsupported。
- [ ] 加 `ConfirmedRequirementsSource` 严格形状检查，source root/run identity 与指定 revision 明确；只接受直接原确认来源，拒绝递归引用。源停止/截止/结算不参与此只读需求有效性判断。
- [ ] 为原 receipt publisher 加 bytes 入口，使用同目录临时文件的原子独立发布。测试任意合法 UTF-8 缩进/换行/非 ASCII 字节保持、目标已存在拒绝及 nlink=1；不 hardlink 原来源。
- [ ] 运行新 source 测试与原 ordinary-session 来源测试；绿后提交精确 SHA，保留 RED 原因与命令输出。

## Task 2：新 intake 与公开 CLI

- [ ] 行为 RED：公开 `runCli new --requirements-from <TEMP source> --requirements-revision 2` 现在因不支持参数失败；预期无 questions/draft 调用且保存新身份、原完整要求/确认来源。覆盖 source/new 同目录或相互包含拒绝。
- [ ] 新 intake 来源字段与 confirmation 互斥；新增窄 `bindConfirmedRequirements` 操作，只在新引用型 intake 绑定原字节副本和完整 StoredDraft，不调用 confirm。saveDraft/confirm/claimDraftSuccessor/访谈派发在此模式拒绝。
- [ ] 初始化顺序为先只读核源，再建新 origin/ledger/intake，再绑定副本。保留现有 funded 初始化恢复：未绑定 draft 的同来源重试只补缺的初始化文件，已有文件必须相同；绑定后缺文件拒绝。加入一次中断恢复代表。
- [ ] 扩展 activateGeneration 的来源分支，激活前重新完整核源并匹配本地副本；保留 pending funding work、unknown/reserved、budget、readiness、stop 门禁。新 generation 的 humanDecisions 不写 requirements 项；原确认时间和两个 source 引用进入 RequirementContract。
- [ ] CLI 对 brief/source 二选一；保留旧参数路径。来源 branch 展示完整要求、来源与新限额，无 confirm 提示；等待前置或 resume 时使用保存的同一来源，host 默认不得覆盖。原 profile write-once 绑定新身份并保留源选择。
- [ ] 修改 frames/policy reader、public limits 和 status 接缝；来源选项核验使用底层原来源 reader，避免 reader 互相递归。旧分支保持原格式和校验。
- [ ] 运行来源 CLI 测试，覆盖 source 已硬停止/到期但仍可读、confirmed intake、未确认/错身份/漂移、readiness 暂停后 resume、激活前 source 漂移。所有失败断言 transport=0、无新 formal clock、原 source 文件未变。

## Task 3：真实执行链与体验绑定

- [ ] 先让 Task 2 公开入口进入原 `executeGeneration`；记录行为 RED `Requirement confirmation does not match this original run`，不能以 fake host.execute 掩盖。
- [ ] executeGeneration 以统一 reader 核验来源分支，保留旧 run humanDecision 分支。保持 planner/capture 的两个本地固定 source 引用及完整 draft；不修改下游 AC/EX，不继承旧阶段结果。
- [ ] 修复 `entrypoint-host.ts` persistent `requireCurrent` 的 confirmation.runId === task.runId：通过完整来源 reader 比较当前 draft/requirement 与原确认身份；保留现有捕获字节、当前 candidate、authority 和 actual consumer 检查。
- [ ] report ordinaryConfirmation 加可选 requirementsSource；体验加载、已完成只读恢复重新核源。旧体验回执保持原结构，不能复用旧 run 的 report/candidate/approval。对新来源 run 的 continue 在只读 quote 前明确拒绝。
- [ ] 复用 ordinaryHostFixture 的受控 sessionFactory/IO，新增公开 runCli → session → IntakeController → executeGeneration → production host → design/review → art/code → consumer → report 完整 SOURCE 用例；外部 transport/build/browser 可受控，内层路由不得 stub。夹具仅需返回可用的 host/root，调用方提供 TEMP source 和公开参数；保留可接独立 preflight ordinary 真实 delivery host 的同一窄入口，不新增测试框架或共享实现依赖。
- [ ] 增加一个 persistent 代表，必须触发 verifyBinding/requireCurrent；断言新 runId 的 consumer、原完整 source capture、AC/EX、原 actor/time、零 intake 模型请求与独立新 ledger/clock。使用两个内容不同的通用 brief/AC，避免游戏专用路径。
- [ ] 在新来源 report 上执行真实测试 stdin experience approve，再验证已完成 resume；对 source EX 变化或换 candidate 拒绝，旧 run 体验回执不获继承。旧普通/legacy/preparation/continuation 各选受影响兼容代表。

## Task 4：public-validation wrapper 与收口

- [ ] 行为 RED：原授权 validator 拒绝新增 v2 来源；期望 wrapper 的 v2 直接进入公开来源分支。用现有 fundingFixture 创建 TEMP 原 shared ledger、authorization 与 source。
- [ ] `/1` 校验逐字保留；新增 `/2` 原字段加 requirementsSource。授权 brief/renderFrames 与原来源精确一致，binding 仍通过原 authorizationSha256 绑定，限额全部属于新 run。
- [ ] wrapper 在 reserve 前核源，v2 调原 runCli 新参数，v1 保持 brief。verifyFundedNew 与 acquirePublicFundingGate 核对完整来源；v1/v2 不可互换。resume、重复初始化与 settle 沿原生命周期，不添加实际拨款工具或新 ledger。
- [ ] 正例走 wrapper → runCli → 激活/实际 planning 受控边界，检查新 identity/limits 与零 intake 请求；负例覆盖错 source/revision/hash、v1 偷加来源、v2 缺来源、源 drift，在新增 reserve/host/provider 之前拒绝。至少一个 v2 初始化中断重试证明无重复拨款。
- [ ] 更新两份小文档；复核 UTF-8/中文、最小 diff、无真实运行文件与凭据。运行一次 typecheck/build 与受影响测试集，复用无 delta 的既有通过证据。
- [ ] 作者报精确 SHA、文件范围、RED/GREEN、known gaps；独立 reviewer 先规格后代码质量，针对 actionable finding 回原分支修复与复审。唯一 merger 仅合批准 SHA 并跑组合代表；Root 记录 source scoped complete，不声称实际游戏成功。

## 验证命令与有效证据

```powershell
node --experimental-strip-types --test tests/runtime/confirmed-requirements-source.test.ts
node --experimental-strip-types --test tests/cli/confirmed-requirements.test.ts
node --experimental-strip-types --test tests/cli/public-validation-funding.test.ts tests/cli/ordinary-session.test.ts tests/cli/ordinary-experience.test.ts
npm run typecheck
npm run build
```

执行前确认当前 Node 与依赖已就绪；不为本卡发起模型/真实浏览器或环境迁移。现有临时 fixture 创建的是 SOURCE 状态，不触碰 `.cosmos` 真实 run。实现后上述测试应 PASS/0 skip；首轮 RED 必须记录具体旧契约失败，不把错 fixture、缺环境、mock 只回成功当作功能证据。来源 snapshots/原字节在 TEMP 前后比较；新 ledger 不含旧 entry/request，clock 只从本次 activation 开始。

交付边界：公共可达、源完整确认可复核、新尝试预算/时钟独立、普通与 persistent 实际接线、体验与 funding 绑定通过即可完成本卡。实际模型输出质量、旧阶段复用、room14 批准、真实运行重启均不在完成声明内。
