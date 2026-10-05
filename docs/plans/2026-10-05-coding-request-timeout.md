# COS-59 Coding Request Timeout Implementation Plan

> **For agentic workers:** Use the dedicated implementer, independent reviewer and batch08 merger required by AGENTS.md. Execute this plan with superpowers:executing-plans and TDD. Only the merger integrates main.

**Goal:** Allow a coding author response to use a trusted 600000ms source cap while every request remains inside its current lawful window and preserves cleanup time.

**Architecture:** Add one coding author timeout option to the trusted role factory. The factory supplies a callback that reads the task's current execution or validation authority and verifies the original window binding. The pi adapter checks that callback before admission and again immediately before dispatch, then uses `min(source cap, deadlineAt - Date.now() - 5000)` for both its absolute body timer and SDK timeout. The timer is never reset by stream progress.

**Tech Stack:** TypeScript, Node.js 22.22.2, pinned pi SDK 0.99.2, node:test, synthetic provider streams and temporary controllers.

## Files and boundaries

- Modify `src/providers/pi.ts`: optional trusted per-request window callback, pre-admission cleanup rejection and dispatch-time clipping.
- Modify `src/roles/factory.ts`: coding author cap, current authority callback with fixed 5000ms cleanup margin.
- Modify `src/runtime/entrypoint-host.ts`: configure coding author cap to 600000ms; other roles retain 120000ms.
- Create `tests/roles/request-timeouts.test.ts`: role selection, progressing SSE, current authority and cancellation with temporary controllers.
- Create `tests/providers/request-window.test.mjs`: cleanup rejection, clipping, identical body/SDK timeout, and unknown usage boundaries. The same fixture can import the built adapter for one compiled representative.
- Modify `tests/runtime/entrypoint-host-validation.test.ts`: trusted host policy assertions for author, reviewer, planning and same-window repair.
- Reuse existing request-count, stalled SSE and budget cancellation evidence where unchanged. No ledger, billing, schema, budget, output cap, role permission or retry changes.
- All execution is source and temporary fixtures only. No real ledger, sessions, credentials, installed reference game, provider request or old C6 rerun.

## Steps

- [x] Write role-selection and progressing-stream tests; run them and observe missing coding cap failures.
- [x] Write pi window clipping and insufficient-cleanup tests; observe the missing callback behavior fail.
- [x] Implement the minimal coding factory cap and current window callback, then pi clipping and host configuration.
- [x] Run new tests and affected existing provider/role cancellation representatives; fix only actionable failures.
- [x] Build and run one compiled provider representative using the same synthetic boundary fixture.
- [x] Run strict TypeScript checks for production and targeted test import closure.
- [x] Verify diff, strict UTF-8/no BOM/LF and unchanged existing non-English lines; record evidence and commit own branch.
- [ ] Report exact SHA and evidence to the parent for independent review. Apply findings in this branch before review approval.

## Planned checks

```powershell
node --experimental-strip-types --test tests/roles/request-timeouts.test.ts
node --experimental-strip-types --test tests/providers/request-window.test.mjs
node --experimental-strip-types --test --test-name-pattern='request deadline|cancellation|network errors|rejected admission' tests/providers/pi.test.ts
node --experimental-strip-types --test --test-name-pattern='validation planning|operator browser host|synthetic pipeline' tests/runtime/entrypoint-host-validation.test.ts
node --experimental-strip-types --test tests/roles/output-limits.test.ts tests/roles/compaction.test.ts
npm run typecheck
npm run build
$env:COSMOS_TIMEOUT_COMPILED = '1'
node --experimental-strip-types --test --test-name-pattern='same clipped SDK and body timeout' tests/providers/request-window.test.mjs
Remove-Item Env:COSMOS_TIMEOUT_COMPILED
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions tests/roles/request-timeouts.test.ts tests/runtime/entrypoint-host-validation.test.ts
git diff --check
```

The role cap uses short test values instead of waiting ten minutes. Window authority is checked before reserve and refreshed after admission, so time consumed by durable admission does not extend dispatch. Missing usage retains the existing unknown reservation and blocks later requests and tools. This source change does not settle C6 or establish generated-game acceptance.

## Evidence

- RED role tests: 1 pass / 3 fail, 3330.5743ms. Coding used 120000 instead of 600000, invalid override was accepted, and the progressing SSE timed out at the old 40ms cap.
- RED window tests: 0 pass / 4 fail, 3958.3832ms. Cleanup rejection, admission-time refresh, body clipping and per-request refresh were absent.
- RED host representative: 0 pass / 1 fail, 7849.1228ms. The source and same-window repair coding configurations retained the old timeout.
- GREEN window tests: all four passed against source. Their body/SDK timeout was clipped to at most 90ms; absent provider usage stayed unknown, no tool output appeared, and no retry dispatched.
- GREEN role tests: 4/4, 3026.9359ms. The progressing SSE completed seven 15ms chunks beyond the old 40ms cap using a 1000ms scaled coding allowance. Controller stop cancelled the longer allowance and the real temporary ledger retained its 1000 micro-CNY unknown reservation.
- GREEN host representatives: 3/3, 9868.0888ms. Planning, design and reviewer retained 120000ms. Both coding source and distinct repair used 600000ms and read the same original current-case deadline with 5000ms cleanup.
- Existing provider admission/count/cancellation/stalled-body/network/unknown representatives: 6/6, 3740.052ms.
- Existing output caps/reservations and native compaction/shared billing: 11/11, 4042.6427ms.
- Production typecheck, strict targeted test import closure and build exited 0.
- Compiled provider body/SDK clipping, unknown usage, blocked tools and no retry representative: 1/1, 2710.1126ms.
- All seven changed files passed strict UTF-8 decoding, no BOM, LF and replacement-character checks. Existing non-English lines matched the approved base byte content; the new Chinese fixture string rendered correctly on readback. `git diff --check` passed.
- The first GREEN attempt exposed two fixture issues: controller stop throws its structured stop reason, and a 240ms scaled allowance was too short for SDK cold setup under parallel verification. The fixture now checks the actual stop reason and uses 1000ms; the generated SSE still finishes in about 105ms after transport starts. Production code was unchanged by these fixture corrections.

No actual provider traffic, paid validation, browser or reference-game execution occurred. Old C6 history and its unknown reservation are outside this source task and remain unreconciled. New policy validation will require a new approved case.
