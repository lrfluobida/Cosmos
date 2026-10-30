# COS158 acceptanceId diagnostics Implementation Plan

状态：SOURCE范围完成。acceptance_kind_diagnostic_reviewer已对 `1b6a951b500b6a65c89fe45e86175fce6f627ac6` 独审APPROVED_SOURCE_SCOPED、无finding，Root批准唯一merger发布 `edd0375869523817b47f95c09b7486163fdea21c`；[批准](https://github.com/lrfluobida/Cosmos/issues/159#issuecomment-6514920437)、[关闭](https://github.com/lrfluobida/Cosmos/issues/159#issuecomment-6514920919)及父[x]已GET。main types/build0、4/4、0skip；3files exact，作者35/types/build/strict、独审4320和helper后续strictfalse证据复用。Root直接批准scope，无额外plan审批。

任务：[COS158 / #159](https://github.com/lrfluobida/Cosmos/issues/159)，id6112816276；原生父COS18/#19已勾（仅SOURCE，父仍open/partial），依赖[COS145 / #146](https://github.com/lrfluobida/Cosmos/issues/146)反馈基础。分支基线 `5c43c9c9b4531674f26b1f7e576a0cff96d83249`（runtime `bb25f37b93ff9408dba5685b5f1d45ad7a71df02`）。

[R24结案](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6514933470)：新kind消息0，不称COS158 live纠正。structured design1save/4set、plan1save/12append，185main/52reopen无reset，assert无missing/input无extra，host/capture/verified通过。两份独审JSON均complete/normal stop，8findings/7concerns；首host_evidence rows0/5 inputs不全且refs为string，唯一静态纠正后inputs均5项exact，但refs仍string，strict拒绝。仅内存两处替换原source对象可parser接受changes_requested/8findings/3unresolved，未写真实verdict、未语义认定。5次default/null完整compact无重复读（plan71759→44518B），末cap8828/output4418，非budget/truncation；无revision/game。

R24 planning2/46367µ、author32/522186µ、review4/193717µ，共38笔762270µ、释放4237730µ。03:56:12.661Z→04:04:30.177Z的497516ms仅清理；04:07:25.808Z永久stop、04:07:31.648Z一次settle。独立PASS_CLOSED：child167 SHA `7009546726b69aaae61b98948132f8e98d0ace0d204ea8408b7edeb37ba0f638`；shared3414 SHA `1a1dd3cff93618303c27fce3dacc254f86b0530b40113f8a1fbc7781194eeb17`，C36738979µ/H0、phase45、room12v2保持。证据 `.cosmos/public-validation/room-20261030-reuse-24/{generation-closure.json,generation-execution.json}`，只读诊断 `.cosmos/planning/review-reuse24/diagnosis.md`；旧run永久closed，无新paid/重新apply准备。

Root批准输入SHA256：spec `9e87ed0b0f2cf2983dee03d1b19df67348edabe3dcb80c60ac0c2e895467f6d3`；plan `a17f7d8166ed6d38d3c63c60316e31ee363a1adfdf4576c1862d3622320c5014`；plan原始快照独立保留，后续执行checkbox/helper分派/candidate附记不覆盖批准稿。phase45已由用户明确批准并单次应用，R23时C35976709µ/H0；R24闭账后当前C36738979µ/H0，旧run永久closed，无新paid准备。

> For agentic workers: this assigned implementer executes the Root-approved scope; acceptance_kind_diagnostic_reviewer independently reviews the exact commit; planning_budget_merger alone integrates it.

**Goal:** distinguish forbidden input acceptanceId fields from missing required assert/wait-for fields without changing validity.

**Architecture:** reuse the existing keys and ID check locations in src/acceptance/plan.ts. Add an optional static hint to the existing key error, and select the existing ID error message by own-field presence. Existing design writer/checker propagates the diagnostics unchanged.

**Tech Stack:** TypeScript, node:test, existing ordinary design writer/checker.

- [ ] Add small public unit fixtures in tests/acceptance/plan-kind-diagnostics.test.ts covering all three input kinds, unknown key grouping, all assertion/observation combinations, missing versus present invalid values, unchanged guards and issue order. Add a real writer/afterFileWrite fixture in tests/runtime/ordinary-design-diagnostics.test.ts.
- [ ] Run the new fixtures on baseline and preserve RED output showing missing diagnostics only.
- [ ] Make the minimal src/acceptance/plan.ts patch; re-open UTF-8 text and preserve existing line endings and Chinese text.
- [ ] Run new fixtures plus affected existing acceptance plan and ordinary feedback tests once. Use node --experimental-strip-types --test with explicit paths; preserve TAP logs.
- [ ] Reuse the frozen R23 prefix/final helper in TEMP to show original invalid diagnostics, 6 input removals plus 8 original-ID restores, and subsequent guards. Do not replay the native SDK or make model calls.
- [ ] Run npm run typecheck, npm run build, strict TypeScript checking for the new/affected tests, and git diff --check; preserve commands and logs in verification-index.md.
- [ ] Commit only production source/public tests, report exact SHA and evidence to Root/reviewer/merger, and freeze the implementation branch pending independent review.
