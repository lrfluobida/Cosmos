# COS176: ordinary design author reasoning

Scope: SOURCE configuration and transport evidence. Task: [COS176 / #177](https://github.com/lrfluobida/Cosmos/issues/177). This change does not establish real-model semantic success or game acceptance.

## Observed failure

R29 (`.cosmos/public-validation/room-20261104-reuse-29/run`) completed initial and revision design reviews with `changes_requested`. Its design authors used `deepseek-flash` with thinking `off`; the independent reviewer used `low`.

The revision author read the complete requirements, all eight review findings and the old plan. In `sessions/750194ce-0b7b-4e33-abd6-32bc01a0aa73/author/2026-11-04T16-13-31-343Z_01a1a756-454f-77fe-81b3-85f81c6b4a3e.jsonl`, line 24 proposed a full replacement; line 25 rejected it and explicitly preserved the current draft. The first compaction retained that complete call/result batch. Line 29 appended p1-p15 to the old plan instead. Line 36 read the complete actual file, but the next summary incorrectly described the rejected replacement as saved. That compaction retained the real-file read. The captured v2 retained all 132 original main steps and all 47 reopen steps, adding only the 15 contradictory main steps. Independent review correctly rejected it.

Existing full save, anchored insertion and raw multi-edit can express the required changes. The failure does not justify another editor, guard, validator, prompt layer, retry or compaction mechanism. COS175 preserved the relevant facts and tool results. Disabled reasoning is a concrete configuration to change in accordance with the user's quality-before-cost preference; high reasoning is not a guarantee of success.

## Change and preserved limits

`src/runtime/entrypoint-host.ts` changes only the existing ordinary design author override from `off` to `high`. The factory's author-only selection and all other role/profile selections remain unchanged. Planning, independent review, art and coding retain their original thinking levels; fixed validation, legacy and preparation compatibility remain covered.

The pinned Pi 0.99.2 SDK's native `deepseek-flash` model supports high. Native compaction inherits the author's thinking level, so no separate summary setting is added. Model, task permissions, complete inputs, 64 design requests, 32768 author cap, 8192 author floor, 8192 summary ceiling, 120000 ms request timeout, deadline, independent-review reserve and accounting remain unchanged. Existing affordability checks can reduce the selected cap. High reasoning consumes the same total output allowance and may leave less answer space; existing truncation and budget failure behavior remains authoritative.

The native wire uses `max_tokens` for the selected output cap. SDK `completion_tokens` already includes `reasoning_tokens`; accounting charges total output once. No separate reasoning charge or increased output budget is introduced.

## Verification

On baseline `319e2a472b3c3b05d5d233e5bef0f2e58d493c5c`, the changed native-wire test failed with `thinking.type=disabled` instead of `enabled`; the new revision test failed with `off !== high`. After the one-line production change:

- `node --experimental-strip-types --test tests/runtime/ordinary-author-thinking.test.ts tests/runtime/ordinary-design-reasoning.test.ts tests/runtime/author-thinking-compatibility.test.ts tests/roles/author-thinking.test.ts`: 15/15 passed, 0 skipped, TAP 50929.061 ms.
- `npm run typecheck` and `npm run build`: exit 0.
- The existing real SDK fake-fetch test checks all seven role requests: ordinary design sends `thinking:{type:"enabled"}` and `reasoning_effort:"high"`; the other six requests retain `low`, original caps and admission.
- The new bounded fixture uses the real ordinary host, Pi SDK, native tool calls, native compaction, reserve/admit/settle and two independent review contexts. Synthetic provider replies exercise initial author, rejection and exactly one revision. Both authors and all four summary requests send high. All 14 requests settle; each synthetic usage reports 30 input and 1000 completion tokens, including 600 reasoning tokens, costing exactly 8060 micro-CNY rather than a double charge. Total synthetic cost is 112840 micro-CNY. The original author cap is 32768, summaries are 8192, and revision caps reduce under the unchanged budget selector.
- Both independent reviews remain `changes_requested`, with no art/coding dispatch or browser execution. A structural self-check cannot imply independent approval. Existing tests also retain failed-run redispatch closure and checkpoint/capture gates.

The new fixture uses a 4480000 micro-CNY / 1800000 ms TEMP run. Its replies, usage and context-pressure text are synthetic; it proves configuration, transport and accounting behavior only. Existing COS175 rejected-write preservation and native-summary failure evidence remain applicable because those implementations are unchanged. No paid request, real-run edit or ledger mutation is part of this SOURCE change.

Any subsequent real trial is separate: keep the confirmed requirements and review intact, use a new run within the existing authorized financial limit, and record its actual outcome. R29 remains closed. High reasoning's actual effect on semantic revision quality remains unverified.
