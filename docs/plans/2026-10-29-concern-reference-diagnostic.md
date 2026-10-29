# COS152 implementation plan

状态：Root已直接批准最小有界诊断scope，未追加独立plan审批；SOURCE pending。作者concern_reference_diagnostic_implementer，独立源码reviewer concern_reference_diagnostic_reviewer待候选固定后审actualdiff，native辅助review_reply_diagnosis保留私有harness，唯一merger planning_budget_merger。

任务：[COS152 / #153](https://github.com/lrfluobida/Cosmos/issues/153)，id6100549858；原生父COS18/#19未勾，依赖[COS148 / #149](https://github.com/lrfluobida/Cosmos/issues/149)。runtime基线 `3da616849839b7f7756d0ab248a58ed5110f1239`。

Root批准输入SHA256：spec `e55cca0627e67eb087ba1242974d328b416de0b3b838cc4415b4698eb1c60333`；plan `dd2bda6e80e708f90dee1a46ee43e741f20919eb2edef21397abe8db6ea7f88c`。私有UTF-8/CRLF输入原件保持，本文按仓库LF排版。

1. Verify clean managed worktree E:/CodexData/.codex/worktrees/cos-02-contracts/Cosmos, branch codex/concern-reference-diagnostic from published 3da6168. Read project contracts, COS148 and R18 diagnosis. Strict-check target encodings.
2. Add focused actual parser/requestReview tests with a synthetic R18-shaped reply and all expected numeric paths/reason codes. Run RED before source edits.
3. Extract shared non-host reference validation into a narrow typed issue path. Preserve original generic guards and first rejection message, collect all applicable safe row/field diagnostics without a second reply parser. Add typed bounded formatter in a narrow module if import cycles require it; append only recognized error diagnostics in protocol.ts.
4. Run focused tests GREEN, affected existing concern/input correction tests, source typecheck/build, and strict new-test typecheck. Reopen changed files and verify Chinese text/line endings, inspect exact diff for scope and unchanged protocol/record/guard behavior.
5. Commit only source/tests, report exact SHA and evidence/gaps to Root and independent reviewer. Unique merger owns formal docs, GitHub and integration. No paid validation or live-run updates in this task.