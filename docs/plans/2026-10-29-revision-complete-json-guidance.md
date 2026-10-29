# COS154 implementation plan

状态：Root直接批准description-only最小scope，无额外独立plan审批；SOURCE pending。作者revision_read_guidance_implementer，独立源码reviewer revision_read_guidance_reviewer正在独审固定候选，尚无SOURCE批准，native辅助author_budget_recovery_design，唯一merger planning_budget_merger。新增指引只是行为假设，不证明修订会开始编辑或解决零写入。

任务：[COS154 / #155](https://github.com/lrfluobida/Cosmos/issues/155)，id6102546054；原生父COS18/#19未勾，依赖[COS149 / #150](https://github.com/lrfluobida/Cosmos/issues/150)及[COS146 / #147](https://github.com/lrfluobida/Cosmos/issues/147)。runtime基线 `b5a4ba7b23040fbae04da1d1fc21a0923061c4e0`。

Root批准输入SHA256：spec `884bfb2d20249390623a760347b63d0b9c97810ff5d421b20c960f78f0740962`；plan `082305033b6583f463765dc727e86c90a65c3a728567de599289e1065864dea4`。

Goal: extend the existing complete JSON read guidance to trusted ordinary design revisions with a minimal description-only source change.

Architecture: reuse designRevisionJsonReads after its current trusted callback validates a boolean. Prefix only read.description; preserve the reviewer string and all tools' runtime contracts.

Files: src/roles/factory.ts; tests/roles/review-json-guidance.test.ts; tests/roles/revision-json-reads.test.ts; tests/runtime/revision-json-read-selection.test.ts. All inspected as strict UTF-8 without BOM and LF line endings.

- [ ] Add selected revision, exact reviewer prefix, selector and verified-host description assertions to existing fixtures; extend the existing native null/raw-page representative to design.
- [ ] Run the affected tests before production changes and retain an expected RED log.
- [ ] Change only the factory prefix condition and role word; run affected GREEN tests.
- [ ] Run npm run typecheck, npm run build, and a strict tsc command over edited tests; re-open UTF-8 text and inspect git diff --check.
- [ ] Record exact commands/results in private verification-index.md, commit source/tests, freeze the SHA, and notify Root, sole merger, independent reviewer and native helper. Do not merge or push main.

Commands use the dedicated E:/CodexData/.codex/worktrees/cos-02-contracts/Cosmos worktree. Native tests use fake fetch and TEMP files only. Do not rerun the full suite, paid/provider/game runs or unchanged large matrices.
