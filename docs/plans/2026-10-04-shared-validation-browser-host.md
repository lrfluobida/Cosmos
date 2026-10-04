# COS-35 shared validation browser host

Base: `5d4d1d478aefce9fcde6254359edee906a551213`. Task: [COS-35 / #36](https://github.com/lrfluobida/Cosmos/issues/36).

## Approved design

The internal `createValidationBrowserHost` assembles the same dynamic design/media, Phaser template, registry, normal-input checks and independent role factory as the ordinary host. It takes an explicit `ValidationRequirement`, current `ValidationExecutionBinding` and `operator_validation` browser proposal. The proposal lives in the frozen requirements document's `browser` field; the adapter checks its UTF-8 bytes, declared hash, exact proposal and acceptance IDs. It creates no human answers, confirmation or decision.

Design, art and coding use the current declaration's exact task IDs and grants. Captures and outputs carry the case ID, and each author has a separate `validation/<case>/<task>/workspace`. Role sessions, tools, capture, host jobs, review and delivery retain the current controller, scope, deadline and source identity. The factory retains declared output caps and the shared request ceiling, including review, corrections and compaction. Ordinary/formal defaults keep their existing entry contracts and workspace rules.

The linked coding repair checks durable failure bytes, journal signatures and candidate provenance, claims the existing single repair slot, copies immutable source into a separate author workspace and creates a new candidate version. It allocates no share of the lifetime pool. Design/art failures remain incomplete; this adapter does not reopen their immutable downstream task contracts.

## Owned implementation

- `src/runtime/entrypoint-host.ts`: explicit adapter, shared host assembly, exact role policies, action checks and bounded linked coding repair.
- `src/runtime/entrypoint-validation.ts`: explicit operator proposal type and frozen requirements/template checks.
- `src/runtime/run.ts`: narrow `requireValidationHost` guard reuses the existing identity reader and expiration logic. Identity checking can persist the original deadline stop; it does not claim a case or change grants, fees or the deadline.
- `src/roles/factory.ts`: optional trusted `beforeTool` callback; the validation adapter uses it before existing scoped tools. The default callback remains unset.
- `src/roles/requirements.ts`: shares declarative browser scenario checks without constructing a human draft.
- `src/runtime/entrypoint-workspace.ts`: explicit validation workspace binding and execution requirement type; the default continuation path remains unchanged.
- `tests/runtime/entrypoint-host-validation.{test,fixture}.ts`: temporary files, synthetic provider/build/browser and real controller/registry/journal. `generatedByCosmos:false`; these fixtures contain no target game.

## TDD and validation evidence

- Initial five groups failed because the explicit validation adapter was missing. Tests preceded implementation.
- Final five groups passed, zero skipped, exit 0 (10.078 seconds): exact grants/no human fields/caps; wrong case/root/frozen inputs; fixed tasks/workspace/output and source drift; reserved/unknown/cancel/expiry before tools or host effects; capture/independent review/linked repair and candidate promotion.
- Three existing representatives passed, zero skipped, exit 0 (5.077 seconds): ordinary candidate delivery, formal host reopening and default author/reviewer tool scope.
- Explicit strict compilation of all modified sources and both new test files, including their imports, passed with exit 0 (8.480 seconds). The first strict run found a nullable failure snapshot; the missing rejection condition was added before the passing run.
- UTF-8 without BOM, LF, existing Chinese lines and `git diff --check` verified. Source, template and prior core/registry evidence were reused.

Commands:

```powershell
node --experimental-strip-types --test tests/runtime/entrypoint-host-validation.test.ts
node --experimental-strip-types --test --test-name-pattern 'delivery requires the independent|reopening the same host binding|native role boundary keeps author writes' tests/runtime/entrypoint-host.test.ts tests/runtime/entrypoint-host-continuation.test.ts tests/roles/roles.test.ts
node node_modules/typescript/bin/tsc --noEmit --allowImportingTsExtensions --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node src/roles/factory.ts src/roles/requirements.ts src/runtime/entrypoint-host.ts src/runtime/entrypoint-validation.ts src/runtime/entrypoint-workspace.ts src/runtime/run.ts tests/runtime/entrypoint-host-validation.test.ts tests/runtime/entrypoint-host-validation.fixture.ts
```

The native owned-command implementation remains unchanged; this host forwards its existing `{caseId, windowId, taskId, deadlineAt}` authority shape. The tests observe that exact tuple at the synthetic IO boundary. Existing same-profile owned child evidence applies to the unchanged command launcher.

## Remaining runtime work

This source change supplies host assembly. A reviewed execution driver still needs to select immutable runtime scenario input and preserve the complete prepared task binding for recovery, including an already claimed repair. COS-36 supplies the separate runtime design and trusted plan binding. A persistent isolated browser profile and real process restart remain separate work. A coordinator must make any new real window decision under the existing COS-16 allocation and shared limits.

This task starts no real case, paid call, browser or target-game generation. Independent review and merger approval must precede `SHARED_VALIDATION_BROWSER_HOST_SOURCE_READY`; source tests alone do not establish COS-16 migration or final user experience acceptance.
