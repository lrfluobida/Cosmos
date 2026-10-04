# COS54 role input file inventory implementation plan

> **For agentic workers:** Execute in the dedicated COS54 worktree. The coordinator assigns a fresh independent reviewer for this plan and the actual diff; only the batch merger integrates approved commits.

**Goal:** Give every role an accurate frozen file catalog for its current selected input references, so the existing read tool can address actual files without guessing template or capture paths.

**Architecture:** Construct `inputFiles` in the role factory from the cloned task's inputs and interfaces, plus artifacts and evidence sources for reviewers. A metadata-only walker visits only those exact reference locations inside the role workspace, records file or directory type and sorted relative filenames, and rejects links and workspace-root references. The catalog preserves each artifact ID, fixed version and location; it neither changes raw references nor adds read authority, file contents, hashes, dependencies or proof of acceptance. Missing locations remain explicitly marked missing with no guessed files, preserving the existing factory's missing-file behavior.

**Tech stack:** TypeScript, Node filesystem metadata, existing safe-path checks, native scoped pi read tools and Node test runner. No model request, paid service, actual game or private ledger is used.

## Files

- Add `src/roles/input-files.ts`: selected-reference file metadata catalog.
- Modify `src/roles/factory.ts`: freeze catalog before session creation and explain exact file addressing in the system prompt.
- Add `tests/roles/input-files.test.ts`: author/reviewer scope, Chinese filenames, nested paths, current versions, missing references, cancellation and unsafe links/roots.
- Modify `tests/runtime/entrypoint-capture-layout.test.ts`: actual host materialization and factory catalogs for the four template configuration files, four transfer design outputs, two distinct plan roots, reviewer evidence and a newly selected capture version.

## Steps

- [x] Write actual role-factory tests that assert exact catalog identity/type/files and use the existing `read` tool to read every listed file. Author inventory excludes artifacts and evidence; reviewer inventory includes both. Broad ownership directories, unselected versions, other roles and parent locations are excluded.
- [x] Add catalog assertions to the existing synthetic host/capture regression and make the selected-v2 test call the actual factory. Assert the template has only `package.json`, `package-lock.json`, `tsconfig.json` and `vite.config.ts`; prove raw contracts, permissions, bytes, requests and ledger remain unchanged.
- [x] Run `node --experimental-strip-types --test tests/roles/input-files.test.ts tests/runtime/entrypoint-capture-layout.test.ts`; record the expected missing-catalog RED failure before production edits.
- [x] Implement the smallest selected-reference metadata walker and packet/prompt integration. File references use an empty relative suffix and are read at `location`; directory entries are read at `location + '/' + relativePath`. Never enumerate readOnlyPaths, registry parents, state/session roots or unrelated output scopes.
- [x] Run the same command for GREEN; run `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` and focused legacy role/tool tests. Broaden only for an affected regression.
- [x] Re-open edited text with strict UTF-8 decoding, verify preserved Chinese and LF, and run `git diff --check`.
- [ ] Commit the implementation and report SHA, commands, results and gaps to the coordinator for independent review. Only the merger integrates the approved SHA.

## Implementer evidence

- RED before production edits: corrected synthetic fixture setup, then the two-file command above produced 8 expected failures and 2 existing guard passes, 0 skips (12.421s). All host/current-v2 failures named the missing catalog; selected root/link enumeration also failed to reject. Earlier fixture-only setup errors were corrected before implementation and are not acceptance evidence.
- GREEN: the same two-file command passed 10/10, 0 skips (38.531s). These sessions have no model prompt or provider request; the actual host's selected references all have file/directory entries, no missing entries. Template files are exact, transfer outputs and both plan roots remain distinct, current-v2 excludes the old capture, evidence file references use their location directly, and ledger/requests/fixed bytes remain unchanged.
- Typecheck: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` exited 0 (9.627s).
- Focused legacy role, native output limit and compaction suites passed 59/59, 0 skips (6.183s), with only existing injected sessions/mock HTTP. Real scoped file reads are exercised in the new tests.
- After adding the exact unchanged `readPaths` assertions, `node --experimental-strip-types --test tests/roles/input-files.test.ts` passed 7/7, 0 skips (3.020s). Unaffected host and legacy evidence is reused.
- Re-opened all five changed files using fatal UTF-8 decoding: no BOM, LF, no replacement characters; every original non-English line in modified existing files remains exact. `git diff --check` passed.
- Independent plan/source review and merger outcome are pending. No actual native transfer success is claimed.

## Evidence limits

Synthetic source tests prove catalog accuracy and existing read authority for the tested selected references. A catalog is discovery metadata, not content verification or review approval. Existing host capture/signature/verification remains authoritative. This task does not rerun Edge, alter stopped cases, spend validation funds, compile generated games or claim a later native transfer succeeded.
