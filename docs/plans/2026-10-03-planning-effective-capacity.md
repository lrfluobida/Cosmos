# Planner effective capacity implementation plan

**Goal:** Allow a valid fresh validation plan after allocation closure while retaining the shared budget guard.

**Architecture:** Reuse the reviewed `budgetCapacity` summary for the planner's existing allocation base. Validation role grants are already allocated and contribute zero additional capacity; ordinary version 1 policies still add their selected grant amounts. All authority, freshness, dependency, ownership and contract checks remain in place.

**Files:** `src/roles/planner.ts`, `tests/roles/planning-capacity.test.ts`, an optional acceptance-list parameter in `tests/runtime/validation-allocations.fixture.ts`, and an exact over-budget assertion in `tests/roles/planning-slots.test.ts`.

- [x] Add a temporary synthetic ledger 3 regression with fifteen closed historical grants, a fresh five-grant case, three fake model tasks and ten acceptance items. Observe the existing exact budget-guard failure.
- [x] Replace only the gross allocation base with `budgetCapacity(snapshot.ledger).allocatedMicroCny`.
- [x] Verify bound contracts and plan output, unchanged snapshot bytes/history/fees/closures, closed historical task-ID rejection, and ordinary version 1 additive over-budget rejection.
- [x] Run the narrow planner tests and one explicit strict noEmit check; verify UTF-8/LF and preserved Chinese text before committing for independent review.

The fixture has gross allocations 168,596,040, released capacity 62,073,374 and effective allocations 106,522,666 against the unchanged 150,000,000 limit. Its SDK sessions are fake and make no HTTP requests. It does not reopen case four or establish generated-game acceptance. Formal continuation authority remains outside the legacy planner entrypoint.

**Evidence:** On base `b0cf64f`, the new test failed with the exact `Plan exceeds unallocated shared budget.` error. After the two-line production diff, `node --experimental-strip-types --test tests/roles/planning-capacity.test.ts tests/roles/planning-slots.test.ts` passed 6/6 with no skipped tests. The ordinary version 1 negative uses 100 existing + two 500 grants against a 1,000 limit and requires that exact budget error. One explicit `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --rewriteRelativeImportExtensions --verbatimModuleSyntax --skipLibCheck --types node` check on the planner, both planner test files and the allocation fixture exited 0. Independent review and main integration remain pending.
