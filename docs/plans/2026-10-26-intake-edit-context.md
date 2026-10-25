# 普通需求编辑上下文 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. 本卡须由专属 implementer 在 managed worktree 实施，另设独立 reviewer；仅指定的唯一 merger 可合 main。

**Goal:** 新 ordinary 编辑轮次看到经主机核验的上一版生成条目，同时保持原问答、完整输出、旧缓存、预算和确认边界。

**Architecture:** 在 interview 的原请求构造前加入一个窄编辑上下文 reader，复用当前 snapshot、固定草稿路径、普通来源 reader 和既有完整草稿摘要。只对新 ordinary draft-N 使用新版 intent 和独立 context；旧 intent 保持原解释，输出和下游输入契约不变。

**Tech Stack:** TypeScript、Node 22.22.2+（<23）、node:test、现有 Pi adapter、pinned pi-ai/pi-coding-agent 0.99.2、免费 fake fetch transport。

---

状态：已完成独立源码审查与主线集成，source-scoped-complete。配套[规格](../specs/cos126-intake-edit-context.md)，基线 `8485321c35bacf06c285596eb808d588027f1774`；独立计划reviewer intake_edit_plan_reviewer、实现者cos126_implementer、独立源码reviewer cos126_reviewer、唯一merger public_agent_batch_merger。源码范围已完成，实际语义/游戏效果另行验证。

