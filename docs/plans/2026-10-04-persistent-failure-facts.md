# Persistent failure facts implementation plan

> **For agentic workers:** Follow the approved COS-39 design and execute the test-first steps below. The dedicated implementer commits the work; an independent reviewer inspects the actual diff, and the batch merger alone integrates it.

**Goal:** Record the persistent host's actual failure boundary and conservatively diagnose exact current reports without changing the default runner or granting repair permissions.

**Architecture:** `src/acceptance/persistent.ts` records optional versioned facts at controlled phases, retaining original errors. `probes/transfer/persistent-diagnostics.ts` verifies the current series and durable raw evidence, then reuses `diagnoseBrowser` for each executed segment. A failed prefix remains failed; unexecuted checkpoints never become passing evidence.

**Tech stack:** TypeScript, Node test runner, synthetic temporary evidence directories. No new dependencies.

## Files and boundaries

- Modify `src/acceptance/persistent.ts` and `tests/acceptance/persistent.test.ts`.
- Create `probes/transfer/persistent-diagnostics.ts` and `tests/transfer/persistent-diagnostics.test.ts`.
- Do not change COS-38 host, binding, wrapper, acceptance consumer or README files. Reuse Source32 and existing browser evidence.
- All text remains UTF-8/LF. Real cases, ledgers, sessions, credentials, browser profiles and preview processes are outside this task.

## Task 1: Source facts

- [x] Add synthetic executor tests for exact failed segments, owned exit/report/evidence faults, typed guard sources, and publication cancellation of failed and passed outcomes.
- [x] Run `node --experimental-strip-types --test --test-name-pattern=COS39 tests/acceptance/persistent.test.ts`; observe failures caused by missing facts and failed-publication guard.
- [x] Add `failureFacts?: { formatVersion: 1; errors: { errorIndex; error; phase; kind; segmentId? }[] }` to persistent reports. Each entry corresponds exactly to its raw error.
- [x] Separate exact segment identity, owned exit, evidence and outcome boundaries before recording `segment_failed`. Guard cancellation, deadline, binding and profile sources are assigned by controlled operations, never error text.
- [x] Drain the final guard for both outcomes. Keep original deadline, signal, process ownership and successful checkpoint conditions.
- [x] Run the affected pure persistent file and confirm all tests pass.

## Task 2: Conservative probe diagnosis

- [x] Add test-first fixtures for reliable early mismatch/project exception; complete pass; unknown lifecycle/exit/evidence faults; legacy and malformed facts; changed plan/candidate/source/deadline; prefix and checkpoint contradictions; and consumer cancellation/binding drift.
- [x] Run `node --experimental-strip-types --test tests/transfer/persistent-diagnostics.test.ts`; verify assertions fail because the API is missing.
- [x] Implement `diagnosePersistentBrowser(task, report, expected, options): Promise<Diagnostics>`. Expected data carries the host-frozen series, original deadline, current source SHA and exact aggregate path; options carry the trusted evidence root, current binding guard and optional signal.
- [x] Before and after evidence reads, verify current binding and cancellation. Match aggregate/raw segment reports, exact prefix order, plan/candidate/scope/source/deadline, owned identity and nonempty evidence. Strictly validate fact version, keys, phase/kind combinations and raw error indices.
- [x] Only a coherent `segment_failed` with no environmental failure can retain Source32's `code_defect`. Legacy, unknown, malformed, drift, missing exit/evidence and late cancellation are `insufficient_evidence`. Passing steps are witnesses; the whole failed series remains failed.
- [x] Run the new pure diagnostic file and confirm all tests pass.

## Task 3: Verification and review handoff

- [x] Run the two affected pure files together once.
- [x] Run one focused strict TypeScript check over the changed source/tests and their imports, then `git diff --check`.
- [x] Re-open all changed UTF-8 files; verify line endings and Chinese text. Confirm the diff contains only these five paths.
- [x] Commit on `codex/cos39-persistent-failure-facts`; report exact SHA, RED/GREEN/strict evidence and remaining runtime consumer/media gaps to the independent reviewer.

## Future consumer contract

The caller must build `expected.series` from the current immutable requirement/design/map/plan/candidate refs, not from the report or model output. `verifyBinding` must recheck the current source, active window, registry bytes and original scope before and after diagnosis and immediately before consuming its result. The report path and original deadline must come from that same host-owned execution. This API reads evidence and returns diagnostics; it neither dispatches repair nor promotes a candidate. The existing repair policy, budget and absolute clock still govern any later action.

## Execution evidence

- Initial source RED: three new groups failed because facts and failed-outcome publication draining were absent. Initial probe RED: seven groups failed at the missing exported API assertion.
- Additional RED checks caught missing exit metadata being accepted by truthy lifecycle conditions, and malformed numeric timestamps reaching code-defect diagnosis. The source requires explicit positive exit facts; diagnosis requires report timestamps and failed-row errors with the declared types.
- Final pure command: `node --experimental-strip-types --test tests/acceptance/persistent.test.ts tests/transfer/persistent-diagnostics.test.ts` passed 17/17, zero failures/skips, in 5373.8296 ms.
- Focused strict command: `node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck --types node src/acceptance/persistent.ts probes/transfer/persistent-diagnostics.ts tests/acceptance/persistent.test.ts tests/transfer/persistent-diagnostics.test.ts` exited 0 in 7.489 seconds.
- Runtime/media consumers remain a later task. Publication IO rejection cannot establish a durable raw report and stays insufficient evidence. No game, paid capability run or real browser matrix is claimed by these synthetic tests.
