# COS152: bounded design concern reference correction

状态：Root已直接批准最小有界诊断scope，未追加独立plan审批；SOURCE pending。作者concern_reference_diagnostic_implementer，独立源码reviewer concern_reference_diagnostic_reviewer待候选固定后审actualdiff，native辅助review_reply_diagnosis保留私有harness，唯一merger planning_budget_merger。

任务：[COS152 / #153](https://github.com/lrfluobida/Cosmos/issues/153)，id6100549858；原生父COS18/#19未勾，依赖[COS148 / #149](https://github.com/lrfluobida/Cosmos/issues/149)。runtime基线 `3da616849839b7f7756d0ab248a58ed5110f1239`。

Root批准输入SHA256：spec `e55cca0627e67eb087ba1242974d328b416de0b3b838cc4415b4698eb1c60333`；plan `dd2bda6e80e708f90dee1a46ee43e741f20919eb2edef21397abe8db6ea7f88c`。私有UTF-8/CRLF输入原件保持，本文按仓库LF排版。

Root directly authorized this source scope. Baseline: 3da616849839b7f7756d0ab248a58ed5110f1239. Implementer: concern_reference_diagnostic_implementer; independent reviewer assigned by Root; unique merger: planning_budget_merger.

## Evidence and scope

R18 review-floor-reuse18/diagnosis.md and check.mjs establish that the original complete stop proposal has 9 findings, 3 unresolved concerns, and correct top-level inputVersions. Rows 0 and 1 use captured_output with nonempty evidenceIds/evidenceRefs. Row 2 uses fixed_input with the same invalid channels and a current-capture reference at inputVersions[2]. Existing parser rejection and 4096 output-floor admission were correct. Generic correction was dispatched; duplicate already-complete reads then grew context beyond available budget. This change only improves the existing single correction feedback.

## Required behavior

- Keep acceptance/rejection truth and original first-error messages. No model reply rewriting, verdict changes, relaxed references, host proof, identity, top-level input-version or evidence checks.
- For known non-host reference validation and missing-current-capture errors, aggregate applicable errors across valid rows and fields from shared validation predicates. Use finite reason enums and numeric concern/ref paths; never echo model prose, arbitrary exception text, or model reference values.
- Typed trusted diagnostic is appended through requestReview to the existing specialized or generic correction. At most 4096 UTF-8 bytes; whole JSON items only, explicit omitted counts for any bounded portion. Any expected context comes only from fixed task/requirement/packet.
- Explain fixed_input and captured_output evidence channels and current capture rule. Reuse already-complete frozen reads in the same session; retain tools for missing evidence and independent judgment. Findings and unresolved concerns must remain substantive.
- Keep protocol text/schema versions, maxCorrections 0|1, same actor/context/session, record format, persist-before-dispatch, provider/timeout/admission behavior, budgets, limits, tools, and guards unchanged.
- No paid/provider calls or live-run mutation. Native R18 fake-fetch probe can follow the core candidate; no speculative generalization to host_evidence diagnostics.

## Files and verification

Source: src/runtime/repair/design-concerns.ts, src/runtime/repair/protocol.ts, one narrow diagnostic helper if needed to avoid import cycles. Tests: tests/roles/design-concern-reference-correction.test.ts. All existing target files are strict UTF-8 without BOM, LF; preserve encodings, Chinese text and local endings.

Use actual parseDesignConcernReview/parseReview and requestReview in TDD: R18-shaped three rows produce all 7 errors, original remains rejected, corrected synthetic retains changes_requested/9 findings/3 unresolved. Cover missing current capture, duplicate refs, malformed shape/identity/host gate, bounded large diagnostics, unknown exceptions, 0/1 correction and durable record behavior. Run targeted new tests, relevant existing parser/correction tests once, source typecheck/build and strict new-test typecheck. Reuse unaffected passing evidence. Commit source/tests only; no main integration.