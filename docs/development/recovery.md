# COS-12 recovery implementation plan

**Goal:** recover the original run after cancellation or process exit without repeating completed work, losing uncertain charges, or changing the original deadline.

**Architecture:** reuse the atomic run snapshot, fixed artifact versions and shared ledger. Recovery is a trusted host operation. Ambiguous ownership, billing or verification stays blocked with preserved evidence.

**Tools:** TypeScript, Node.js filesystem/process APIs and the existing offline test runner. No paid calls or live validation ledger access.

## Phase A: independent recovery boundaries

- [x] Add failing tests for real dead-owner locks, live children, lock replacement and concurrent recovery; implement owner records in `src/runtime/recovery/ownership.ts` and use them in `store.ts` and the artifact registry. A child must be recorded durably before the host lets it write. Live or unknown PIDs, including reused PIDs, block recovery.
- [x] Add receipt fault tests; publish synced UTF-8 billing receipts atomically in `src/roles/provider-budget.ts`. Reconcile only exact admitted requests with matching run, ledger, task, pricing and model identity. Missing or invalid receipts retain the original reservation.
- [x] Add cancellation tests; implement abort-and-drain for explicitly owned operations/children and cancellation checks before artifact publication. Stopping returns only after owned work has settled; the previous accepted version survives.
- [x] Run the focused recovery/runtime/role-budget/artifact tests, typecheck and build. Phase A and its close-retry repair were independently approved and merged.

## Phase B: after COS-11 integration

- [x] Preserve the COS-11 typed failure and linked repair path. Continue only unfinished stages, reuse passed tasks and exact fixed artifacts/evidence, preserve attempt/correction counts and terminal records.
- [x] Cover capture publication before task registration, snapshot crash boundaries, unknown provider results, original deadline expiry and repeated recovery with offline fault injection.
- [ ] Produce a recovery report and independent review. COS-12 remains incomplete until this phase passes.

## Deliberate limits

No automatic lock stealing by age, new ledger, renewed deadline, blind provider retry, generic checkpoint engine, or revival of the failed COS-10 pilot. A lost in-memory artifact verification capability is not reconstructed from JSON. A sealed candidate without a committed `current.json` remains pending; a committed accepted version is reused.

## Verification record

Phase A focused command:

```text
node --experimental-strip-types --test tests/runtime/recovery/*.test.ts tests/runtime/run.test.ts tests/roles/budget.test.ts tests/artifacts/registry.test.ts
```

50 tests passed: 16 recovery tests and 34 affected existing tests. The new tests first rejected missing ownership/receipt identity, absent recovery/drain APIs, cancellation publication and unsafe reclamation of an external callback. They now pass using actual temporary files, killed owner processes and a gated writer process. Receipt interruption is simulated between durable receipt publication and settlement; it is not a real provider call. Typecheck/build and independent review are recorded with the Phase A commit handoff.

## Phase A host API and limits

