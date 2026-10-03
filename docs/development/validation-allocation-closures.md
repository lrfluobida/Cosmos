# Validation allocation closures

COS-24 adds an explicit validation-only ledger contract `3.0.0`. It retains original allocation amounts and reconciled request records and appends exact unused allocation closures. It has no `authorizations` field. Original v1 and formal generation v2 retain their existing contracts.

`prepareValidationAllocationClosure` and `applyValidationAllocationClosure` are exported from `src/runtime/validation-allocations.ts`. They operate on the existing authoritative snapshot, never create an executor, and never open a paid execution window.

Preparation takes the shared `root`, reviewed `repositoryRoot`, trusted read-only `identityReader` and explicit `caseIds`. The current case and every selected case must already be stopped, and all shared charges must be reconciled. Each selected case closes all five of its declared grants. Unknown legacy ownership is insufficient to close a grant. The quote checks current reviewed source identity and frozen input files, original case operator receipts, and the actual case roots derived as `repositoryRoot/.cosmos/e2e/<caseId>`. A controller lock or registry commit lock at the ledger or any selected case root refuses closure; junctions and missing case roots also refuse it. Preparation reads files without acquiring a controller lock or writing expiration state.

The operator decision has an independent kind `operator_validation_allocation_closure`, with decision ID, actor, UTC decision time, versioned source and source references. Its source is an exact JSON object:

```json
{
  "formatVersion": "operator-validation-allocation-closure-decision-1",
  "kind": "operator_validation_allocation_closure",
  "decisionId": "the-real-coordinator-decision",
  "actorId": "the-real-coordinator",
  "decidedAt": "the-real-UTC-decision-time",
  "sourceRefs": ["the-versioned-standing-budget-source-reference"],
  "quote": "the-exact-prepared-quote-object"
}
```

The placeholders describe fields; an actual receipt contains ArtifactReference objects and the full quote object. This decision uses the existing validation authorization and does not create a game requirement confirmation or a run human decision.

Application takes that quote and decision plus the same context. It acquires the existing exclusive SnapshotStore owner and repeats source, input, accounting, snapshot-byte and case-root checks. It atomically commits the v1-to-v3 ledger upgrade, closures, `allocationClosureDecisions` and one event. A repeated exact decision returns its original receipt without rewriting the snapshot. Different source bytes, quote contents or stale snapshot bytes refuse mutation. Existing OwnerLock close/recovery rules continue to retain unresolved child spawn intents and require known child exit.

The temporary test fixture closes fifteen grants from three stopped cases. Their original 63,000,000 allocation minus actual 926,626 spending releases 62,073,374 capacity. The legacy allocation of 84,596,040 stays open; effective allocation becomes 85,522,666. Total actual spending stays 2,043,028 and the original 150,000,000 limit, first-phase 30,000,000 ceiling, historical clocks, case quotes and request counts remain fixed. This is fixture evidence; real ledger closure remains a coordinator operation after source review and integration.

Stage 2 connects this ledger version to the existing validation case claim. `RunController.prepareValidationAllocationClosure` and `RunController.applyValidationAllocationClosure` expose the same free operations. A fresh case still requires its own exact operator validation quote and receipt, preserves the reviewed declaration limits, and consumes the existing `budgetCapacity` result. Historical closed grant IDs cannot dispatch through the fresh case owner. Ordinary/formal controller entrypoints continue to reject validation profile snapshots.

Focused tests: `node --experimental-strip-types --test tests/budget/validation-ledger.test.ts tests/runtime/validation-allocations.test.ts`.
