# Validation allocation closure implementation plan

**Goal:** Release only unused capacity from stopped, reconciled validation case grants without increasing the shared budget or rewriting history.

**Architecture:** A validation-only ledger contract 3.0.0 retains the original grants and adds exact allocation closures. A read-only quote binds the committed snapshot, current reviewed platform identity, frozen inputs, fixed case roots and stopped request history. An explicit operator receipt is applied once under the existing exclusive snapshot owner.

**Tech stack:** TypeScript, Node test runner, existing SnapshotStore and filesystem confinement helpers.

- [x] Stage 1 implementation: Add failing ledger and temporary filesystem tests; add the explicit v3 schema, snapshot closure decisions, read-only quote and atomic apply API. Keep old v1 and formal v2 contracts unchanged. Independent review remains pending.
- [x] Stage 2 implementation: Permit fresh validation claims against v3 effective allocation capacity. Verify permanent closed grant rejection and a fresh bounded case claim through the existing controller. Independent review remains pending.

The fixture baseline is allocated 147,596,040, settled 2,043,028 and no outstanding exposure. Closing only the fifteen grants of the three stopped cases releases 62,073,374; effective allocation becomes 85,522,666. The legacy 84,596,040 capacity remains open. The shared 150,000,000 limit, first-phase 30,000,000 ceiling, original clock, stopped cases and all actual fees remain fixed.

Verification uses synthetic temporary roots and no paid service. Real closure and the next case remain coordinator actions after source review and integration.