- `SnapshotStore.recover(root)` checks the exact owner record, serializes reclaimers and removes only that dead ownership record. `RunController.open({root})` then reads the same snapshot and handles unresolved admissions as before. Recovery does not create a run or edit its snapshot directly.
- A writing child starts with `await controller.prepareOwnedChild()` **before spawn**. The host spawns a child that waits behind a startup barrier, calls `await controller.registerOwnedChild(pid, ticket)`, then releases the barrier. Keep the operation open until the child and its descendants have exited. An unresolved ticket is a durable ambiguity and blocks reclamation. The API does not supervise arbitrary processes or retroactively establish ownership.
- `OwnedWork.run(action)` tracks explicitly owned operations. Give the same `OwnedWork` to `createArtifactRegistry({work, signal})` and wrap host operations that own writing children. `cancelAndDrain(controller, work, reason)` persists the stop, aborts work and waits for it to settle. A drain timeout throws and does not acknowledge successful stopping. Host callbacks must finish their own child cleanup before their promise settles; starting detached, untracked work violates this contract.
- Capture/stage/promotion check cancellation before publishing fixed versions or the accepted pointer. A rename already submitted to the OS may finish during cancellation; drain waits for that operation before acknowledging stop. Existing accepted bytes are preserved.
- `registry.recoverOwnership()` applies the same dead-owner check to its commit lock. A crash during an external build/acceptance callback leaves `untrackedWriters: true`, so automatic recovery is refused: the registry cannot establish that arbitrary callback children exited. Read-only fixed artifacts/current remain available.
- `reconcileRoleReceipt({controller, requestId, evidenceDirectory})` reads only the exact host-owned receipt and original admission. It returns `settled`, `cancelled`, `already_closed` or `pending`. Identity, admission timestamp, pinned pricing/model and usage must match. Missing, partial, legacy or conflicting receipts never release outstanding exposure. It creates no request and cannot change a closed charge.
- Receipt publication syncs a private file, atomically links its complete contents to a new final name, then removes the temporary name. Existing receipts cannot be overwritten. An abrupt exit leaving multiple links is conservatively pending; this implementation does not delete arbitrary orphan files to make a receipt acceptable.

These APIs assume trusted host-owned paths and callbacks, as the existing controller/registry do. They do not defend against a malicious process running as the same OS user, promise power-loss transactions, or restore in-memory artifact proof capabilities.

## Explicit previous-boot owner maintenance

`OwnerLock.preparePreviousBootRecovery` and `OwnerLock.recoverPreviousBoot` are trusted operator APIs for `.controller.lock` and `.commit.lock` only. Default recovery still refuses live PIDs, unresolved child intents and untracked callbacks. The maintenance entry never signals a PID, opens a controller or changes a snapshot/ledger.

This path requires Windows, canonical local fixed NTFS paths without reparse ancestors, and complete current boot events: Kernel-Boot 27/version 1/BootType 0 plus Kernel-General 12/version 0/BootMode 0 whose StartTime equals CIM LastBootUpTime. A fixed hidden PowerShell query reads these facts with a timeout. Missing/unknown events, resume, Fast Startup, nonlocal volumes and contradictory clocks remain blocked. Device identifiers are hashed in the returned observations.

Keep the operator evidence directory outside the target runtime root and outside every model write scope. Prepare reads existing files only. Its arguments are `{root, name, evidenceRoot, provenanceSource, maintenanceSource}`; `provenanceSource` is `{path, sha256}` and `maintenanceSource` is `{repository, commitSha}`. Extra boot, clock, verifier or test parameters are rejected.

The independent UTF-8 provenance JSON has this exact schema (`PreviousBootProvenance` in `ownership.ts`):

```ts
{
  formatVersion: 'previous-boot-provenance-1',
  caseId, windowId, originalRoot,
  generationSource: { repository, commitSha },
  ownerSha256, machineHash,
  writerScope: 'local-processes-ended-by-full-boot',
  explanation, actorId, reviewerId, reviewedAt,
  references: [
    { role: 'launch', path, sha256 },
    { role: 'claim', path, sha256 },
    { role: 'root-intent', path, sha256 },
    { role: 'independent-review', path, sha256 },
  ],
}
```

Each reference is a distinct original evidence file inside the operator directory. The independent reviewer must assess the actual historical launch/claim/source chain and establish that all writers were local processes ended by full boot, with no remote, persistent or automatically restarted work. The explanation records that judgment. A v1 lock has no historical host/boot ID: these JSON fields bind the operator's evidence and judgment; they do not independently authenticate its historical origin. Files copied or recreated before quoting need explicit original-source investigation, not an age-based inference.

The quote binds the whole v1 record, original bytes hash/size, filesystem volume/file ID and precise creation/modification/change times; current machine/volume/full boot; all provenance files; and the executing maintenance module's static import closure. Each actual module is compared byte-for-byte with its exact clean Git commit. Generation source separately requires its original exact commit on clean `main`; an ancestor is insufficient. The original and maintenance repositories must be separate. The quote selects unique non-overwriting archive, intent and outcome paths.

