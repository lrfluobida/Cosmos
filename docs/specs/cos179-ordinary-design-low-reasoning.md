# COS179: ordinary design author low reasoning effort

Scope: SOURCE configuration and transport evidence, based on `18e2d04d921dc6efe56759c851b8cbfc426530b5`. This change does not establish real-model design quality or game acceptance.

## Observed failure and available comparison

R31 (`.cosmos/public-validation/room-20261105-reuse-31/run`) used high reasoning for its ordinary design author. Receipt `sessions/0f53b9c1-e794-4efb-a376-455af30e4a09/author/billing-a40f1465-b3b2-4a28-8e2c-1c54a4bfc318.json` records `stopReason: length`, 165014.926 ms, 32768 total output tokens and 32679 reasoning tokens. The 600000 ms request cap allowed this response beyond the former 120000 ms cap. The response exhausted the selected output allowance; partial tool calls were not executed. The seven requests settled for 346396 micro-CNY with no unknown charge. No design output or independent review was produced.

R29's initial and revision design authors used off and received `changes_requested` for actual semantic defects. This observation alone does not establish that off caused those defects. Its low reviewers produced substantive findings about partial-save state and the first sound-toggle click, among others. The initial review's final request (`billing-5b4c9ef5-30c8-44f9-83fe-b29f48322974.json`) used 7047 output tokens including 2846 reasoning tokens. The revision review's semantic verdict request (`billing-acec0741-b44b-4584-8b92-6de34e6482b6.json`) used 2858 output tokens including 1080 reasoning tokens, followed by a format correction. Both review sessions' ten requests settled under the existing 16384 output cap. These are successful review executions that rejected designs, not evidence of successful design authorship.

The pinned Pi 0.99.2 `deepseek-flash` catalogs map `thinkingLevelMap.low` to `low`, not `high`. The native DeepSeek transport sends `thinking: {type: "enabled"}` and `reasoning_effort: "low"`. Low is an effort setting, not an independent reasoning-token ceiling or a guarantee that sufficient answer space remains. R31's truncation and R29's useful low reviews support this bounded configuration trial without establishing a causal quality comparison.

## Minimal change and unchanged boundaries

Only the ordinary design author override in `src/runtime/entrypoint-host.ts` changes from high to low. The initial author, unique revision and native summaries share that session setting; no separate summary configuration is added. Planning, independent review, art, coding, fixed validation, legacy and preparation retain their existing selections.

The model, 600000 ms design-author request cap, original deadline and cleanup clipping, zero retries, 64 design requests, 32768 author ceiling, 8192 author floor, 8192 summary ceiling, independent-review reserve, task permissions and accounting remain unchanged. Existing affordability checks can reduce output caps. No additional prompt, editor, validator, SDK dependency, token budget or retry mechanism is introduced.

SDK `completion_tokens` already includes `reasoning_tokens`; usage and billing count total output once. R31's cited request therefore costs `ceil(302 * 2 + 15616 * 0.04 + 32768 * 8) = 263373` micro-CNY, without adding the reasoning count again. Low requests retain that accounting contract.

## SOURCE verification

After linking the existing fixed dependencies into the isolated worktree, the two changed tests failed on the unchanged production baseline with `high !== low`. An earlier setup attempt stopped on the missing template Phaser dependency and is not counted as a configuration regression result.

- `node --experimental-strip-types --test tests/runtime/ordinary-author-thinking.test.ts tests/runtime/ordinary-design-reasoning.test.ts tests/runtime/author-thinking-compatibility.test.ts tests/roles/author-thinking.test.ts`: 15/15 passed, 0 skipped, TAP 58907.6636 ms.
- `npm run typecheck` and `npm run build`: exit 0.

The existing native transport tests cover seven ordinary role requests and the initial/revision compaction path. The latter retains its 4480000 micro-CNY / 1800000 ms TEMP fixture, synthetic provider replies, native tool calls, four compactions, 14 requests and independent review contexts. Every author and summary wire must retain enabled thinking with actual effort low, the original timeout and selected cap. Synthetic usage of 30 input and 1000 output tokens, including 600 reasoning tokens, must settle at 8060 micro-CNY per request and 112840 total. Both independent reviews still request changes; no art/coding or browser work follows in that fixture. These checks prove configuration, transport and accounting behavior only.

No paid provider request, existing run edit or real ledger mutation belongs to this SOURCE change. R30's pending financial exposure remains separate, and R31 is not resumed.

## Separate real validation boundary

After approved source and an actual shared-balance check, a fresh original room12v2 run may use at most 3650000 micro-CNY / 30 minutes within the existing phase45 authorization. At the planning snapshot, `40858057 + 480004 + 3650000 = 44988061`, leaving 11939 micro-CNY under phase45. This is a conditional allocation bound, not additional phase approval, a budget increase or authority to start a call here. Requirements remain unchanged; the lower run cap means any subsequent observation is not a strict A/B quality comparison. Real design and game acceptance remain unproven.
