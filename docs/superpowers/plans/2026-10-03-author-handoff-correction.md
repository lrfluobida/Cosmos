# Author handoff correction implementation plan

> **For agentic workers:** Execute this approved COS23 scope in the dedicated implementer worktree. An independent reviewer inspects the final diff; the batch merger alone integrates it.

**Goal:** Allow one explicit format correction in the original live author attempt without granting writes or relaxing acceptance.

**Architecture:** Strict JSON parsing stays unchanged. A native idle-session turn disables all tools, checks the callable registry, and restores the original loadout under the existing operation lock. Write-once host receipts preserve the original reply, parse cause, author identity, input signatures and workspace bytes before dispatch; a stored response can be reused without another model call.

**Tech Stack:** TypeScript, pinned pi SDK 0.99.2, node:test with intercepted native provider traffic and scoped filesystem fixtures.

- [x] Add a failing test using the exported native design reply and native tool-control tests for write/edit/check_project, deferred exposure and concurrent operations.
- [x] Add `readonlyPrompt` to `src/providers/pi.ts` and `src/roles/factory.ts`; retain the same model, session, signals, request counters and billing hooks. The correction turn admits at most one provider request.
- [x] Add `src/runtime/repair/author-protocol.ts`, durable correction stages and explicit `authorProtocolCorrections: 0 | 1` in orchestrator recovery origin. Persist slot use before dispatch; preserve strict parse errors as stable author protocol feedback.
- [x] Verify corrected output still traverses capture, host checks and independent review. Invalid/unresolved output, changed bytes, exhausted authority, cancellation, lost responses and finished attempts must remain unsuccessful.
- [x] Forward an explicit driver option without changing historical declarations, including the coding repair origin. Run affected tests; re-open UTF-8/Chinese text and inspect the diff.
- [x] Final source typecheck and strict noEmit over the affected probes/tests; commit candidate prepared for review.
- [ ] Independent review; the batch merger integrates only the approved SHA.

The task concerns Cosmos capability validation and its author handoff, using the existing CONTEXT terms. It creates no target-game acceptance evidence and does not reopen the consumed case 3. It leaves the semantic repair budget and the existing paid ceilings unchanged.

## Host API and recovery boundaries

`DagOptions.authorProtocolCorrections: 1` requires serial execution and explicit recovery roots outside author output paths. Native session state must also stay outside those paths. `generateValidationCase(input, io, sessionFactory, { authorProtocolCorrections: 1 })` is the new host opt-in; three-argument callers retain their existing policy and origin shape. A future case declaration and paid admission are separate work.

The correction grants no tools because its original facts already exist in the live author session. SDK `getAllTools`, `getActiveToolNames`, `setActiveToolsByName` and `getCallableToolNames` establish actual isolation; codemode/deferred exposure fails closed. The format request uses the original author model, token cap, signal, grant and accounting purpose. It does not grant a semantic repair.

Receipts bind task, attempt, author and context IDs, original/response SHA-256, the strict parse failure category, fixed input/interface signatures and bytes under the declared author write paths. Native session and host billing/journal writes remain outside this output signature. A started correction with no complete response stays blocked; a complete response can proceed to capture and host checks without a second author or format call. Existing failed/completed attempts remain on their original repair or result path.

Offline evidence: initial RED reproduced the actual native reply rejection and the missing tool-control API (18 pass / 12 fail). Native provider tests subsequently passed 22/22; author/journal tests passed 17/17. Affected pre-existing JSON/review/compaction checks passed 62/62 before the final signature/wiring delta and are reused. The explicit wrapper test also exercises a distinct coding repair; all test models, accounting and artifacts are labeled offline fixtures, not target-game generation evidence.

Final explicit wrapper evidence passed 1/1 with ten current-case requests (including format correction), 100 micro-CNY synthetic cost, original author billing purpose and matching policy in design/coding/repair origins. The initial default wrapper reached a passed pipeline; its original request assertion counted the prior imported charge and was corrected to select validation requests. The existing three-argument production path remains unchanged. Full platform, real HTTP, generated-game and browser suites were not rerun.
