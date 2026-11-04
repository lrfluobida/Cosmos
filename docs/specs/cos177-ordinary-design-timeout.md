# COS177: ordinary design author request timeout

Scope: SOURCE configuration and synthetic transport evidence. This change does not establish real-model design quality or game acceptance.

## Observed boundary

R30 (`.cosmos/public-validation/room-20261105-reuse-30/run`) used frozen source `f791c334b4709610a9ab1c09179fdb310dce13b6`. Its third design-author request, `f96dcde3-8471-4382-bde4-749a4ee155de`, was admitted at `2026-11-04T17:04:11.754Z`. The saved receipt records a first provider stream event after 520.6354 ms, an elapsed time of 120019.2588 ms, `stopReason: aborted` and unknown usage. The native session records `Provider stream exceeded requestTimeoutMs`. The original deadline was `2026-11-04T17:33:22.410Z`, about 29 minutes after admission.

The ordinary design author had high reasoning but still selected the default 120000 ms request cap. Only coding authors selected 600000 ms. The local absolute body timer expired; neither a provider outage nor high reasoning as the cause of the long response is established. First response measures the first provider stream event, not a completed answer or tool call. No design write, capture or independent review occurred in this failed author attempt.

## Change and preserved limits

`src/roles/factory.ts` adds the optional trusted `designAuthorRequestTimeoutMs`, validated as a positive safe integer. It applies only to non-validation design authors; omitted callers, planning, reviewers and other roles retain their existing selection. The separate coding-author option and its validation behavior are unchanged.

`src/runtime/entrypoint-host.ts` selects 600000 ms in the existing ordinary/high design branch. Initial authors, the existing unique revision and their native summaries inherit the same session configuration. Legacy, preparation and fixed-validation profiles retain their existing settings. There is no separate summary timeout or new retry mechanism.

The unchanged Pi adapter checks current original authority before admission and immediately before dispatch, selecting `min(sourceCap, originalDeadlineAt - Date.now() - 5000)` for both SDK timeout and the absolute response-body timer. Stream progress never resets that timer. The original run deadline, 5000 ms cleanup margin, cancellation, zero retries, unknown-cost blocking, model and thinking levels, request counts, output caps, affordability checks and independent-review reserve remain authoritative. A longer request allowance does not enlarge a run, allocation or token budget.

R30's saved known charges of 72082 micro-CNY and unknown reservation of 407922 micro-CNY are historical evidence. This SOURCE change neither reconciles those fees nor releases funding, resumes R30 or authorizes another paid request.

## Verification

Against the frozen baseline, new role tests failed because the design author selected 120000 rather than 600000, invalid design timeouts were accepted, and a progressing design stream hit the old cap. The fake-clock test also failed exactly when advancing past 120000 ms. The real ordinary host's seven-role synthetic transport representative failed on the design timeout assertion after its missing worktree template dependency was supplied.

After the two-file production change:

- `node --experimental-strip-types --test tests/roles/request-timeouts.test.ts tests/roles/author-thinking.test.ts tests/runtime/author-thinking-compatibility.test.ts`: 14/14 passed, 0 skipped, TAP 8087.6518 ms. This covers the optional fallback, author-only selection, fixed validation, legacy/preparation profiles, completing progressing streams beyond the old cap, controller cancellation and unknown reservations. The fake-clock test advances past 120000 ms, supplies later events, then aborts exactly at 600000 ms with unknown usage and no retry. Node emits its expected experimental MockTimers notice.
- `node --experimental-strip-types --test --test-name-pattern='ordinary design alone|ordinary initial and unique revision' tests/runtime/ordinary-author-thinking.test.ts tests/runtime/ordinary-design-reasoning.test.ts`: 2/2 passed, 0 skipped, TAP 24490.5086 ms. The native SDK receives 600000 ms and zero retries for all 14 initial/revision requests, including four summaries. The original high reasoning, 32768 author ceiling, 8192 summary ceiling, affordability reductions, 64 requests and total-output charging remain checked. Synthetic settled cost remains 112840 micro-CNY; both independent reviews still reject their synthetic candidates.
- The unchanged adapter's pre-admission cleanup rejection, post-admission authority/time refresh, identical SDK/body clipping and unknown-cost behavior reuse the previously run baseline `request-window.test.mjs` plus original `request-timeouts.test.ts`: 8/8 passed, 0 skipped, TAP 4025.9574 ms. These are existing boundary checks, not additional design-quality evidence.
- `npm run typecheck`, `npm run build` and strict TypeScript checking of the four changed test files and their import closure exited 0. `git diff --check` passed. All seven changed files decode strictly as UTF-8 without BOM and retain LF; existing non-English lines were compared against the frozen base and re-opened unchanged.

All requests above use fake transport and temporary controllers. No real provider traffic, R30 artifact edit, real-ledger mutation or paid validation is part of this work.
