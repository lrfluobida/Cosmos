# COS73 module helper scope plan

> Author cos67_implementer; independent reviewer cos65_implementer; BATCH15 sole merger cos66_implementer.

**Base:** `931a7191bad113640f6b881daf31ac0035996b39`; [COS73/#74](https://github.com/lrfluobida/Cosmos/issues/74). Implementation waits for independent PLAN_APPROVED.

**Guard:** In `src/runtime/modular-code.ts`, use pinned TypeScript's `ts.isExternalModule` on every parsed actual source file, including index and unimported helpers. Reject script scope with the exact relative path and guidance to use legal import/export or export {}. Preserve ModuleDeclaration, path/import/reference/suppression/ownership guards. Empty export establishes helper scope only; actual index namespace must still provide protected callable values. No source rewriting, compiler-option changes or stubs.

**Existing consumers:** Keep `coding-check-worker.ts` projectInputs checks for author compilation and final assembly; `entrypoint-host.ts` capture/verify/recoverCapture/approvedModule checks for current input reuse and pre-author dispatch. Add module-author scope guidance to existing host rules. Invalid current captures cannot be reused or dispatched; completed original reports retain their existing read-only path, refs, hashes and mtime. Do not revise passed history or infer causal owner from diagnostic paths.

**TDD:** Convert the recorded A/B Window counterexample into one product-host RED: B currently passes locally and changes A's final types. After the guard, B is rejected before local approval/integration, with its helper path and original A bytes/budget preserved. Localize only B helper in the matching control; actual owned local tsc/ABI and final tsc/Vite/assembly/package/clean Node pass, preserving A source. Provider/browser/review replies remain synthetic. Cover current captured-input rejection, legal helpers/type imports, existing explicit augmentation/import guards, empty index with export {}, and completed readonly.

**Files/verification:** Scoped validator/host rules; `tests/runtime/modular-interfaces.test.ts`, modular-host fixture and focused module-helper test; usage docs/this plan. Typecheck/build, UTF8LF/中文 readback, exact SHA independent review. Reuse COS71/72 evidence; no old A/B/82s/Edge matrix, new profile/policy/runner/ledger/grants or paid/private/reference/main activity. Budgets, unknown974882 and PERFORMANCE/230/221/7/two-policy partial remain unchanged; no full-game claim.
