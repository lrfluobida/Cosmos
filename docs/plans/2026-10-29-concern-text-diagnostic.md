# COS153 exact concernText implementation plan

状态：Root直接批准最小known concernText诊断scope，无额外独立plan审批；SOURCE pending。作者concern_text_diagnostic_implementer，独立源码reviewer concern_text_diagnostic_reviewer负责actualdiff、尚无SOURCE批准，native辅助review_reply_diagnosis仅私有fixture，唯一merger planning_budget_merger。

任务：[COS153 / #154](https://github.com/lrfluobida/Cosmos/issues/154)，id6101431263；原生父COS18/#19未勾，依赖[COS152 / #153](https://github.com/lrfluobida/Cosmos/issues/153)。runtime基线 `7337a4703892f2f8bcfcb939de3befbee7e95f60`。

Root批准输入SHA256：spec `09eba98df520f3e46c255ad3fadba1bf59a4da12d09931be9b212ede3cece7d0`；plan `560698c064b7646e6d65a00ff4bdbc96c476c367b4726d91490452b849ab9636`。

Goal: expose exact known concern text mismatches through the already authorized single correction without relaxing strict review acceptance.

Architecture: extend the existing row validation loop, retain DesignConcernReferenceError and existing requestReview instanceof handling, and share one bounded supplement among reference and text diagnostics. TypeScript and node:test; source/tests only commit in codex/concern-text-diagnostic.

- [ ] Add focused failing tests in tests/roles/design-concern-reference-correction.test.ts using the existing fixtures and actual parseDesignConcernReview/parseReview/requestReview. Cover R19-shaped five rows, original first errors, same/later-row references, exact synthetic restoration, wrong second reply, malformed guards, duplicate/empty/Chinese/instruction-like source strings, bounded multibyte omissions and existing 0|1/persist guards.
- [ ] Run node --experimental-strip-types --test tests/roles/design-concern-reference-correction.test.ts and record expected missing diagnostic failures before implementation.
- [ ] Split only exact string comparison from the original identity guard. Accumulate the fixed source pointer/value through the existing loop with original first-error ordering. Extend the current helper with whole-item bounded quoted data, leaving reference-only rendering unchanged.
- [ ] Reopen UTF-8 files and verify Chinese strings, LF, no unrelated changes. Run the new test file, affected tests/roles/design-concern-proof.test.ts and tests/roles/review-input-version-correction.test.ts once; npm run typecheck; npm run build; strict new-test tsc --noEmit with NodeNext/ES2022/allowImportingTsExtensions.
- [ ] Commit the three source/test files; send exact SHA, commands and private evidence paths to Root, merger, independent reviewer and native helper. Freeze candidate for review and native R19 A/B; implement only actionable findings in this branch.

Private evidence is stored beside this plan. Native helper owns fake transport checks separately; no real provider or old-run writes.
