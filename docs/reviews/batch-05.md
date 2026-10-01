# Batch 05 review and integration record

Date: 2026-10-01. Sole merger: `batch05_merger`. COS-11 status: `offline-verified-awaiting-live`; #12 remains open. COS-10 still lacks successful generated-game acceptance and G3 remains closed.

## COS-11 approved source and integration

| Task | Implementer | Independent review | Reviewed commit | Merge commit |
| --- | --- | --- | --- | --- |
| COS-11 / #12 | `cos11_implementer` | Root-dispatched separate reviewer; final READY, no P1/P2 findings | `005f51bbe48fb2ec356d77f365e538394e37c740` | `e1467f06990cfad160f2fa8ecbae0f02de9a7538` |

The final review followed three P2 repairs: a valid `changes_requested` review now persists feedback without changing its verdict; multi-round interfaces use current artifact versions while preserving the complete failure chain; output protection checks normalized workspace paths against historical references independently of artifact IDs, including parent/subtree overlap.

The merge was conflict-free. Its first parent is batch plan commit `034b57fa8d0d792d0854d0bc75c1ce2a08e30957`; its second parent is the exact approved SHA. All seven owned paths match that SHA. Existing review-field clarification `608ac1fb5d20622ab4a2ea70c62e6fc19dda3cf4` and its tests remain unchanged. The merger made no implementation edits.

The implementation covers fixed-source failure feedback, bounded repair decisions, explicit successor tasks and optional correction of malformed reviewer proposals inside the same active independent session. Correction defaults to zero and allows at most one when enabled; genuine findings remain defects. Failed task history, original costs and deadline are preserved. A new artifact version needs host verification and independent review, and no-progress decisions require actual host evidence that an earlier failed check passed.

## Integration evidence

Environment: Windows, Node.js `22.22.2`. The affected suite ran once on the combined main tree; build and typecheck ran sequentially after it exited.

| Command / check | Result |
| --- | --- |
| `node --experimental-strip-types --test "tests/roles/*.test.ts" "tests/e2e/*.test.ts" "tests/runtime/*.test.ts" "tests/contracts/*.test.ts"` | 170/170 passed; zero failures, cancellations or skips |
| `npm run build` | Passed, exit 0 |
| `npm run typecheck` | Passed, exit 0 |
| Diff against the seven approved owned paths | Empty |
| Existing factory clarification and role tests against pre-merge main | Unchanged |
| UTF-8/LF, Chinese fixture text and staged whitespace | Verified |

The TAP log is retained locally at `.cosmos/integration/batch05-cos11.tap`. Author evidence for the targeted 12/12 and final roles 83/83 was supplied with the review; the combined 170-test result above is the merger's fresh integration evidence. Unchanged browser/media probes were not repeated. The E2E browser-environment test mocks the launch call, and these checks make no live game or paid-service claim.

## Remaining acceptance and ownership

COS-11 still needs a newly authorized live generation demonstrating native protocol correction when required and a real game defect repaired and independently accepted within the original run's limits. Offline fixtures and scripted providers do not establish that result. COS-10 / #11 remains open; the initial pilot and its one continuation remain failed, and its old `--continue` entry must not run again.

Recorded shared validation remains 892,282 micro-CNY from thirteen settled requests, with zero reserved or unknown fees. Integration made no paid calls and did not access or modify the live ledger, model credentials or runtime artifacts. Root retains paid-validation ownership.

COS-12 Phase A commit `9370eb27` was under independent review at this handoff and is not merged here. After the coordinator releases this clean main baseline, `cos12_implementer` can merge it into the task branch and connect Phase B to the reviewed repair API. COS-12 keeps its own independent reviewer, and only `batch05_merger` may integrate its approved exact SHA. COS-13 waits for COS-12; COS-18 retains COS-10/11/12/13 dependencies, and full benchmark work still requires the COS-01 reference freeze.

## Remote synchronization

