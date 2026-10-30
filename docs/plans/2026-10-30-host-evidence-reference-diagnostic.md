# COS159 host evidence reference diagnostic implementation plan

状态：SOURCE范围完成。host_evidence_diagnostic_reviewer已对 `dbb7aa2663cf0ab9ecd8a1a92c732a62858b65ca` 独审APPROVED_SOURCE_SCOPED、无finding，Root批准唯一merger发布 `66884f836b6b8f8e49872208be3b2c0a54f23808`；[批准](https://github.com/lrfluobida/Cosmos/issues/160#issuecomment-6516313250)、[关闭](https://github.com/lrfluobida/Cosmos/issues/160#issuecomment-6516313758)及父[x]已GET。main types/build0、4/4、0skip；3files exact/protocol未变，作者50/28/types/build/strict、720/12、独审duplicate/order及native A/B复用。Root直接批准scope，无额外plan审批。

任务：[COS159 / #160](https://github.com/lrfluobida/Cosmos/issues/160)，id6113292513；原生父COS18/#19已勾（仅SOURCE，父仍open/partial），依赖[COS152 / #153](https://github.com/lrfluobida/Cosmos/issues/153)及[COS153 / #154](https://github.com/lrfluobida/Cosmos/issues/154)既有typed诊断通道。runtime基线 `edd0375869523817b47f95c09b7486163fdea21c`。

[R25结案](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6516329580)：initial有效changes_requested后唯一revision启动；作者13reads+1structured design save，plan未改，readonly收尾成功remaining8/uncertainty3，v2 capture/verified通过。revision review4实际请求，首final完整24508B/normal stop、15findings/11concerns/10unresolved；COS152/COS159合计5typed诊断已构造，但correction发送前floor拒，无secondreply，无法评价模型遵循。input211718B/floor4096 quote456204µ>余305692µ差150512µ；去整个correction仍443978µ>305692µ，不能怪新diag或靠再加metadata解决。未写有效revision verdict/未语义批准、无game。

R25 planning3/45851µ、initial author20/366305µ、initial review4/125864µ、revision author17/410600µ、revision review4/183708µ，共48笔1132328µ、释放3867672µ。04:46:47.725Z→04:57:49.221Z的661496ms仅清理，05:00:26.272Z永久stop、05:00:32.068Z一次settle。独立PASS_CLOSED：child215 SHA `b5fd5ed55170e8cdabf7f6ab2b61a192d52c80457d63c7a67cdc24916ab61659`；shared3416 SHA `c8ff424f4ebc58ff8c906212d3d1845723e09a652b266c6ff743bc593574e0e8`，C37871307µ/H0、phase45、room12v2保持。证据 `.cosmos/public-validation/room-20261030-reuse-25/{generation-closure.json,generation-execution.json}`，只读诊断 `.cosmos/planning/revision-review-reuse25/diagnosis.md`；旧run永久closed，无新paid。初稿1125000µ grant/492169µ实际/632831µ未用差额仅研究观察，未转移给revision或改额，不是额外release，不能重复加到全运行释放数。

Root批准输入SHA256：spec `be0b58d1fea63b23486567ca9b60bcdce208eea76132300207dcebe3d659db73`；plan `dfebe6fb8e954052203c8c9991b30c91dbd4db1c9bb9918547fb9a764f86e0b3`；immutable originals及登记副本保留。R24保持永久closed；R25闭账后当前phase45/C37871307µ/H0，无新paid准备。

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
