# Batch 01 review and integration record

Date: 2026-10-01. Merger: `batch01_merger`. Status: all approved batch deliverables integrated and pushed to `main`. COS-02 and COS-05 are complete; COS-01 is a partial source inventory and remains provisional. No paid calls were made during integration.

## Approved commits and merges

| Task | Implementer | Independent reviewer | Reviewed commit | Merge commit | Result |
| --- | --- | --- | --- | --- | --- |
| COS-05 / #6 | `cos05_implementer` | `cos05_reviewer` | `1121ae25c071c2d7e4dd4f0c8c3440e5546efe88` | `5e3670efa7be5e35d22427bc50caa8c4e0063047` | Spec and quality review approved; local integration passed |
| COS-01 / #2 | `cos01_implementer` | `cos01_reviewer` | `791472e497efa9b06165072799bc90d3d64bbe9c` | `8b64b595856fa5c68083293634544009203ea5a6` | Partial source inventory and validation guard approved; reference remains provisional |
| COS-02 / #3 | `cos02_implementer` | `cos02_reviewer` | `45c3cf6a47be6abea1578447faee5f82977f32de` | `a6247ec711f3da83f0b5f2d521f9fb1b6dac6c69` | Spec and quality review approved after two P2 fixes; integration passed |

All three merges used `--no-ff` and retain the exact reviewed commit as the second parent. There were no merge conflicts. COS-01 includes its original `b7587e9` inventory commit and the reviewed fix for evidence coverage of measured entities and interaction participants. The reviewer independently passed the seven focused tests added with that fix.

COS-02 includes the original `4942808` contracts and the `45c3cf6` fix. Independent review first identified two P2 issues: old typed evidence could be combined with newer-version logs, and a reviewer could substitute author artifacts before approving them. The fix binds evidence kind and current versions within one evidence record and makes author artifacts, attempts, context and handoff immutable to the reviewer. Valid review-evidence append and author rework remain allowed. The reviewer inspected the four-file delta and passed six focused tests before approving the exact final commit.

Coordinator documentation was committed separately as `0e982cf`: `AGENTS.md`, the batch plan and initial progress update. The only integration code/configuration change is adding `tests/**/*.test.mjs` to the existing `npm test` command so reference guard tests are included alongside TypeScript tests. The quickstart reflects that command.

The partial integration record and test-script adjustment were committed as `e667623`. The coordinator's batch 02 plan was committed separately as `8e9e618` before the final contracts merge.

## Integration evidence

Environment: Windows, Node.js `22.22.2`, npm `10.9.7`.

| Command / check | Result | Scope |
| --- | --- | --- |
| `npm ci --no-audit --no-fund` | Passed | Six root development packages installed from the approved lockfile |
| `npm run build` | Passed | Final combined CLI and contracts source after COS-02 merge |
| `npm run typecheck` | Passed | Final combined root TypeScript source after COS-02 merge |
| `npm test` before COS-01 | 7/7 passed | CLI behavior on merged main |
| `node benchmarks/classic-pc/reference/validate.mjs` | Passed | 230 provisional entries; 221 unresolved |
| `node --test tests/reference/validate.test.mjs` | 16/16 passed | Reference validation after COS-01 merge |
| `node benchmarks/classic-pc/reference/validate.mjs --require-frozen` | Expected exit 1 | `benchmark is provisional; not frozen` |
| `npm test` with the combined TS/MJS glob, first wave | 23/23 passed | Seven CLI tests and sixteen reference tests before contracts integration |
| `npm test` with the combined TS/MJS glob, final batch | 63/63 passed | Seven CLI tests, forty contract tests and sixteen reference tests after all approved merges |

COS-02 changes TypeScript source, so build/typecheck and the combined suite were rerun after its merge. It adds no dependencies, so the successful root installation evidence remains applicable. Source and test files from each task match their reviewed commits. Existing probes and historical failures are preserved.

## Reused COS-05 browser evidence

The implementer ran the real desktop Chromium test against the approved CLI and template on 2026-10-01 at 05:04 UTC. The reviewer inspected the implementation, screenshots and encoding and approved spec compliance and quality. The report records one expected test, zero unexpected failures, zero flaky tests and zero report errors.

- Worktree: `E:/CodexData/.codex/worktrees/cos-05-cli/Cosmos`.
- Report and command output: `.cosmos/browser-report.json`; screenshots: `.cosmos/browser-evidence/01-ready.png`, `02-mouse-input.png`, `03-scene-switch.png`.
- Scope: a fresh path with spaces and Chinese characters, `init`, independent `npm ci`, build and localhost preview; normal mouse clicks, sprite movement, scene switch and return; frozen debug snapshots and no browser errors.
- The CLI, template, browser tests and their dependencies are unchanged by integration. The browser run was reused without a duplicate run.

This demonstrates the generic project capability. It is not evidence of a Cosmos-generated target game.

## Remaining work and remote synchronization

- COS-01 remains provisional: complete names, rules, values and normal UI observations are still required. Issue #2 and the parent #1 must remain open; COS-14 final acceptance and COS-15 are still blocked on reference freezing.
- The first-wave push and HTTP/1.1 retry returned `Recv failure: Connection was reset`. A bounded check reached `api.github.com` but timed out on `github.com`. These failed attempts are retained here; after COS-02 integration, a single ordinary `git push origin main` succeeded, advancing the remote from `5d30460` to `a6247ec` without force. The GitHub API confirmed that exact remote main SHA.
- [COS-05 completion comment](https://github.com/lrfluobida/Cosmos/issues/6#issuecomment-5925395392) and [COS-02 completion comment](https://github.com/lrfluobida/Cosmos/issues/3#issuecomment-5925395953) record the reviewed/merge commits and tests; #6 and #3 are closed. [COS-01 partial-delivery comment](https://github.com/lrfluobida/Cosmos/issues/2#issuecomment-5925396505) records its remaining gaps; #2 and parent #1 were verified open. The local issue mapping is synchronized with those states.
- [Batch 02](../plans/2026-10-01-batch-02.md) is ready: COS-03 has started from integrated main in a reused worktree with the old branch retained. COS-06 and COS-08 await scheduling. Reference freezing remains separate from those independent platform tasks.
