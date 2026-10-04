# COS-36 transfer design binding

Goal: validate runtime design data against the frozen COS-16 rules, capture it immutably, and derive trusted mouse expectations. Approved base: 5d4d1d478aefce9fcde6254359edee906a551213.

Files: probes/transfer/design.ts (versioned data schema), oracle.ts (static rules and path coverage), binding.ts (registry freeze and candidate-bound plans), tests/transfer/design-binding.test.ts, and an appended interface section in probes/transfer/README.md.

- [x] RED: six grouped tests for valid traces, illegal maps/schema, missing/invalid scene paths, capture/UTF-8, normal-input plan coverage, and stale bindings.
- [x] GREEN: implement the three small modules; expected states come only from frozen rules and design data.
- [x] Verify the targeted test once green; coordinate one strict TypeScript check with root.
- [x] Append the API, canonical observation schema, source-stage limitations and remaining process/profile checkpoint to README; preserve its existing UTF-8/LF Chinese text.
- [ ] Re-open edits, check the diff, commit the exact SHA, and report evidence and gaps for an independent reviewer. Only the batch merger integrates main.

No game implementation, rendered assets, production host/default/pilot edits, paid calls or live run data. Synthetic maps are tests only. Source readiness requires independent review and merge; no transfer execution or T16-05/06 pass is claimed.

Evidence on 2026-10-04:

- Initial RED: 6/6 assertion failures for absent oracle API. Added plan capture and single-target visible checks each produced a focused failure before implementation. The preparation-before-candidate split produced two absent-API failures before implementation.
- Final targeted command: node --experimental-strip-types --experimental-test-isolation=none --test --test-reporter=spec tests/transfer/design-binding.test.ts. Six groups passed, 0 failed, 0 skipped; duration 1040.6669 ms. Tests use only synthetic unit data and temporary directories. v1/v2 plans are captured before staging, their steps/expected are exactly equal, both exact candidates bind, and wrong-plan rebinding is rejected.
- Sole compiler window released by root: node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck --types node probes/transfer/design.ts probes/transfer/oracle.ts probes/transfer/binding.ts tests/transfer/design-binding.test.ts. Exit 0, 6.790 seconds; includes the actual static import closure.
- Remaining: fresh independent review and merger approval; production COS-18 adapter and its same-run provenance; persistent-profile real process close/reopen with continuous screenshots/video/logs. T16-05/06 and all prepared segments remain non-executable. No source readiness marker is issued by this implementer.
