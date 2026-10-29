# COS152: bounded design concern reference correction

状态：SOURCE范围完成。concern_reference_diagnostic_reviewer已对 `80b2be5505aae51d296762f9271961d909198523` 独审APPROVED_SOURCE_SCOPED、无finding，Root批准唯一merger发布 `7337a4703892f2f8bcfcb939de3befbee7e95f60`；[批准](https://github.com/lrfluobida/Cosmos/issues/153#issuecomment-6498673206)、[关闭](https://github.com/lrfluobida/Cosmos/issues/153#issuecomment-6498674057)及父[x]已GET。Root直接批准scope，无额外plan审批。main typecheck/build0、有限4/4、0skip；作者final17/build/strict、独审17/8080/native A/B复用；49 affected/typecheck在末次纯indent和等价循环cleanup前，按无实质变化范围复用。

任务：[COS152 / #153](https://github.com/lrfluobida/Cosmos/issues/153)，id6100549858；原生父COS18/#19已勾（仅SOURCE，父仍open/partial），依赖[COS148 / #149](https://github.com/lrfluobida/Cosmos/issues/149)。runtime基线 `3da616849839b7f7756d0ab248a58ed5110f1239`。

[R19结案](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6498687459)：初稿host/capture通过，8个引用字段诊断实际送达，模型清空全部5行evidenceIds/evidenceRefs并直接final、无重复reads，引用错误已消除。两份真实提案row4 concernText均遗漏原文“本地音频”的“地”，strict仍拒绝；不是新纠正回归或编码损坏。第二reply正常stop、cap4591/output3640，非预算或length。实际findings从10变11且零条完整字符串相同，5项仍unresolved，未认证语义或等价；仅内存副本单字段补字可strict接受changes_requested/11findings/5unresolved，不替换实际verdict，无revision/game。

R19 planning2/41841µ、author33/541883µ、review5/221674µ，共40笔805398µ、释放4194602µ。13:38:31.947Z→13:47:44.011Z的552064ms仅清理；13:49:48.988Z永久stop、13:49:54.056Z一次settle。独立PASS_CLOSED：child175 SHA `65823ba55761043c674024959404591e24ba281d1e23711273a8561c960ebf2c`；shared3403 SHA `7c7eb3763f01b2d0be4b6c26ec0f50c3ba2b18a26bb9054f8f16fde21343e565`，C32971391µ/H0。phase40/ref、room12v2、5M/30min保持；证据 `.cosmos/public-validation/room-20261029-reuse-19/{generation-closure.json,generation-execution.json}`，只读诊断 `.cosmos/planning/review-reference-reuse19/diagnosis.md`。旧run永久closed，无新paid准备。

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