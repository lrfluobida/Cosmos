# COS159 host evidence reference diagnostic implementation plan

状态：Root已读immutable批准稿并直接授权scope，无额外独立plan审批；SOURCE pending。作者host_evidence_diagnostic_implementer，独立reviewer host_evidence_diagnostic_reviewer正在核固定候选 `dbb7aa2663cf0ab9ecd8a1a92c732a62858b65ca`，尚未SOURCE批准；native helper review_reply_diagnosis的A/B尚未记作通过，唯一merger planning_budget_merger。原计划checkbox为作者执行记录，不代表独立源码批准。

任务：[COS159 / #160](https://github.com/lrfluobida/Cosmos/issues/160)，id6113292513；原生父COS18/#19未勾，依赖[COS152 / #153](https://github.com/lrfluobida/Cosmos/issues/153)及[COS153 / #154](https://github.com/lrfluobida/Cosmos/issues/154)既有typed诊断通道。runtime基线 `edd0375869523817b47f95c09b7486163fdea21c`。

Root批准输入SHA256：spec `be0b58d1fea63b23486567ca9b60bcdce208eea76132300207dcebe3d659db73`；plan `dfebe6fb8e954052203c8c9991b30c91dbd4db1c9bb9918547fb9a764f86e0b3`；immutable originals及登记副本保留。R24已永久closed，phase45/C36738979µ/H0不变，当前无新paid准备。

Goal: identify the observed host reference mismatches in the existing single correction without changing strict review acceptance.

Architecture: keep the parser's original loop and trusted typed error. Split host proof eligibility from the two exact-reference comparisons, then add safe expected metadata to the existing bounded renderer only when a host mismatch is present. No second parser or protocol change.

- [x] Add R24-shaped focused tests to tests/roles/design-concern-reference-correction.test.ts: two host rows among seven, five fixed inputs, eight findings, three unresolved concerns. Observe RED for all four initial fields and two remaining evidenceRefs fields; synthetic corrections retain all findings/statuses and actual objects stay invalid.
- [x] Add guard cases for unknown/failed/skipped/stale/uncovered/top-undeclared evidence, reordered/extra references, malformed identity/shape, earlier errors and collection stopping. Add actual requestReview checks for one persisted correction, second rejection and zero corrections using temporary fixture state only.
- [x] Implement the smallest parser/helper extension. Expected reference lists are trusted fixed metadata, complete object arrays in exact order; deduplicate identical source lists for small diagnostics, retain numeric field/source pointers when omitted. All diagnostic portions share the existing 4096-byte budget and no-host bytes stay identical.
- [x] Run the focused tests GREEN, existing design-concern-proof and review-input-version-correction tests, npm run typecheck, npm run build, and strict tsc for the changed test. Save logs and verification-index.md privately in this directory.
- [ ] Run the original R24 proposals through the candidate parser read-only, checking all expected paths and synthetic-only references control; reuse the helper's native A/B probe with original prefix/usage/grant after candidate freeze. No real provider call or real-run write.
- [x] Reopen UTF-8 targets, inspect Chinese and git diff --check, commit only approved source/tests on codex/host-evidence-reference-diagnostic, report exact SHA and freeze for independent review. Merger alone integrates and pushes.

Commands (workdir E:/CodexData/.codex/worktrees/cos-02-contracts/Cosmos):

```
node --experimental-strip-types --test tests/roles/design-concern-reference-correction.test.ts
node --experimental-strip-types --test tests/roles/design-concern-proof.test.ts tests/roles/review-input-version-correction.test.ts
npm run typecheck
npm run build
node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --verbatimModuleSyntax --skipLibCheck --types node tests/roles/design-concern-reference-correction.test.ts
git diff --check
```

Expected RED: missing typed host diagnostic. Expected GREEN: all scoped assertions pass, original first-error text preserved, typecheck/build/strict exit 0.
