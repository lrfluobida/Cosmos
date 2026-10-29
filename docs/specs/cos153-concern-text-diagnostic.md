# COS153 exact concernText correction diagnostic

状态：Root直接批准最小known concernText诊断scope，无额外独立plan审批；SOURCE pending。作者concern_text_diagnostic_implementer，独立源码reviewer concern_text_diagnostic_reviewer负责actualdiff、尚无SOURCE批准，native辅助review_reply_diagnosis仅私有fixture，唯一merger planning_budget_merger。

任务：[COS153 / #154](https://github.com/lrfluobida/Cosmos/issues/154)，id6101431263；原生父COS18/#19未勾，依赖[COS152 / #153](https://github.com/lrfluobida/Cosmos/issues/153)。runtime基线 `7337a4703892f2f8bcfcb939de3befbee7e95f60`。

Root批准输入SHA256：spec `09eba98df520f3e46c255ad3fadba1bf59a4da12d09931be9b212ede3cece7d0`；plan `560698c064b7646e6d65a00ff4bdbc96c476c367b4726d91490452b849ab9636`。

Root directly authorized this bounded scope; no additional design approval gate. Runtime base: 7337a4703892f2f8bcfcb939de3befbee7e95f60. Implementer: concern_text_diagnostic_implementer; independent reviewer: concern_text_diagnostic_reviewer; unique merger: planning_budget_merger.

R19 establishes a pre-existing missing Chinese character in the last known concern text. COS152 collected earlier reference errors, then stopped at the combined identity/text guard. The single correction fixed references but retained the typo. Original replies remain invalid and closed; only an in-memory exact copy control passes with changes_requested, 11 findings and 5 unresolved concerns.

Extend the existing parser loop and typed diagnostic only. A known unique concern ID, valid keys/status/basis/rationale and a string concernText permit a separate exact-text mismatch issue. Keep all other guards and original first-error messages; stop collection at unrelated invalid shape/identity/host proof. The same valid row may contribute existing reference issues. Never edit or normalize returned text, infer approval, change mandatory fields, or alter protocol/schema, 0|1 corrections, session, actor, durable records, budgets or runtime admission.

Keep the existing error class and requestReview consumer. Numeric response paths and fixed packet proposal field/index pointers are trusted. Optional expected text comes only from the original packet, JSON quoted and explicitly marked UNTRUSTED DATA for exact copy, never instructions. Preserve duplicate, empty and non-English strings exactly. All issue paths, expected texts and capture share one <=4096 UTF-8 byte supplement, using whole JSON items and explicit omitted counts/pointers. Do not echo received text, arbitrary exceptions or thinking. Keep reference-only diagnostics unchanged.

Modify only src/runtime/repair/design-concerns.ts, src/runtime/repair/design-concern-reference-diagnostic.ts and tests/roles/design-concern-reference-correction.test.ts. Existing targets are strict UTF-8 without BOM and LF. No ADR, protocol text, main, provider, paid validation or real-run write.