After independent review, write a new immutable UTF-8 decision file using exclusive creation. Its exact fields are `{formatVersion:'previous-boot-decision-1', kind:'operator_previous_boot_recovery', decisionId, actorId, decidedAt, provenanceSource, quote}`. Preserve the entire exact quote and pass `{path, sha256}` for this decision to `recoverPreviousBoot({root, name, evidenceRoot, quote, decisionSource})`. Decision time is actual UTC at or after prepare. A changed source, identity, timestamp, approval or full boot invalidates the quote.

Apply uses the existing `.recovery` exclusive guard. It syncs and reads back exact original bytes and intent before deleting anything, then rechecks authority, source, boot and the original file identity. It unlinks only the quoted old lock once and publishes the outcome. An existing guard is always busy/unresolved. Archive failure retains the lock. Any uncertain unlink or failed post-delete audit retains intent and guard; stop for investigation, with no automatic retry, owner reconstruction or accounting continuation. A new owner or replacement file cannot be removed with the old quote. Existing acquire semantics still require an operator maintenance freeze.

For the C16 procedure, keep original `main` frozen, import the reviewed maintenance module by its absolute candidate path, and recover registry then controller with separate quotes/decisions. Only after both outcomes and independent postchecks, exit maintenance and run the original APIs in a separate process: `openValidationCase({accountingOnly:true,...})` without a `now` override, let the original deadline expire naturally, close, then prepare and approve the exact allocation closure. This neither renews the run nor changes its original execution receipt, budget, attempt count or incomplete game result.

SOURCE tests use real TEMP files and controlled raw OS output; they do not prove an actual reboot recovery. They include a live reused child PID witnessed by its independent parent, a nonzero-signal rejection spy, untracked callback recovery, immutable archive/approval failure cases, and separate candidate/original repositories with original accounting in another process. Actual recovery remains separately authorized. See [the reviewed specification](../specs/previous-boot-owner-recovery.md) for the execution boundary.

## Phase B: task phase recovery

`executeTaskDag` accepts an optional `recovery` configuration. Without it, existing callers do not create any recovery receipts. A new host that needs recovery supplies:

```ts
recovery: {
  journalRoot: absoluteHostJournalDirectory,
  artifactRoot: absoluteFixedArtifactRoot,
  recoverCapture: async (task, proposal, signal) => inspectExactPublishedCapture(task),
}
```

`journalRoot` must be outside every author's write scope. `artifactRoot` resolves the declared fixed input, artifact and evidence references. Only those exact files or snapshots are signed with SHA-256 to detect changed content before reuse. The host must supply narrow fixed references; the workspace root is rejected. Private sessions and dependency installations are not recovery inputs and must not be passed as fixed snapshots.

The read-only `recoverCapture` adapter is required when reusing completed author work, including a passed task. It must check the exact registry manifest, original task/attempt provenance, dependencies, planned versions and required promotion authority. It returns `{artifacts, reviewWorkspace}` for that exact capture, or `null` when these facts cannot be established. It must not generate, capture, build or pay for another review. In particular, a sealed candidate without committed `current.json`, or another candidate whose required in-memory verification proof was lost, remains blocked. A task's independent approval does not prove that registry promotion completed.

After establishing that the previous owner and registered writers have exited, recover the controller/registry ownership as applicable and open the original `RunController`. Reconcile unknown receipts first. Call `resumeTaskDag` with the **original prepared task plan**, requirement, session root, recovery roots and correction policy. The result is `{tasks, reusedTaskIds, blocked}`. A blocked item retains its current task and data; it does not silently become a failed attempt or new work.

