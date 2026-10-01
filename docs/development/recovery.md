# COS-12 recovery implementation plan

**Goal:** recover the original run after cancellation or process exit without repeating completed work, losing uncertain charges, or changing the original deadline.

**Architecture:** reuse the atomic run snapshot, fixed artifact versions and shared ledger. Recovery is a trusted host operation. Ambiguous ownership, billing or verification stays blocked with preserved evidence.

**Tools:** TypeScript, Node.js filesystem/process APIs and the existing offline test runner. No paid calls or live validation ledger access.

## Phase A: independent recovery boundaries

- [x] Add failing tests for real dead-owner locks, live children, lock replacement and concurrent recovery; implement owner records in `src/runtime/recovery/ownership.ts` and use them in `store.ts` and the artifact registry. A child must be recorded durably before the host lets it write. Live or unknown PIDs, including reused PIDs, block recovery.
- [x] Add receipt fault tests; publish synced UTF-8 billing receipts atomically in `src/roles/provider-budget.ts`. Reconcile only exact admitted requests with matching run, ledger, task, pricing and model identity. Missing or invalid receipts retain the original reservation.
- [x] Add cancellation tests; implement abort-and-drain for explicitly owned operations/children and cancellation checks before artifact publication. Stopping returns only after owned work has settled; the previous accepted version survives.
- [ ] Run the focused recovery/runtime/role-budget/artifact tests, typecheck and build. Record commands, outcomes and limits below. Commit the reviewed Phase A independently.

## Phase B: after COS-11 integration

- [ ] Reuse COS-11 typed failure and linked repair APIs. Continue only unfinished stages, reuse passed tasks and exact fixed artifacts/evidence, preserve attempt/correction counts and terminal records.
- [ ] Cover capture publication before task registration, snapshot crash boundaries, unknown provider results, original deadline expiry and repeated recovery with offline fault injection.
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

These APIs assume trusted host-owned paths and callbacks, as the existing controller/registry do. They do not defend against a malicious process running as the same OS user, promise power-loss transactions, or restore in-memory artifact proof capabilities. Phase B orchestration is still pending.
