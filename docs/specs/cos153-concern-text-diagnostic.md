# COS153 exact concernText correction diagnostic

状态：SOURCE范围完成。concern_text_diagnostic_reviewer已对 `87f06c485f6abc092a99f58198be62694b4a8b80` 独审APPROVED_SOURCE_SCOPED、无finding，Root批准唯一merger发布 `b5a4ba7b23040fbae04da1d1fc21a0923061c4e0`；[批准](https://github.com/lrfluobida/Cosmos/issues/154#issuecomment-6500026555)、[关闭](https://github.com/lrfluobida/Cosmos/issues/154#issuecomment-6500027792)及父[x]已GET。Root直接批准scope，无额外plan审批。main typecheck/build0、有限4/4、0skip；作者32/28/types/build/strict、独审15/38/reference-only byte equality/native A/B复用。

任务：[COS153 / #154](https://github.com/lrfluobida/Cosmos/issues/154)，id6101431263；原生父COS18/#19已勾（仅SOURCE，父仍open/partial），依赖[COS152 / #153](https://github.com/lrfluobida/Cosmos/issues/153)。runtime基线 `7337a4703892f2f8bcfcb939de3befbee7e95f60`。

[R20结案](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6500050918)：初始review的10个reference-only错误经原COS152诊断纠正为有效changes_requested，COS153新exact-text分支未触发，不称其live通过。自动revision真实启动，23reads/0writes/6summary，只读budget finalization成功；两文件从seed/v1到v2 capture逐字节相同，requireDesignProgress正确no_output_change阻断，无revision review/game。stored running仅保留历史标签，run已永久stop无执行权限。COS150 seeded提示与wholeJSON/scoped reader已生效，作者先13次计划分页，后一次整读34442B完整JSON；不推断接线或预算bug。

R20 planning4/70496µ、initial author41/542563µ、initial review5/166519µ、revision author28/422533µ，共78笔1202111µ、释放3797889µ。14:23:44.927Z→14:37:23.608Z的818681ms仅清理；14:40:35.761Z永久stop、14:40:41.262Z一次settle。独立PASS_CLOSED：child332 SHA `82761e3a4c1f18b0ed1098bbbd9c54639250d0106685b8a206ad2814cb9518f8`；shared3405 SHA `2cbf62396e6264040576a41fd8a94b2bc3e0b94a5000c3e9113709d30267f99c`，C34173502µ/H0。phase40/ref、room12v2、5M/30min保持；证据 `.cosmos/public-validation/room-20261029-reuse-20/{generation-closure.json,generation-execution.json}`，只读诊断 `.cosmos/planning/design-revision-reuse20/diagnosis.md`。旧run永久closed，无新paid准备。

Root批准输入SHA256：spec `09eba98df520f3e46c255ad3fadba1bf59a4da12d09931be9b212ede3cece7d0`；plan `560698c064b7646e6d65a00ff4bdbc96c476c367b4726d91490452b849ab9636`。

Root directly authorized this bounded scope; no additional design approval gate. Runtime base: 7337a4703892f2f8bcfcb939de3befbee7e95f60. Implementer: concern_text_diagnostic_implementer; independent reviewer: concern_text_diagnostic_reviewer; unique merger: planning_budget_merger.

R19 establishes a pre-existing missing Chinese character in the last known concern text. COS152 collected earlier reference errors, then stopped at the combined identity/text guard. The single correction fixed references but retained the typo. Original replies remain invalid and closed; only an in-memory exact copy control passes with changes_requested, 11 findings and 5 unresolved concerns.

Extend the existing parser loop and typed diagnostic only. A known unique concern ID, valid keys/status/basis/rationale and a string concernText permit a separate exact-text mismatch issue. Keep all other guards and original first-error messages; stop collection at unrelated invalid shape/identity/host proof. The same valid row may contribute existing reference issues. Never edit or normalize returned text, infer approval, change mandatory fields, or alter protocol/schema, 0|1 corrections, session, actor, durable records, budgets or runtime admission.

Keep the existing error class and requestReview consumer. Numeric response paths and fixed packet proposal field/index pointers are trusted. Optional expected text comes only from the original packet, JSON quoted and explicitly marked UNTRUSTED DATA for exact copy, never instructions. Preserve duplicate, empty and non-English strings exactly. All issue paths, expected texts and capture share one <=4096 UTF-8 byte supplement, using whole JSON items and explicit omitted counts/pointers. Do not echo received text, arbitrary exceptions or thinking. Keep reference-only diagnostics unchanged.

Modify only src/runtime/repair/design-concerns.ts, src/runtime/repair/design-concern-reference-diagnostic.ts and tests/roles/design-concern-reference-correction.test.ts. Existing targets are strict UTF-8 without BOM and LF. No ADR, protocol text, main, provider, paid validation or real-run write.
