# Batch 01 review and integration record

Date: 2026-10-01. Merger: `batch01_merger`. Status: partial integration on local `main`; push pending because GitHub connections were reset. COS-02 needs fixes from independent review. No paid calls were made during integration.

## Approved commits and merges

| Task | Implementer | Independent reviewer | Reviewed commit | Merge commit | Result |
| --- | --- | --- | --- | --- | --- |
| COS-05 / #6 | `cos05_implementer` | `cos05_reviewer` | `1121ae25c071c2d7e4dd4f0c8c3440e5546efe88` | `5e3670efa7be5e35d22427bc50caa8c4e0063047` | Spec and quality review approved; local integration passed |
| COS-01 / #2 | `cos01_implementer` | `cos01_reviewer` | `791472e497efa9b06165072799bc90d3d64bbe9c` | `8b64b595856fa5c68083293634544009203ea5a6` | Partial source inventory and validation guard approved; reference remains provisional |

Both merges used `--no-ff` and retain the exact reviewed commit as the second parent. There were no merge conflicts. COS-01 includes its original `b7587e9` inventory commit and the reviewed fix for evidence coverage of measured entities and interaction participants. The reviewer independently passed the seven focused tests added with that fix.

Coordinator documentation was committed separately as `0e982cf`: `AGENTS.md`, the batch plan and initial progress update. The only integration code/configuration change is adding `tests/**/*.test.mjs` to the existing `npm test` command so reference guard tests are included alongside TypeScript tests. The quickstart reflects that command.

## Integration evidence

Environment: Windows, Node.js `22.22.2`, npm `10.9.7`.

| Command / check | Result | Scope |
| --- | --- | --- |
| `npm ci --no-audit --no-fund` | Passed | Six root development packages installed from the approved lockfile |
| `npm run build` | Passed | CLI compilation after COS-05 merge |
| `npm run typecheck` | Passed | Root TypeScript source after COS-05 merge |
| `npm test` before COS-01 | 7/7 passed | CLI behavior on merged main |
| `node benchmarks/classic-pc/reference/validate.mjs` | Passed | 230 provisional entries; 221 unresolved |
| `node --test tests/reference/validate.test.mjs` | 16/16 passed | Reference validation after COS-01 merge |
| `node benchmarks/classic-pc/reference/validate.mjs --require-frozen` | Expected exit 1 | `benchmark is provisional; not frozen` |
| `npm test` with the combined TS/MJS glob | 23/23 passed | Seven CLI tests and sixteen reference tests on the merged tree |

COS-01 changes no TypeScript source or dependencies, so the successful build/typecheck evidence remains applicable. Source and test files from each task match their reviewed commits. Existing probes and historical failures are preserved.

## Reused COS-05 browser evidence

The implementer ran the real desktop Chromium test against the approved CLI and template on 2026-10-01 at 05:04 UTC. The reviewer inspected the implementation, screenshots and encoding and approved spec compliance and quality. The report records one expected test, zero unexpected failures, zero flaky tests and zero report errors.

- Worktree: `E:/CodexData/.codex/worktrees/cos-05-cli/Cosmos`.
- Report and command output: `.cosmos/browser-report.json`; screenshots: `.cosmos/browser-evidence/01-ready.png`, `02-mouse-input.png`, `03-scene-switch.png`.
- Scope: a fresh path with spaces and Chinese characters, `init`, independent `npm ci`, build and localhost preview; normal mouse clicks, sprite movement, scene switch and return; frozen debug snapshots and no browser errors.
- The CLI, template, browser tests and their dependencies are unchanged by integration. The browser run was reused without a duplicate run.

This demonstrates the generic project capability. It is not evidence of a Cosmos-generated target game.

## Remaining work and remote synchronization

- The independent `cos02_reviewer` found two P2 issues in COS-02 commit `4942808a742e5b5f37a83c5be751a85f44130565`: old typed test evidence can be combined with logs for a newer artifact version, and a reviewer can substitute a pending artifact while approving it. The original implementer is fixing both; no COS-02 commit has been merged.
- COS-01 remains provisional: complete names, rules, values and normal UI observations are still required. Issue #2 and the parent #1 must remain open; COS-14 final acceptance and COS-15 are still blocked on reference freezing.
- Both `git push origin main` and a retry with HTTP/1.1 returned `Recv failure: Connection was reset`. A bounded connectivity check reached `api.github.com` but timed out on `github.com`. Local reviewed commits are retained; do not force-push or rebuild task branches.
- Push the verified commits when connectivity recovers, then comment on and close #6 with its reviewed/merge commits and results, and update `docs/specs/github-issues.json`. Issue states in that mapping remain unchanged until remote synchronization succeeds.
- After COS-02 approval, merge its exact reviewed commit, run the combined tests and affected type/build checks, update this record, and continue dependency-ready tasks.