源码结果：独立cos126_reviewer对 `279e2da111d453fea6070be2d15b37449178e4be` 完成规格/质量审查，APPROVED_SOURCE_SCOPED、无finding；唯一merger合入发布 `c189c49b0094873d2a8270151915d3aef0eba273`，4文件精确一致，主线typecheck/build与4/4短代表通过。[批准](https://github.com/lrfluobida/Cosmos/issues/127#issuecomment-6401471323)、[完成关闭](https://github.com/lrfluobida/Cosmos/issues/127#issuecomment-6401474881)已核证。仅SOURCE范围完成，父COS18仍open/partial；room10旧v1–v3的runtime2fbb61d与等待证据保持，新edit来源/资格另由Root/operator核验，本批不关闭或结算真实run。

审批记录：[COS126 / #127](https://github.com/lrfluobida/Cosmos/issues/127)；独立 `intake_edit_plan_reviewer` 给出 `APPROVED_PLAN`、无finding，Root批准以下固定输入的正式发布与免费源码实施。源码后续独审与集成结果见上述状态记录。

- 批准规格输入 SHA256：`338cf6350db090ba1e24a14b14e70c799908ec2cb93d20669248f9b2a9f29be8`
- 批准计划输入 SHA256：`457e4419dbf02c174297bc48393f5e1df4deef2d9226849be70dce7b125c610e`

## 文件边界

必须改动：

- Create `src/roles/interview-edit-context.ts`：窄类型、固定投影、当前/缓存来源读取和派发前复核；无通用版本存储或新路径权限。
- Modify `src/roles/interview.ts:53-140`：先读 recorded intent、选择旧/新请求身份、加入顶层 context、组合已有 recheck。保持 ordinaryPrompt 和 user input 原问答结构。
- Create `tests/roles/interview-edit-context.test.ts`：来源、投影、版本、缓存/后继与预算的受影响回归。
- Create `tests/cli/intake-edit-context.test.ts`：真实 CLI/factory/Pi/SDK 的两版编辑与旧 v3 到新 v4 代表。

按实际必要性最小修改：

- `tests/roles/interview-recovery.fixture.ts`：仅当新测试无法在现有 callback/bodies/configs 接口完成时，允许传入观察到的 body 给响应 callback；不假造 interview/session/controller 行为。
- `src/roles/interview-schema-recovery.ts`、`src/roles/interview-denial.ts`、`src/roles/interview-recovery.ts`：仅允许新上下文来源参与既有 proof/recheck 所必需的接线；首选 interview 层组合，无差异就不改。
- 正式登记后的 docs/specs/cos126-intake-edit-context.md、docs/plans/2026-10-26-intake-edit-context.md 由 Root/merger 指定职责维护。未经派发不改总 spec、task 映射、PROGRESS 或 GitHub。

不需改 ProductHost 公共接口、CLI 命令、draft schema、预算/ledger、Pi 请求规则、运行时设计或游戏代码。若实现发现必须扩大这些边界，先把事实交 Root，不以实现便利扩项。

## Task 1：建立真实链路 RED（一个实现任务的第一阶段）

**Files:** tests/cli/intake-edit-context.test.ts；tests/roles/interview-edit-context.test.ts。

- [ ] 在 managed worktree 核对 HEAD 和 AGENTS；检测将改文件为严格 UTF-8，记录行尾。先宣布文件范围。使用 @superpowers:test-driven-development。
- [ ] 复用 `fakeInterviewSdk` 的真实 createPiSession 与 fake fetch。临时 root 用 mkdtemp/removeOwned；只给临时测试配置 `DEEPSEEK_API_KEY=offline-fixture`，恢复原环境且不打印它。真实 room 目录不作为 fixture。
- [ ] 新 CLI 测试直接用 `runCli` 与 `createProductHost(repository, {sessionFactory: sdk.sessionFactory})`。使用真实 prepare、真实问题/草稿、真实 controller 与 SDK；不把 host.draft 替换为自写的更新函数。模板依赖按项目既有方式准备，缺依赖应报错，不 skip 主验收。
- [ ] fake transport 的首稿返回至少两个 AC 和一个体验项，包含只出现在模型输出中的中文哨兵 `旧稿独有：列表恢复前先制造未保存变化`。当前 brief/questions/answers 不包含这句话。下一次回答仅要求修改其中一个期望并保留其他项。
- [ ] 第二个 draft 的 fake transport 先检查实际 SDK body 的 system message 含完整 JSON context，解析其中 editContext；只有确实见到旧 proposal 才返回复制旧 proposal 并修改指定一项的完整响应。断言其余 AC/体验项保持原 ID/steps/expected。这验证传递与保存，不模拟真实模型语义保证。

核心测试断言形状：

```ts
const context = JSON.parse(sdk.configs.at(-1)!.context!);
const body = sdk.bodies.at(-1)!;
assert.ok(body.messages.some((m: any) => m.role === 'system'
  && typeof m.content === 'string' && m.content.includes(JSON.stringify(context))));
assert.deepEqual(context.editContext.proposal.acceptance, previousGameplay);
assert.deepEqual(context.input.answers, revisedUserAnswers);
assert.equal(JSON.stringify(revisedUserAnswers).includes(uniquePreviousText), false);
assert.equal('answers' in context.editContext.proposal, false);
assert.equal('classicEntry' in context.editContext.proposal, false);
assert.deepEqual(savedV2.acceptance.filter(isUnchanged), previous.acceptance.filter(isUnchanged));
assert.deepEqual(savedV2.answers, revisedUserAnswers);
assert.equal(snapshot.confirmation, null);
assert.equal(snapshot.run.originalStartedAt, undefined);
```

- [ ] 输入流为首轮答案→edit→新答案→旧版 confirm 1→cancel；断言必须出现 confirm 2、旧 confirm 被拒，真实 host.execute 未被调用，没有 generation clock。请求数恰为 questions+draft1+draft2。
- [ ] 运行 `node --experimental-strip-types --test tests/cli/intake-edit-context.test.ts`。RED 必须是缺上一版 context/哨兵断言；若失败在模板、funding、SDK fixture 则先修 fixture，不能当 RED。

## Task 2：实现最小 reader 与新版请求身份

**Files:** src/roles/interview-edit-context.ts；src/roles/interview.ts。

- [ ] 新模块复用 `regularFile`、`readOrdinaryProfile`、`requireOrdinaryDraftSource`、`ordinaryDraftSha256`、`validateGameDraft`、`gameplayAcceptance`、`sameValue`。接受 controller、可信 roundId、当前输入与原 recorded intent；禁止任意 previous path/模型来源参数。
- [ ] 实现纯投影；保留选填字段的实际存在性，不以 undefined 新增字段：

```ts
function project(previous: OrdinaryGameDraft): EditableProposal {
  return structuredClone({
    acceptance: gameplayAcceptance(previous),
    experienceCriteria: previous.experienceCriteria,
    unsupported: previous.unsupported,
    ...(previous.benchmark ? { benchmark: previous.benchmark } : {}),
    ...(previous.codeProfile ? { codeProfile: previous.codeProfile } : {}),
  });
}
```

- [ ] 固定 instruction 置于新 context，措辞按 spec：当前完整输入优先，旧 candidate 未确认，保留仍适用的未改项，完整原协议输出，不扩 scope/authority。不要改 ordinaryPrompt。
- [ ] 首次新普通 draft-N 只在 current=N-1 且未停止/确认时读取固定旧稿；严格解码、验证 schema/profile、核原问答来源、payload==snapshot，且 brief/questions 等于当前输入。生成 previousRevision、复用完整字节摘要、proposal 和固定 instruction。
- [ ] recorded version 1 走原构造；新 edit version 2 按固定 N-1 文件与保存摘要重构完整上下文，精确比较整个 intent。缓存可在当前 N 或更晚读取，但任何新派发必须 current=N-1、未确认/停止。未知/非法新版本必须拒绝，不能退回旧格式。
- [ ] interview 原 `input` 与最终 `requestDesignDraft` 的组装保持。将 editContext 放 intent/context 顶层，版本 2 只用于新 edit。原 questions、draft1、legacy、preparation 与旧 intent 都保持原字节形状。
- [ ] 在原始 intent 发布前及 session 创建前复核来源；successor 在原 claim 前组合旧 recheck 与 edit 来源复核，不能先消费 slot 再发现旧稿变动。保留原残留目录/claim/缺来源守卫、finally 与 funding work 清理。
- [ ] 跑 Task 1 GREEN 与 `node --experimental-strip-types --test tests/roles/interview-edit-context.test.ts`。核所有原 draft 文件字节仍不变；不向新 answers、draft 或确认来源加入 editContext。

## Task 3：受影响兼容与拒绝矩阵

**Files:** tests/roles/interview-edit-context.test.ts；tests/cli/intake-edit-context.test.ts；仅必要的既有 fixture。

- [ ] 来源表测试：当前 revision 不匹配、确认后新的 edit、stop/abort、旧稿缺失/字段变动、旧 answers/origin/profile 漂移、非法 UTF-8、非独立文件/链接。失败在 session/transport 前，原 settled 请求不变，不能触发 schema correction。路径测试复用现有 helper，不新增平台抽象。
- [ ] 成功新版 cache：request→save N→再次读同 round，以及源 N-1 未变的更晚 revision 缓存；不新增 transport。改旧稿或保存 binding/context 任一字段后拒绝。完整缓存读取不授予旧 round 重新发送的权限。
- [ ] 旧 version 1 已保存 reply 和已有 successor fixture 仍按原 prompt/context 读取。至少覆盖普通完成 cache、旧 schema claimed success，以及既有 length/denial 代表；不得通过新 helper 给旧 intent 补字段。
- [ ] 新版 edit 正常 stop 返回结构错误后，既有一次 schema correction 的真实 native system/context 保留同一个 editContext，原 user input 仍只有原问答和 schemaCorrection，旧回答文件未变。补一个新版 length 或 denial 代表确认仍共享单槽；第三次派发为 0。新上下文来源在 recheck 间变动应在 claim/session 前拒绝。
- [ ] 预算测试从实际 SDK body/现有估算器确认新 context 计入 inputBytes。使用临时真实预算把剩余额度设在可/不可负担边界，验证原输出选择与 reserve/admit 拒绝；不 mock 报价为忽略 context 的常量，不提高 grant，不新增请求机会。
- [ ] 临时 funded controller 场景复用 `budgetFixture`/fundingFixture，把已保存的 v3 作为当前稿；原 v1/v2/v3 与旧 version 1 intent 完整保留，经真实 `runCli resume`→展示 v3→edit→新 draft4→cancel。断言无 draft3 transport，无新 funding binding，4 的上下文等于旧 v3 投影，当前确认仍为空。仅使用临时目录数据，不打开 room10 controller。
- [ ] 复用并运行受影响兼容集：

```powershell
node --experimental-strip-types --test tests/roles/interview-edit-context.test.ts tests/cli/intake-edit-context.test.ts tests/roles/ordinary-interview.test.ts tests/roles/interview-schema-recovery.test.ts tests/roles/interview-recovery.test.ts tests/roles/interview-budget.test.ts tests/cli/unsupported-session.test.ts tests/cli/ordinary-session.test.ts
```

预期 exit 0、0 fail、0 skip；没有改动的长矩阵按获批既有证据复用，不叠加计数。若新增测试影响既有 prompt/来源比较，先查实际输出，不删校验来绿测。

## Task 4：检查、提交与独立交接

**Files:** 本卡全部实际改动文件与私有验证索引。

- [ ] 运行 `npm run typecheck`、`npm run build`、`git diff --check`，预期 exit 0。新增测试 strict 命令为 `node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --verbatimModuleSyntax --skipLibCheck --allowJs --types node tests/roles/interview-edit-context.test.ts tests/cli/intake-edit-context.test.ts`。若既有传递依赖产生 baseline 诊断，按项目既有 changed-test strict 流程保存原输出与基线对照、明确每项归属；本卡新增诊断必须为 0。不把主 tsconfig 不含 tests 当作测试已 typecheck。
- [ ] 严格 UTF-8 回读全部编辑文件，查看中文哨兵和原中文片段、确认无 U+FFFD/问号替换/意外行尾变化。检查 diff 仅为约定文件，没有真实 run、ledger、API key、目标游戏或新依赖。
- [ ] 保存 RED/GREEN、命令/exit code、完整 TAP、改动测试 strict 输出和已复用证据路径，失败记录也保留。测试只声称 SOURCE/TEMP 接线与边界通过。
- [ ] 在 implementer 分支提交，报告 exact SHA、测试、复用项和已知缺口。建议一次聚焦源码提交 `fix: preserve prior draft context during ordinary edits`；不要合 main 或推公共文档。
- [ ] Root 派独立 reviewer 审实际 diff，先逐条 spec 后质量；作者修复 findings 后重审受影响变化。Reviewer 不代写实现。只有唯一 merger 获批准 SHA 才合入并跑最短集成代表。
- [ ] merger 的最短代表至少覆盖真实 CLI 编辑链、新版成功缓存来源与一个后继/native 比较、typecheck/build。复用作者仍有效的其余结果。
- [ ] Root/operator 在稳定主线后另行判断 room10 原 CLI edit 的生产资格；本卡实现/测试/merge 不操作真实 run，不 stop/settle 或重放旧请求，不宣称修复后的真实语义/游戏/体验已通过。

## 完成判据

独立设计/计划审查后才能派发实施；源码独审和唯一合并后才可标记 source-scoped 完成。真实模型语义质量及 room10 下一版完整需求确认仍待实际流程。本计划的正式发布不代表源码步骤已经完成；以独立实现与审查回执为准。
