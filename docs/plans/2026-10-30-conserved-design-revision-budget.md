# Conserved ordinary design revision budget implementation plan

状态：review-v2已由design_revision_budget_reviewer独立DESIGN_APPROVED，Root明确批准实施及ADR设计决定；SOURCE pending，非源码批准或预算增额。作者design_revision_budget_implementer，独立reviewer后续审actualdiff，唯一merger planning_budget_merger。只以v2技术条款为当前实施依据，不混入v1过宽eligibility或统一32请求上限。

任务：[COS160 / #161](https://github.com/lrfluobida/Cosmos/issues/161)，id6115177248；原生父COS18/#19未勾，依赖[COS134 / #135](https://github.com/lrfluobida/Cosmos/issues/135)唯一design revision与[COS132 / #133](https://github.com/lrfluobida/Cosmos/issues/133)review reserve。runtime基线 `66884f836b6b8f8e49872208be3b2c0a54f23808`。[ADR0006](../adr/0006-conserved-ordinary-design-revision-budget.md)的accepted仅代表Root接受设计决定，SOURCE仍pending。

v2批准输入SHA256：spec `52b3efc20712a2cd812b00339f642d5ff04aa052b2f97b009b10ff9e2013daa3`；plan `ec60fc6ac98c16f1980edaca16e44cf576639e0d0ce98c3847ff408f156e83d5`；ADR `bd5f111f0cb5b8bce838156460cd9f193b94f8019b93d72c9bdcdf505412c344`。immutable approved-v2原件及登记副本保持。真实phase45/C37871307µ/H0无变更，无新paid或实际预算激活。

> For agentic workers: use `superpowers:executing-plans` after Root and independent design approval. This is one cohesive implementation task with one implementer and a separate reviewer. `planning_budget_merger` alone integrates/pushes approved commits.

Status: review-v2 DESIGN_APPROVED and Root implementation authorized; SOURCE pending. Exact v1 originals remain in `.cosmos/planning/conserved-design-revision-budget/review-v1/`. ADR accepted is a design decision, not source completion or a budget increase.

Goal: transfer only the reconciled unused initial-design allocation of a positively authenticated fresh public-funded ordinary child into the existing single fresh revision, without changing money, time, evidence, acceptance or non-funded ordinary continuation.

Architecture: positively authenticate public funding, freeze policy before paid planning, retain ledger1 through the initial stage, then atomically upgrade to ledger6 with source closure, target registration and a bound host activation receipt. A narrow policy-specific lifecycle tracker retains owner lock on uncertain sessions and validates current OwnedWork operation/epoch. Use a no-expire serialized exact-retry branch; first activation still expires normally. No general allocator, actor framework or new dependency.

Tech stack: current TypeScript/Node 22, existing contracts, RunController, SnapshotStore and Pi fixtures. Read [the approved v2 spec](../specs/cos160-conserved-design-revision-budget.md) before implementation; private `.cosmos/planning/conserved-design-revision-budget/feasibility.md` is evidence, not an alternate contract.

## Preparation record

- [x] Read repository AGENTS, CONTEXT, product spec budget/review/recovery clauses, COS134/135/136/137/138/150/154/159 context and current budget/design runtime.
- [x] Reuse R25 diagnosis; no trace rerun, real controller/provider/ledger mutation or paid work.
- [x] Read domain-modeling/brainstorming/writing-plans and bounded-scope skill; prepare proposed ADR0006 without tracked edits.
- [x] Root and the independent reviewer approved the exact v2 spec/plan/ADR hashes; SOURCE review is still pending.
- [ ] After design approval, use the existing clean dedicated worktree `E:/CodexData/.codex/worktrees/cos-02-contracts/Cosmos`: `git switch -c codex/conserved-design-revision-budget 66884f836b6b8f8e49872208be3b2c0a54f23808`, checking clean state first. Root has authorized that branch setup; do not ask again. Current preparation leaves the old branch unchanged.

For every edit: detect UTF-8 with fatal decoding; warn/stop for non-UTF-8. Announce touched files, patch minimally, retain line endings, reopen to inspect Chinese. Do not commit `.cosmos/planning` or mutate real historical files.

## 1. Contract and controller activation

Files: modify `src/contracts/types.ts`, `structure.ts`, `validation.ts`, `updates.ts`; `src/runtime/run-types.ts`, `run-validation.ts`, `continuation-validation.ts`, `run.ts`. Create focused `src/runtime/ordinary-design-revision-budget.ts` for types/pure checks/derivation and fixed-source verification; keep controller queue/snapshot write in RunController. `src/contracts/budget.ts` only needs a small profile-aware unallocated helper if it eliminates repeated branching; existing net algorithm stays.

- [ ] Add failing contract tests in `tests/contracts/updates.test.ts` and new `tests/runtime/ordinary-design-revision-budget.test.ts`: ledger1 closure rejected; ledger6 valid only with generation scope and exact single conserved closure; raw vs net conservation; immutable allocations/settled entries/receipt; unauthorized upgrades; U=0, B=0, overflow, negative and duplicate/conflicting sources.
- [ ] Run `node --experimental-strip-types --test tests/contracts/updates.test.ts tests/runtime/ordinary-design-revision-budget.test.ts`; capture meaningful RED (assertion proving old behavior/guard missing, not syntax or import failure).
- [ ] Define exact ledger6 shape and single snapshot activation receipt/event. Pure validation cross-binds source task/grant/ended attempt, closed source settlement, target task/grant and run/task IDs, basis revision and unchanged clocks. Add narrow ledger update upgrade option and permanent source closure checks.
- [ ] Add controller activation under accounting→pending queue with a private no-expire entry. First inspect exact existing activation using a read-only current-snapshot facade: matching retry returns without read()/expire/event/commit/live-work requirement, including stopped/expired runs. Missing activation explicitly calls normal expire(), then current funding/lifecycle/source/deadline checks and atomic commit. Never expose a generic no-expire public option.
- [ ] Compute trusted G/S/U/B/H from fixed host plan and ledger, reread actual bound files, hold the existing funding gate for first activation, and recheck operation/epoch immediately after all async reads before commit. Include fail-closed conflicting/partial state behavior.
- [ ] Enforce ledger update validation for new profile and this upgrade despite snapshot format1. Keep receipt fixed on subsequent commits; refuse new source reserve/admit/save/register/import/owned dispatch, while preserving real existing target accounting/overrun behavior.
- [ ] Implement source verifier without deadline or active-dispatch side effects; call at open before mutation and new profile authority/admission/accounting points. It must never call public funding or the real controller.read inside serial.
- [ ] Re-run only affected tests and commit the coherent contract slice after it passes. Do not publish a partially enabled default.

## 2. Frozen entrypoint policy, exact intent and lifecycle

Files: `src/runtime/entrypoint.ts`, `entrypoint-host.ts`, `entrypoint-design-revision.ts`, new helper above; new focused `src/runtime/ordinary-design-revision-lifecycle.ts`; `src/runtime/recovery/owned-work.ts` only for opaque live-operation token; `src/runtime/store.ts` only for read-only original owner identity; `run.ts` close guard. Reuse `public-validation-funding.ts` recovery proof reader if needed with minimal export; do not change recovery semantics or OwnerLock schema. Tests: new `tests/runtime/ordinary-design-revision-budget.fixture.ts`, new `tests/runtime/ordinary-design-revision-lifecycle.test.ts`, existing `ordinary-design-review-revision.test.ts` and owner/completion representatives.

- [ ] Write failing tests for positive production public-funding authentication before selection (complete intent/origin/authorization/shared record); raw flag, missing intent, wrong source and already-closed funding cannot opt in. Non-funded ordinary must keep old ledger1 and formal continuation behavior.
- [ ] Test fresh planning-started marker before provider hook; exact planning/execution/host agreement; old absent marker; one-sided marker; interrupted planning; prior intake/planning fees/deadline preserved. Freeze only after positive authenticated funding and bind its fundingId/authorizationSha256; preserve legacy absence and disallow reselecting after planning-started/execution exists.
- [ ] Extend revision plan with strict version2 for the new policy only, including complete fixed budget intent/signatures. Reuse feedback/authenticateDesign/deriveRevision logic; retain v1 path byte compatibility. Reject any model-provided or inconsistent amount.
- [ ] Add the spec §5.1 tracker before createHost, wrapping only selected-policy actual native role creation (including planning early-return). Persist owner-started and append its exact reference/hash/owner in `ordinary_design_budget_owner_started` snapshot event before any role can start; add narrow event validation for funded format1/ledger1 as well as ledger6. Active/epoch increments before factory await; release only on successful cached native close promise, which already awaits operationDone. Creation/close uncertainty latches blocked and cannot be reset by second close/new host.
- [ ] Bind one tracker/native factory to controller and original store owner identity. On close, invalidate capabilities/reject new work and retain owner lock unless zero active/no blocked/all bound operation promises settled/accounting drained; publish exact owner-closed before unlink. Test completion fallback cannot release a failed-session owner. Existing non-policy close semantics stay unchanged.
- [ ] Add optional opaque OwnedWork.run callback token with private registry and live identity checks; invalidate on return/reject/cancel. Bind in generation callback before planning. Keep actual promise-settled status separate from cancellation invalidation for safe owner release.
- [ ] Implement host-held, non-public mint closure and private WeakMap capability registry; bind controller/owner/work/operation/source/intent/epoch. Test raw/JSON/brand forgery, cross-host/controller/work, old epoch, operation already resolved while signal active, cleanup during queued or I/O authentication, and wrong intent all reject first activation.
- [ ] Cold binder follows every snapshot-anchored prior started owner and requires exact clean-close receipt or existing persisted funding recovery proving owner/children exited. A deleted/missing started file must fail, not disappear via directory enumeration. Existing live lock still requires normal recovery. Test same-process reopen after uncertain create/close fails, absent-lock/no-proof fails, valid clean-close and proven-exit recovery succeed. Do not add manual lock deletion/recovery or generic orchestrator changes.
- [ ] Activate before invoking revision. A registered-unstarted target makes current→prepareDesignOrigins→resumeTaskDag choose existing recovery; origin with existing outputs/charges still rejects. Keep 185000ms guard and maximum one revision.
- [ ] Add fault tests before/after lifecycle-started/clean-close receipts, intent publication, snapshot write, and origin. Assert no release-then-register gap, old/new complete states only, uncertain lifecycle retains lock. Exact repeat after stopped/expired snapshot has no revision/event/bytes change and does not require live work; first activation after expiry still persists normal stop. Isolate independent timer advancement from retry assertions.
- [ ] Test new intent/receipt/selection source changes, initial approved vs valid negative vs malformed review, cross-run/source/attempt mismatch and source amount mutations. Verify authoritative reviewers/concerns/capture requirements remain enforced.
- [ ] Run focused entrypoint/recovery tests, then commit the complete wiring slice.

## 3. Downstream allocation and external accounting compatibility

Files: `src/runtime/entrypoint-successors.ts`, `src/runtime/repair/policy.ts`, already touched `entrypoint-host.ts`; `src/runtime/continuation-quote.ts`, `continuation-authority.ts`; `src/runtime/public-validation-funding.ts`. `completion-timing.ts` should need no production change if existing metadata equality works; add one only for a demonstrated reachable incompatibility and review it explicitly.

- [ ] Add failing tests demonstrating raw allocations double-count closed U in both live repair-grant calculation and persisted `allocationsBefore` restoration at successors:286. Bind new-profile repair plan to exact activationId/intentSha256/allocationClosuresBefore; old plan keeps its old shape/raw sum.
- [ ] Apply net allocated only for ledger6 at successors:106/286, repair/policy:83/115 and host:1365. Preserve base intake/planning pool and existing fixed art/coding grants. Search `allocations.*reduce` to ensure no other reachable new-profile allocator is missed; do not refactor unrelated profiles.
- [ ] Keep funded continuation rejected through existing rejectFundedContinuation, and explicitly reject ledger6 before old arithmetic/confirmation. Add positive non-funded ordinary ledger1 quote+real-confirmation activation regression so R15 capability is preserved; no migration or broader continuation feature.
- [ ] On new-profile public funding child authentication/first settlement, invoke the same activation-source verifier before accepting actual bytes; preserve existing funding amount, source evidence, cleanup, billing, shared ledger3–5 and historical settlement format. Closed shared history reads sealed settlement sources without reopening execution.
- [ ] TEMP tests: coding repair receives original net leftover and cold-restores; completion plus new-profile funding settlement uses unchanged charge total; tampered activation/intent/source refuses first settlement; existing old closed settlement remains readable and byte-identical; post-cleanup activation metadata is not accepted under prior cleanup proof.
- [ ] Run affected repair/continuation/funding tests and commit the complete compatibility slice.

## 4. Context-preserving counterfactual and final source review

Files: `tests/providers/design-revision-budget-conservation.test.mjs` plus one small fixture only if existing budget harness cannot express the path. Existing `tests/providers/design-candidate-review-budget.test.mjs`, `tests/providers/design-review-budget.test.mjs`, and `tests/runtime/ordinary-design-budget-finalization.test.ts` supply guard regressions.

- [ ] Construct a synthetic trace using G1125000, author366305, review125864, U632831, B900000. Derive H1532831 through production trusted helper; do not inject H directly as activation authority.
- [ ] Replay identical revision author410600/review183708 usage and complete 211718B request at original 4096 floor: legacy remaining305692 rejects quote456204; new remaining938523 admits the same quote. Assert input bytes and retained messages match, no new actual bill, original request/model/cap/review reserve fraction and correction counters intact. Label fixture explicitly counterfactual; do not report a model reply or semantic game pass.
- [ ] Add model-cap/reserve boundary tests proving review reserve remains `floor(H/3)` (`provider-budget.ts:40`), full original maximum unchanged, and floor insufficiency rejects. Preserve current design-author 64 and reviewer/planner 16 requests (`entrypoint-host.ts:909-914`) plus existing role overrides and one correction; do not add unified 32.
- [ ] Run `npm run typecheck` and `npm run build`; run new focused suites, old ledger v1/v2/v3–5 representatives, original design revision/finalization, ordinary repair and public funding representatives. Reuse unchanged previously approved broad evidence; do not blindly rerun all tests or paid validation.
- [ ] Reopen modified text and inspect Chinese/line endings; `git diff --check`; record exact commit SHA, changed files, commands/results, fixture boundaries and gaps. Ask independent reviewer to inspect actual diff for spec compliance then quality, with fresh review context.
- [ ] Fix actionable findings on implementer branch; rerun affected checks; return exact approved SHA to sole merger. Root/merger publishes approved spec/plan/ADR/glossary/task mapping as appropriate, combines commits, runs integration checks and records source-scoped outcome. No author merge/push to main.

## Approval questions for Root/reviewer

1. Does funded-only positive authentication preserve non-funded ordinary formal continuation while keeping the requested scope generic to managed ordinary games?
2. Does §5.1 give sufficient concrete authority at owner release/reopen and live operation/epoch boundaries, including no-lock and same-process cases?
3. Does the private no-expire exact-retry branch meet no-write idempotence while first activation retains original expiry and margin guards? Review the added OwnedWork token/store identity/lifecycle helper only as necessary parts of this authority.

This preparation has received the stated v2 design approval and Root implementation authorization. All actual R25 files and ledger history remain outside this task; SOURCE completion still requires independent actual-diff review.