Command-scoped proxy push advanced main from `034b57f` to `e1467f06990cfad160f2fa8ecbae0f02de9a7538`; `ls-remote` confirmed the exact code SHA before the [COS-11 status comment](https://github.com/lrfluobida/Cosmos/issues/12#issuecomment-5928992000) was posted. The API confirmed #12 remains open. The task mapping records `offline-verified-awaiting-live`, the approved and merge SHAs, and that comment. This record and progress synchronization follow the verified code push.

## COS-12 Phase A integration

The independent reviewer approved `ab6a2e08d0352575989abff68b5e6f615330cf8e` as `PHASE_A_READY` after one P2 fix, with no remaining P1/P2 findings. The fix makes failed owner release retryable across OwnerLock, SnapshotStore and RunController, keeps closing objects unavailable for new work, shares concurrent close results and prevents a released owner from deleting a later owner's lock.

It merged without conflicts as `7cff53794665f4f759d6973061e4dc25855269e1`, with `96b2ddcec3ba23e53d84c662efbb065e1595a6d2` as first parent and the exact approved SHA as second parent. All thirteen owned paths match the approved tree; COS-11 and the review-field clarification remain unchanged. Phase A provides ownership recovery, durable billing receipts and exact-request reconciliation, owned work draining and cancellation checks before artifact publication.

The combined command `node --experimental-strip-types --test "tests/runtime/recovery/*.test.ts" "tests/runtime/*.test.ts" "tests/roles/budget.test.ts" "tests/roles/repair-*.test.ts" "tests/artifacts/*.test.ts"` passed **97/97**, with zero failures, cancellations or skips. Build and typecheck passed sequentially afterward. UTF-8/LF, Chinese fixtures and the staged diff were verified. Local TAP evidence is `.cosmos/integration/batch05-cos12-phase-a.tap`; prior reviewer-accepted 39/39 focused and 50/50 Phase A evidence is retained without duplicate runs.

These checks use real temporary files and owned child processes with simulated provider receipts. No paid calls, live ledger edits, generated-game recovery or old browser/media probes ran. Phase B orchestration remains pending, so #13 stays open as `phase-a-integrated` and G3 stays closed. The old pilot remains failed and will not restart.

The command-scoped proxy push and `ls-remote` confirmed code SHA `7cff53794665f4f759d6973061e4dc25855269e1` before the [Phase A status comment](https://github.com/lrfluobida/Cosmos/issues/13#issuecomment-5929123056); the API then confirmed #13 remains open. This supersedes the earlier Phase A pending-review checkpoint. `cos12_implementer` can merge the clean main baseline and implement Phase B on its own branch; independent review and root's exact-SHA handoff still precede integration by `batch05_merger`.

## COS-12 Phase B integration and task completion

The independent reviewer approved `128f4d1604e5644cd89f00d915441a0ef178f255` as `PHASE_B_READY` after the dependency-propagation P1 and pre-registration cancellation P2 were fixed. Full initial review and both affected-change reviews left no blocking findings. Current-invocation validation now establishes ancestor readiness before descendant dispatch; blocked or omitted ancestors propagate through passed intermediate tasks. Cancellation after origin persistence but before registration returns blocked without mutating the snapshot.

The exact SHA merged without conflicts as `1dc6b00473a23d07739fcc25599a745733309209`, with `c9aab3239a43806f008d7fef18c2ae3e4bd25bef` as first parent and the approved SHA as second parent. All nine Phase B paths match the approved source; the merger made no implementation edits.

The combined command `node --experimental-strip-types --test "tests/runtime/recovery/*.test.ts" "tests/runtime/*.test.ts" "tests/roles/*.test.ts" "tests/artifacts/*.test.ts" "tests/e2e/*.test.ts"` passed **186/186**, with zero failures, cancellations or skips. Build and typecheck then passed sequentially. UTF-8/LF, Chinese fixtures and the staged diff were verified. Local TAP evidence is `.cosmos/integration/batch05-cos12-phase-b.tap`. The combined check covers both phases and COS-11; unchanged generic media and real-browser probes were not rerun.

| Task-card boundary | Evidence and scope |
| --- | --- |
| Cancel during generation | An actual registered gated writer drains before stop acknowledgement; no later delivery write is accepted, and prior accepted artifacts survive. |
| Exit around durable state | Separate Node processes exit at author/capture/verification/review boundaries and immediately before/after snapshot commit; reopening preserves one complete original revision. |
| Paid result lost or not settled | Scripted providers and synthetic charges exercise unknown reservations and exact durable receipt reconciliation; unresolved or conflicting results block new paid admission. |
| Completed artifact not registered | Exact origin/version/content/manifest checks recover an already published capture without reauthoring, then perform only unfinished stages. |
| Repeat recovery and dependency selection | Passed work is reused without author/build/review calls; attempts, corrections, terminal records, fees and deadline remain continuous. Blocked or missing ancestors prevent all descendant dispatch in normal, reversed and transitive cases. |

Recovery remains opt-in and requires protected host journals, exact fixed references and a read-only manifest/provenance adapter. Lost author responses, incomplete verification/review receipts, uncertain ownership or writers, changed content/contracts, missing registry promotion authority, unknown charges and stopped/expired runs remain blocked. Arbitrary detached work, reconstruction of lost in-memory promotion proofs and power-loss recovery are unsupported. These limits preserve evidence and exposure rather than infer success.

The API confirmed [#13 closed as completed](https://github.com/lrfluobida/Cosmos/issues/13#issuecomment-5929980089) at `2026-10-01T11:00:20Z`, after proxy push and `ls-remote` verified code SHA `1dc6b00473a23d07739fcc25599a745733309209`. This closes the COS-12 platform fault-injection task; actual local processes/files, scripted providers and a simulated deadline are explicitly distinguished in the report. No paid call or live game recovery occurred, and no live ledger or original pilot artifact changed. COS-10 remains unpassed, COS-11 still awaits live evidence, and G3 remains closed.

COS-13 may now start from this reviewed recovery API on a separate implementer branch with an independent reviewer. The current main write segment is released after documentation synchronization; subsequent integration remains with the sole batch merger after root supplies the approved exact SHA. The earlier Phase A-only checkpoint is superseded by this completion record.
