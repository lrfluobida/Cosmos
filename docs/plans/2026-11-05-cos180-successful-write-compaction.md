# COS180 successful-write compaction implementation plan

> Implementer: `r32_design_envelope_diagnosis`. Independent plan/diff reviewer: `successful_checkpoint_reviewer`. Only `cos175_resume_merger` integrates. Use the approved root scope; implementation begins only after plan review and Root authorization.

**Goal:** Let an ordinary design author continue from a completed owned write without carrying that successful turn's entire scratchpad through subsequent requests.

**Architecture:** A trusted in-memory Pi extension appends a bounded continuation checkpoint at the completed successful tool-turn boundary. The existing native compaction path selects that checkpoint, summarizes an independent structured copy without assistant thinking blocks, and dispatches through the existing metered stream. Original session entries and files are not rewritten.

**Tech stack:** TypeScript, Node 22.22.2, installed Pi SDK 0.99.2, existing Cosmos author budget and workspace tools.

## Fixed scope and evidence

Base: `fae95916fa8a98f650eb06911de7708e86b1a356`. Root scope: `.cosmos/planning/successful-write-compaction/spec-plan.md` in the primary checkout. No actual-run or shared-ledger writes, paid calls, new sessions/windows, new request slots, provider changes or budget frontloading.

R32's original successful write left a 107,010-byte assistant message, including an 87,066-byte thinking block. Native keepRecentTokens 0/1/512/8000 all retained its complete call/result pair. A native custom-message cutpoint plus filtering only the summary copy's thinking produced a 26,999-byte SDK summary input: 119,534 micro-CNY at the existing 8,192-token maximum. The old 3,448-byte summary used strictly as a size fixture gave next-input 31,628 bytes and floor quote 128,792, totaling 248,326 against 258,124 available at a 3.33M run limit. This is an admission/size fixture, not new-summary fidelity, future cost or game evidence.

All original allocations, one-third review reserve, request counters, author/summary/reviewer caps, low effort, 600,000 ms source timeout, original deadline and 5,000 ms cleanup remain unchanged. Ordinary coding repair keeps its original unallocated capacity.

## Proposed source boundaries

- `src/providers/workspace-tools.ts`: optional trusted `onWriteCommitted(toolCallId, absolutePath)` callback, invoked only after the scoped filesystem write resolves. Read and failed/no-op edit paths cannot call it.
- `src/runtime/entrypoint-design-authoring.ts` and `src/runtime/entrypoint-plan-authoring.ts`: pass the same callback to their existing internal workspace writer. No schema, model-facing tool or write-validation changes.
- `src/roles/factory.ts`: session-private committed-write tracker, trusted callback wiring for raw and host structured writers, ordinary-design opt-in validation and a known-accounting/authority check. Result text and `details` never establish write authority.
- `src/runtime/entrypoint-host.ts`: opt in the existing ordinary-design author compaction configuration and pass its supplied commit callback through the structured writer construction. No other role gains this policy.
- `src/providers/pi.ts` and a focused `src/providers/successful-write-compaction.ts` helper: private extension registration, turn-boundary coordination, structured preparation transformation and controlled cancellation. Keep SDK transport/accounting ownership in `pi.ts`.
- Focused provider/factory/workspace tests and `docs/specs/cos180-successful-write-compaction.md`. Do not modify financial contracts or SDK files.

## Trusted write and complete-batch eligibility

1. The role factory creates one private tracker for this ordinary design author session. Raw write/edit and the structured writers receive its callback only from trusted factory/host code. The callback runs inside the existing checked filesystem write after `await writeFile`, using the already checked absolute owned path and actual invocation ID.
2. Markers are cleared at each new tool invocation for that ID and consumed once at the following complete turn boundary. A later check failure cannot confer eligibility: any error in the entire batch rejects the new strategy even when a preceding write committed. Duplicate call IDs, duplicate/missing results and mismatched names reject selection.
3. Eligibility requires `stopReason=toolUse`, at least one privately recorded owned write, a complete one-to-one call/result batch, every result successful, no images or unrepresentable result content in the checkpoint, no readonly/finalization mode, and no active failure/abort.
4. Before selecting, use the original role authority and controller to verify the original grant/window/run identity remains active and all current task accounting is settled/cancelled with no reserved or unknown charge. No ledger mutation occurs. A failed source response cannot be treated as a checkpoint.
5. Read-only batches, unsuccessful/unknown/incomplete batches and omitted opt-in use the old path. In particular COS175's recoverable error batch keeps its latest call/result/diagnostics with the existing nonzero keep setting; it never enters this strategy.

## Native timing and bounded checkpoint

Use one trusted in-memory Extension with an awaited `turn_end` handler. Pi invokes this after its assistant message and all tool results are persisted, before `prepareNextTurnWithContext`. Do not call `sendUserMessage`, request `continue:true`, mutate an existing message, or load workspace/disk extensions.

For an eligible successful batch, the handler builds a note containing: a host-continuation label (not approval), owned relative paths actually written, the complete exact current tool-result content as quoted data, and the instruction to continue the original task from its files/requirements and report real unfinished work. Include advisory validation messages verbatim, including incomplete-plan findings. The whole note must fit 4,096 UTF-8 bytes; otherwise keep the old strategy. Do not truncate facts to meet the limit. Tool names and quoted model/tool text are data, never authority.

