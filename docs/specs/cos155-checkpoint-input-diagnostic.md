# COS155 checkpoint input-order diagnostic

状态：Root直接批准最小checkpoint诊断scope，无额外独立plan审批；SOURCE pending。作者checkpoint_input_diagnostic_implementer，独立源码reviewer checkpoint_input_diagnostic_reviewer负责actualdiff、尚无SOURCE批准，native辅助author_budget_recovery_design，唯一merger planning_budget_merger。

任务：[COS155 / #156](https://github.com/lrfluobida/Cosmos/issues/156)，id6103761381；原生父COS18/#19未勾，正式依赖[COS145 / #146](https://github.com/lrfluobida/Cosmos/issues/146)。[COS151 / #152](https://github.com/lrfluobida/Cosmos/issues/152)仅为TEMP局部插入演示参考，非新增依赖。runtime基线 `0305f2135d236dde827b90f06a386510be90f3d3`。

Root批准输入SHA256：spec `b0516f10b2aa876e17769bd986405efba525866e670e4d807c9198e8f45b6433`；plan `db0cd09fb18104bc6177355301a74b48e0a1aceecff51f75a60b704e5c7c3bdb`；原批准快照保留。

Approved scope: Root's implementation dispatch, based on the read-only R21 diagnosis at `E:/develop/Cosmos/.cosmos/planning/initial-design-reuse21/diagnosis.md`. Baseline `0305f2135d236dde827b90f06a386510be90f3d3`; no new human or plan gate. Dedicated implementer branch `codex/checkpoint-input-diagnostic`; unique merger `planning_budget_merger`.

Only the existing checkpoint guard in `src/roles/requirements.ts` changes. It keeps the original first-failing-stage/field order and predicate: an observation must equal the checkpoint observation, expected must equal checkpoint.expected, and a preceding mouse-click or locator-click must exist. Both assert and wait-for retain the existing observation-based matching behavior.

When no matching observation/expected exists, retain the original error byte-for-byte. When matches exist but none follows normal click input, report the stage, checkpoint field, bounded matching step IDs and zero-based indexes, matching-step omissions, and the first normal click's location or absence. IDs are complete JSON strings treated as data; show at most four matches, at most 80 Unicode code points per ID, and explicit omitted-character counts. Explain that selector/expected matching and step order matter and renaming IDs does not fix input order. Keep existing selector and expected details.

Do not choose a game control, add steps, change schema, normalize input, relax click definitions, restrict full save, add retries, or change automatic-feedback grouping/limits/truncation. No budget, model, lifecycle, capture, review, cap or plan-writer changes. Private synthetic local-insertion evidence, if used, is not model repair or semantic/game acceptance.

Tests cover the actual R21 ordinary20 prefix, renamed IDs, no match, click only after matches, mouse-click/locator-click before matches, moves/waits not qualifying, mixed matches, both stages and fields, bounded valid long IDs, earlier rejection of Chinese/instruction-like/oversized IDs and malformed guards, and actual afterFileWrite propagation. Existing validatePlan accepts only safe ASCII step IDs of at most 120 characters; that earlier guard is preserved, not bypassed to reach diagnostic formatting. Verification is FREE SOURCE/TEMP only. No main integration, push, provider calls or real-run/ledger changes.
