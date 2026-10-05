# COS66 generic persistent save implementation plan

> Implementer: `codex/cos66-generic-persistent-save`; independent reviewer checks this plan before implementation and the actual diff afterward. Only the batch08 merger integrates approved commits.

**Goal:** Confirm a generic game's normal play, unlock, purchase and save flow, then verify the visible state after real browser process exit and same-profile/origin reopen, with complete media coverage across both documents.

**Architecture:** Keep `scenario.viewport/steps` and add optional `reopen: { steps, checkpoint: { expected, snapshot, savedSnapshot } }`. The two checkpoint observations are distinct visible text observations, asserted after normal input in both stages. Host assembly binds the actual requirement capture, design capture, candidate, run/task/spec, URL, plans and original deadline. A separate `persistent-acceptance/generic-1` binding reuses the existing persistent driver without inventing transfer SHA/map facts. Each document has a request bound to its own exact plan and contributes actual partial observations to the final roster check.

**Tech stack:** Existing TypeScript/Node 22, pi intake, immutable registry, persistent Playwright Edge transport, standalone launcher and normal-input runner. No dependencies or paid calls.

## Contract and files

- `src/roles/requirements.ts`: optional two-stage declarative draft, exact allowlists, 1..200 steps per stage, union acceptance coverage, visible normal-input checks and strict checkpoint matching. Reject URL/profile/PID/storage/scripts/authority fields. Existing single scenario/preparation behavior remains.
- `src/roles/interview.ts`, `src/cli/session.ts`, `src/runtime/entrypoint-host.ts`: explain/display both stages; retain exact draft revision and confirmation source. Design/coding rules read the same immutable draft; generic host chooses the persistent route only when reopen exists.
- `src/acceptance/persistent.ts`: separate narrow generic format bound to fixed requirement/design/candidate refs and union acceptance IDs, with exactly two segments. Keep transfer format/sourceVersion/scope/mapVersion/2..16 segments unchanged. Reuse current profile/PID/origin/exit/guard/stop/deadline logic.
- `src/acceptance/browser.ts`, `src/acceptance/runner.ts`: trusted generic request collection mode for series partial observations. Request still names actual candidate/manifest/plan hash and complete field roster; no plan/model collection switch. Existing single generic request still requires full per-document coverage.
- `src/runtime/entrypoint-media.ts`: authenticate distinct per-segment requests and raw samples before union/max aggregation. Validate complete fields, scalar types, actual identities, recorded time within each successful normal-input report, exact plan/candidate/manifest and both expected segments. Never synthesize actual values from expected ones.
- New focused runtime/acceptance tests and a small fixture under `tests/`: normal UI unlock/purchase/save/continue with original procedural media; new generic route invokes actual persistent transport using the same clean package origin. `docs/development/` quickstart explains the optional draft.

## Tasks

- [ ] Write draft/interview/CLI tests; watch rejection fail for the new bounded shape. Implement the minimal validator/prompt/display extension. Test altered revision/source, unsafe fields, incorrect checkpoint, missing stage input and union coverage.
- [ ] Write separate generic-series and per-plan media tests; watch new format/partial coverage fail. Add generic binding and trusted segment media requests. Keep legacy transfer/single tests focused on affected contracts.
- [ ] Write host tests showing immutable requirement/design/candidate refs, two exact plans, original authority/deadline, independent raw segment reports and media partial aggregation. Implement the host persistent route with existing clean launcher and owned work. Validate current capture/manifest/confirmation bytes before each launch and publication.
- [ ] Run one real generic fixture with two documents and different media observations. First stage normally unlocks, buys and saves; second process clicks continue and checks the exact visible saved state. Confirm new PID, same private profile/origin, full owned exit and all roster coverage. Retain actual sample values and raw evidence. Exercise wrong save/sample/request/manifest/candidate/plan and only-first-stage failures using focused transport fixtures; reuse COS37 lifecycle rejection evidence for unchanged machinery and add generic representative stop/deadline tests.
- [ ] Run focused Node tests, `npm run typecheck`, `npm run build`, UTF-8/Chinese readback and `git diff --check`. Commit exact candidate, submit actual diff to independent reviewer, repair actionable findings in this branch, rerun only affected checks, and report approved exact SHA/raw output and gaps.

## Validation and boundaries

Commands use `node --experimental-strip-types --test` on the new draft/media/generic persistent/host/CLI tests plus affected existing requirements/interview/media/persistent/continuation tests. The new real browser test runs once under a short original absolute deadline; it does not repeat Source64's 4544-field maximum, Source65's clean production chain or the old Edge matrix. Node/typecheck/build results and real browser/process facts are separate from injected provider/build/game data. Fixtures establish harness source behavior only, not native model generation or human acceptance.

Read `CONTEXT.md`, COS14/COS15/COS18 in `docs/specs/cosmos-issues.md`, `docs/specs/cosmos-spec.md` and public [COS66 issue 67](https://github.com/lrfluobida/Cosmos/issues/67). Tracking docs and GitHub mutations remain root-owned. Do not touch root `.cosmos`, private sessions, keys or reference installation. Existing C6 unknown 974882 blocks new paid work; budgets remain validation ¥150, formal ¥200/12h and target ¥100/6h. No manual target game, new lifecycle/ledger/runner framework, benchmark denominator or 95% claim.

Existing files were decoded with strict UTF-8 before editing; preserve their line endings and Chinese text with minimal edits. New files use UTF-8/LF. Reopen edited files afterward. Recursive cleanup only uses verified canonical owned TEMP targets through the existing ownership helper.

## Independent review repair

The reviewed `4d5a8e37` candidate classified reliable generic gameplay/media failures as insufficient evidence, preventing the existing one-task repair policy from acting. Reuse the existing persistent diagnostic consumer and its `diagnoseBrowser`, typed failure facts, raw reports and owned process checks. Generic expectations omit sourceVersion; transfer expectations still require their exact source SHA. Only authenticated visible mismatches or complete typed samples with actual missing media become code defects. Binding/lifecycle/raw/sample failures retain insufficient evidence and no passed checks. Failed aggregate/segment facts and proven passed checks remain bound to the exact original candidate, task attempt and inputs.

New `generic-persistent-repair.test.ts` first reproduced both incorrect classifications, then passed 5/5: two defects reach `assessRepair` and `createLinkedRepairTask` with v2, the same original deadline/ledger/inputs and the existing repair cap; missing exit, wrong request and missing raw evidence remain `collect_evidence`. A focused healthy host test with aggregate report materialization passed 1/1. Raw stdout is in Windows TEMP `cos66-repair-focused-tests.txt`, `cos66-repair-healthy.txt` and `cos66-repair-type-build.txt`. The previously reviewed NEyq9l failed and M5DAIA passing browser facts remain unchanged; this diagnosis-only delta does not rerun their browser work or the earlier 21-case matrix.