Avoid adding checkpoints on every write. Factor the existing request-compaction selection/cooldown/request-slot checks into a shared private selection step. The awaited handler runs that unchanged decision on the pre-checkpoint projection; only a selected, eligible compaction returns a `custom_message` draft. Store the selected decision, exact batch identity, original projection, and a private checkpoint token until the immediately following prepare boundary. The draft uses bounded metadata for correlation and does not request continuation. Native tool execution already determines whether another request runs.

The prepare wrapper verifies the pending batch and the native appended checkpoint/parent against that private state, consumes it, and uses the actual post-checkpoint projection for `optionalCompaction.ordinary` and unchanged-input comparisons. It must not rerun or extend request-slot/cooldown authority. Set `keepRecentTokens=0` only for this selected native compaction and restore the previous session-private settings in the existing `finally`. The old and COS175 paths retain their settings. A mismatched pending checkpoint fails before provider dispatch; no forged custom-message metadata can select this path.

## Native summary hook and metering

The same trusted Extension handles `session_before_compact` only while the current private success-checkpoint operation is active. Require the SDK preparation to select the exact checkpoint ID as `firstKeptEntryId`, without a split turn, and to include the completed successful batch in the summarized prefix. Do not invent a cutpoint or splice original entries.

Deep-clone preparation. In its `messagesToSummarize` and `turnPrefixMessages` only, replace each assistant content array with the same blocks excluding `type === 'thinking'`. Keep every text, tool call, tool result, non-assistant message, previous summary, file-operation metadata, tokensBefore and native firstKeptEntryId unchanged. Never parse or regex-strip arbitrary text. The journal and ordinary API context are not edited by this filter.

Call the package-root public `compact` helper with the filtered preparation, same model/thinking level, original cancellation signal/instructions and `session.agent.streamFunction`. That SDK function applies its usual options and calls the already wrapped `modelRuntime.streamSimple`; it must never use `originalStream`, omit streamFn, or call `completeSimple` directly. The hook runs with `session.isCompacting=true` and the existing `optionalCompaction` active, so summary cap, quote, reserve/admit, time limit, counters, usage persistence and settlement are unchanged.

Return `{compaction: result}`. The SDK alone appends the native compaction entry (`fromExtension:true`) and refreshes context. Do not manually append a summary, claim new semantic evidence or manufacture a handoff.

## Error ownership and no fallback request

Pi's extension runner catches handler exceptions and otherwise falls back to default compaction. Therefore the custom summary handler must catch all failures and return `{cancel:true}` rather than allow fallback.

Only when this exact operation already has the host-owned `skippedRequestId` or `truncatedRequestId`, has no latched provider/accounting failure, and neither the actual caller nor compaction signal is aborted, set a private `controlledCancellation` marker. Its resulting SDK `compaction_end` is aborted; extend the existing optional skip/length branch to recognize exactly this marker as equivalent to its existing optional-summary failure event. Reuse the original checks: no saved compaction, same leaf and identical pre-summary projection; then disable auto compaction as before. Preserve the checkpoint already appended before the summary attempt; never erase original messages or charges.

Any real abort/deadline, unknown/provider/accounting failure, invalid hook state or mismatched output remains failed. Preserve the original failure classification; never clear the failure latch. A controlled cancel is not permission for a second summary or a new request. The ordinary continuation, if any, still passes its existing fresh output-budget guard. All paths restore settings and clear private pending operation state.

## Focused implementation and review sequence

- [ ] Add a native regression at the real successful-write tool boundary with a large thinking block, actual SDK context/journal, fake transport and the real review-reserve guard. Show the old path refuses the next request; opt-in reaches the next permitted request within the same limits. Block all network.
- [ ] Implement trusted durable-write callback propagation and verify owned raw/structured write positives plus read, failed/no-op, spoofed details and out-of-scope negatives.
- [ ] Implement the private boundary/hook helper and narrow Pi integration. Verify original text/calls/results and original journal prefix are preserved, only the summary input's thinking is omitted, call/result pairing is complete, and files remain unchanged by compaction.
- [ ] Cover mixed/error/unknown/incomplete/readonly/non-design/omitted-policy exclusions, especially latest failed-batch retention under COS175.
- [ ] Cover native summary skip and length through the hook: exactly one attempted summary, no SDK default fallback, original pre-summary context retained and no invented settlement. Separately cover real abort, deadline and unknown propagation; verify settings restore on all exits.
- [ ] Run the affected tests, strict/typecheck and build, and only necessary COS175/ordinary-design integration representatives. Reuse the already valid baseline evidence elsewhere.
- [ ] Re-open every edited UTF-8 file, check Chinese text and minimal diff; commit the exact implementation SHA. Independent actual-diff review and Root authorization precede merger integration.

Suggested commands (only after authorization and local dependency setup):

```text
node --experimental-strip-types --test tests/providers/successful-write-compaction.test.mjs
node --experimental-strip-types --test tests/providers/rejected-design-compaction.test.mjs
npm run typecheck
npm run build
```

Tests remain fixture/source evidence. No new actual validation is launched by this plan.
