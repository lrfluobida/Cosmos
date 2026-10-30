# COS159 host evidence reference correction diagnostic

状态：Root已读immutable批准稿并直接授权scope，无额外独立plan审批；SOURCE pending。作者host_evidence_diagnostic_implementer，独立reviewer host_evidence_diagnostic_reviewer正在核固定候选 `dbb7aa2663cf0ab9ecd8a1a92c732a62858b65ca`，尚未SOURCE批准；native helper review_reply_diagnosis的A/B尚未记作通过，唯一merger planning_budget_merger。原计划checkbox为作者执行记录，不代表独立源码批准。

任务：[COS159 / #160](https://github.com/lrfluobida/Cosmos/issues/160)，id6113292513；原生父COS18/#19未勾，依赖[COS152 / #153](https://github.com/lrfluobida/Cosmos/issues/153)及[COS153 / #154](https://github.com/lrfluobida/Cosmos/issues/154)既有typed诊断通道。runtime基线 `edd0375869523817b47f95c09b7486163fdea21c`。

Root批准输入SHA256：spec `be0b58d1fea63b23486567ca9b60bcdce208eea76132300207dcebe3d659db73`；plan `dfebe6fb8e954052203c8c9991b30c91dbd4db1c9bb9918547fb9a764f86e0b3`；immutable originals及登记副本保留。R24已永久closed，phase45/C36738979µ/H0不变，当前无新paid准备。

Root directly approved this bounded source scope; no additional plan approval is required. Runtime base: edd0375869523817b47f95c09b7486163fdea21c. Implementer: host_evidence_diagnostic_implementer. Independent source reviewer: host_evidence_diagnostic_reviewer. Unique merger: planning_budget_merger.

R24 has two complete stopped JSON review proposals, each changes_requested with eight findings and seven concern rows. Host rows 0 and 5 initially have partial inputVersions and path-string evidenceRefs. The existing correction fixes only inputVersions. Replacing only the second proposal's two evidenceRefs arrays with selected task evidence source objects in memory passes the full parser, retaining all eight findings and three unresolved concerns. Both actual replies and the closed run remain unchanged and invalid.

Extend only the existing parser loop and typed diagnostic helper. For valid host rows whose evidence IDs already select known current passing evidence declared at top level and cover the row's acceptance IDs, collect exact inputVersions and evidenceRefs mismatch fields. Expected inputVersions come from task.inputs followed by task.artifacts; expected evidenceRefs come from those exact selected task.evidence source objects in row evidence-ID order. Never coerce paths, bind missing evidence, repair a reply, edit findings or infer approval. Unknown, failed, skipped, stale, uncovered or top-undeclared host proof keeps the original generic guard. Existing row identity/shape, capture/timestamp, top-level, acceptance and unresolved-approval guards retain their acceptance/rejection truth and first-error priority.

The existing DesignConcernReferenceError channel carries finite reasons and numeric response paths. Its single combined supplement, including existing non-host/text diagnostics, stays at most 4096 UTF-8 bytes, using complete JSON items and explicit omitted counts plus fixed source pointers. Trusted expected references show complete object shape and values, never model-supplied references or arbitrary exceptions. Original concernText stays quoted UNTRUSTED DATA. Keep no-host diagnostic bytes unchanged. State that structural proof does not establish semantic completeness or gameplay, preserve independent judgment and genuine findings, and reuse complete frozen reads in the same session.

Only src/runtime/repair/design-concerns.ts, src/runtime/repair/design-concern-reference-diagnostic.ts and focused tests change. Preserve protocol.ts, protocol strings/schema, same actor/context/session, correction limit 0|1, durable persist-before-dispatch record, tools, grants, budgets, caps and provider/admission behavior. No real provider/controller/run/ledger mutations, no main merge or push, no ADR or framework.

Targets were decoded with fatal UTF-8, no BOM, LF. Preserve encoding and existing Chinese text with minimal patches and reopen after edits.
