# COS42 original COS16 budget group implementation plan

> For agentic workers: execute the approved core budget scope task by task. The root assigns the independent reviewer and sole merger.

Goal: authenticate transfer case grants against the original COS-16 allocation without adding budget or changing historical cases.

Architecture: declaration3 and validation ledger4 opt in explicitly; snapshot3 remains. A delegation binds exact parent allocation and operator quote to five case grants. The parent remains the sole shared allocation bucket. The existing controller serial queue gates reservations, dispatch and child ownership; existing closure APIs recover unused group capacity.

Base: `340bc04d2ce6f186d4bdbd2bb0041b7fed057b56`. Task: COS42 / #43. Marker after independent review: `VALIDATION_COS16_GROUP_SOURCE_READY`.

- [x] Add pure temporary-ledger tests and observe expected RED for declaration3 and delegated capacity.
- [x] Extend the 14 approved source paths: contracts types/structure/budget/validation/updates; budget ledger; runtime validation-types/validation-budget/validation-validation/validation-window/run/run-validation/validation-allocations/validation-allocation-validation.
- [x] Authenticate parent index/reference/canonical row SHA, snapshot basis, original amount and exact operator receipts. Derive all membership from case grants; block direct parent dispatch after delegation.
- [x] Keep shared allocation `raw - closures - derivedNet`, group allocation `parent committed + derivedNet`, and group committed `all parent/member settled + reserved`. Unknown retains exposure and blocks new dispatch.
- [x] Add group closure quote v2 while preserving v1 quotes and historical audit arithmetic.
- [x] Verify focused tests, old default representatives and one explicit strict import closure. Re-open changed UTF-8 text and inspect diff. No browser, provider, real ledger, actual claim or paid run.
- [ ] Commit exact source and test evidence for fresh independent review. Fix actionable findings only in this branch.

Initial grants in micro-CNY: planning400000/design1200000/art2800000/coding2800000/repair2800000. Future reviewed declarations may lower those fixed grants; sum must fit group effective free capacity. Case cap5m/45min/80requests remains independent.

Commands: `node --experimental-strip-types --test tests/budget/validation-group.test.ts tests/runtime/validation-group.test.ts`; a single strict noEmit invocation over src and the new tests with NodeNext options. Legacy representative tests are selected only for affected ledger/declaration/closure behavior.

Paid entry is COS43 and is outside this change. Root supplied the live parent fact COS-16/10000000/committed0; fixtures are synthetic and prove no live upgrade or migration result.

Evidence on the implementer branch:

- Initial RED: ledger4 returned unknown-field/version errors and declaration3 was refused (6 expected failures). First-vector and reordered JSON role tests separately reproduced missing behavior before their fixes.
- Final focused command above: 12/12, 0 failed, 0 skipped, 2080.9092 ms, exit0.
- Affected legacy command: `node --experimental-strip-types --test tests/budget/validation-ledger.test.ts tests/e2e/validation-declaration.test.ts tests/budget/continuation-ledger.test.ts`: 15/15, 0 failed/skip, 597.3836 ms, exit0. The subsequent change only canonicalized grouped role order; legacy evidence is reused.
- Final strict closure: `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions src/cli/index.ts tests/budget/validation-group.test.ts tests/runtime/validation-group.test.ts`: 6.8899s, exit0.
- Existing source was strict UTF-8/noBOM/LF before patching. Diff/encoding verification preserves that format; fixture Chinese requirement text renders correctly.

Review boundaries: this prepares authenticated budget delegation and group closure only. It does not instantiate the future transfer entry, prove a live ledger upgrade, confirm human requirements, or change COS16/COS18 completion status. Root performs any future live operation after independent source review and accurate final-main preflight.
