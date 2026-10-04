# COS43 fixed transfer validation entry implementation plan

> The dedicated COS43 implementer follows the approved design and issue #44. An independent reviewer checks the actual commit; the batch merger alone integrates main.

**Goal:** Assemble one fixed internal operator validation case for the frozen COS16 requirements through the approved transfer host and original COS16 budget group.

**Architecture:** A source-owned declaration/input reader and exact-main identity wrapper feed a read-only historical source gate. The existing atomic grouped claim activates the case; a thin driver binds native bootstrap, planner, DAG, original linked coding repair and effective finish inside withPreparation. Source40/41/42 remain unchanged.

**Tech stack:** TypeScript, Node test runner, temporary synthetic repositories and existing controller/registry/journal. No providers or browsers in this task.

Base: `6450f43188a8a8cfb9b986defe7631675aab6c22`; approved Source41 `8e5c69746b26efd41e7e3f28180c72db695a140d`.

## Files

- Create fixed requirements and `validation-declaration.ts`, `validation-input.ts`, `validation-driver.ts`, `validation-run.ts` under `probes/transfer/`.
- Modify only `probes/e2e/validation-identity.ts` among existing production files, extracting its trusted input-reader seam while preserving the Case8 wrapper.
- Add focused tests/fixtures under `tests/transfer/`; append an internal-entry section to `probes/transfer/README.md`.

## Steps

- [x] RED then GREEN: fixed declaration3, six T16 IDs and original host stages; no map/solution/game/assets or human confirmation; strict fixed CLI and unchanged Case8 identity.
- [x] RED then GREEN: original eight consumed cases and six historical closure sources use their own declaration hashes; exact Source20..42 markers and both reviewed/merge ancestors reject before side effects.
- [x] RED then GREEN: atomic grouped claim retains historical records, original clock/fees and parent allocation; no upgrade-only step.
- [x] RED then GREEN: native bootstrap uses the new planning grant and owned worker; planner/DAG/journal/original coding repair/effective finish remain within withPreparation.
- [x] Run the new pure tests and affected default identity representative, one strict import closure, UTF-8/LF/Chinese and diff checks. Reuse unchanged Source40/41/42 tests and real QA.
- [x] Commit the exact implementation scope and report SHA, commands/evidence and actual execution gaps; independent source review remains pending.

## Execution boundary

The final real preflight must use clean final main after COS41 approval metadata is integrated. Root alone owns real ledger/credentials and paid execution. This implementation changes no real snapshot, case or audit. COS16/COS18 public human acceptance remains pending.

## Evidence

- Input missing-entry RED 1/1 failed as expected, then GREEN 1/1 (246.1555 ms total).
- Historical gate missing-entry RED 4/4 failed as expected; initial GREEN 4/4, 0 skip (20.0591746 s total).
- Native bootstrap/assembly missing-entry RED 2/2 failed as expected. The real DAG fixture caught an invalid extra evidence field and the need for the existing complete-DAG resume path. Corrected assembly GREEN 1/1, 0 skip (24.1160154 s total); the original failed coding task remains alongside its linked repair.
- Scope rejection outside preparation produced a focused RED, then GREEN 1/1 (3.0753881 s total), establishing cleanup before planner side effects.
- Final new pure command: `node --experimental-strip-types --test tests/transfer/validation-input.test.ts tests/transfer/validation-run.test.ts tests/transfer/validation-driver.test.ts` — 9/9, 0 failed/skip, 35.0375028 s, exit 0.
- Default Case8 identity representative: `node --experimental-strip-types --test --test-name-pattern 'clean actual main and frozen inputs yield the exact identity' tests/e2e/validation-identity.test.ts` — 1/1, 0 failed/skip, 2.0439713 s, exit 0.
- Final strict import closure: `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions probes/transfer/validation-run.ts tests/transfer/validation-input.test.ts tests/transfer/validation-run.test.ts tests/transfer/validation-driver.test.ts` — 9.1084642 s, exit 0.
- Twelve task files re-opened with fatal UTF-8 decoding: no BOM, LF, no replacement characters; Chinese requirements and README render correctly. README retains all 25,492 original bytes as an exact prefix. `git diff --check` passes.
- All tests use temporary synthetic repositories or injected worker transport. No provider, browser, real case or ledger is exercised. Source40/41/42 suites and real QA are reused.