Include every required ancestor in the recovery selection, even when its durable state is already `passed`. Recovery checks selected ancestors before their descendants and grants dependency readiness only after their checks succeed in this invocation. A blocked ancestor blocks its descendants, including historically passed intermediate tasks. Omitting an ancestor or supplying its artifact reference directly does not establish readiness. Blocked descendants are not registered or dispatched and retain their previous records; their preserved `passed` state alone must not be used as a current scheduling decision.

The journal contains immutable origin, author, capture, verification and review receipts for each original task. Each phase receipt binds the original attempt ID. Origin compares the full confirmed requirement, author role/context, input and output versions, ownership, acceptance, budget, run/ledger identity, original timestamps and correction policy. Author handoff remains subject to the existing nonempty `remaining`/`uncertainty` gate; expected outputs, host evidence and independent review keep their original checks.

| Observed durable boundary | Recovery action |
| --- | --- |
| Registered task, no attempt | Execute its first attempt under the original contract and allocation |
| Author answer missing | Keep blocked; do not repeat paid generation |
| Author answer and capture intent exist, capture receipt missing | Read-only host inspects exact published capture; register only that result, otherwise block |
| Capture recorded, verification never started | Perform the missing host verification |
| Verification started, no complete receipt | Keep blocked because a completed report cannot be inferred safely |
| Complete passing host evidence, review never started | Check fixed content, then perform only the missing independent review |
| Review started, no valid durable verdict | Keep blocked; no replacement reviewer or renewed correction |
| Valid durable verdict, task commit incomplete | Revalidate original inputs/evidence and original reviewer/context, then finish that commit without a prompt |
| Passed task | Read-only fixed-content/manifest check and reuse; no author, capture, build or review call |
| Failed/cancelled/needs-changes/waiting task or COS-11 failure receipt | Preserve its outcome; subsequent work uses the existing constrained repair path |
| Original stop or unresolved request | Report blocked without phase dispatch; retain stop, fees and original deadline |

The COS-11 `review-correction.json` remains at the original attempt session directory. An existing or partial record cannot grant another corrective prompt. A replayed valid verdict must agree with both `review-started` and any correction record's original reviewer/context. Recovery creates no linked repair task itself, so it cannot renew logical repair/attempt allowances.

## Phase B fault report

The new DAG and snapshot suites passed 21 checks. Sixteen DAG fault cases use a separate Node process exiting at a named boundary; the other three DAG cases exercise terminal/default behavior directly. Two additional processes exit immediately before and after the snapshot commit call, proving that reopening selects one complete committed revision with the original identity and deadline. Existing orphan-temporary-file tests cover incomplete temporary snapshot bytes.

Assertions cover capture publication before task registration, reuse of completed host checks, replay of a legitimate verdict before/after attempt completion, repeated recovery, unchanged fees, unknown admitted-request reservations, fixed content/requirement/ownership/output/policy conflicts, manual stops and a simulated original deadline. Lost author responses, missing captures, uncommitted host results, missing review verdicts and consumed correction records remain explicitly blocked. The passed-task reuse test also proves that a host's refusal to establish registry authority blocks further progress without rewriting the passed task.

```text
node --experimental-strip-types --test tests/runtime/recovery/dag.test.ts tests/runtime/recovery/snapshot-crash.test.ts
node --experimental-strip-types --test tests/roles/*.test.ts
```

The existing 87 role/repair/budget checks also passed. Phase A's reviewed ownership, real gated-writer cancellation, receipt and artifact-promotion evidence is reused. The DAG providers are scripted and their ledger charges are synthetic; no provider network call, live validation ledger, old pilot continuation or reference game was used. These checks establish recovery behavior, not successful game generation. Independent review and merger integration remain the final COS-12 gate.

The dependency-review regression suite adds five passing cases: blocked parent with normal/reversed selection, an omitted historical parent, propagation through a passed intermediate task, and successful parent validation releasing a child listed first. Negative cases preserve the entire original snapshot with zero downstream dispatches or new attempts. Run it with `node --experimental-strip-types --test tests/runtime/recovery/dependencies.test.ts`.
