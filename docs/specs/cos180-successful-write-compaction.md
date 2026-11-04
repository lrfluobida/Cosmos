# COS180: successful-write native compaction

Status: implementation prepared for independent source review; no new actual validation or game-success claim.

Base: `fae95916fa8a98f650eb06911de7708e86b1a356`. The concrete [implementation plan](../plans/2026-11-05-cos180-successful-write-compaction.md) was independently approved at `6398d7000a58d69d8fcf3108c0e763a7954447c3`, then Root authorized implementation. The sole merger remains `cos175_resume_merger`.

## Problem and resulting behavior

R32 saved its design normally but retained the last complete assistant/tool-result pair after native compaction. That assistant message contained 87,066 bytes of thinking. The next 139,111-byte input and 8,192-token output floor needed 343,758 micro-CNY against 293,808 available to the author. The actual run remained incomplete; this source change does not reopen or change it.

The ordinary design host now opts in to a successful-write checkpoint. A scoped filesystem completion callback, not a tool name or returned text, proves that an owned write actually completed. The native `turn_end` boundary must contain a complete, all-success call/result batch and known settled accounting under the original authority. A bounded host continuation note preserves the actual written paths and exact tool-result content, including unfinished-work diagnostics. It is not user approval, accepted output or a new task.

Only when the existing compaction policy selects that boundary does an in-memory trusted extension append the native checkpoint. The original native journal prefix stays intact. Native compaction selects the checkpoint with a temporary zero-token retained tail, then summarizes a deep copy of its preparation with only assistant `thinking` blocks omitted. Text, calls, results, file-operation metadata and original files remain unchanged. The public SDK compact helper uses the session's existing stream function and therefore the original metered ModelRuntime path.

## Preserved boundaries

- Original allocations and unallocated coding-repair capacity, one-third independent-review reserve, output caps, request counts, low effort, 600,000 ms source timeout and original deadline/cleanup remain unchanged.
- Error, mixed, unknown, incomplete, read-only and untrusted/spoofed batches do not select the new checkpoint. COS175 continues retaining its latest rejected call, result and diagnostics.
- Notes above 4,096 UTF-8 bytes or containing non-text results fall back to the prior strategy rather than truncate current facts.
- No disk extensions, workspace packages, global settings, provider routes or model-facing tools are enabled. Temporary native compaction settings are restored on exit.
- The SDK custom hook returns an explicit cancellation on failure so its swallowed-exception behavior cannot dispatch a second default summary. Only the current operation's known optional skip/settled-length cancellation can preserve the original pre-summary context; real aborts, unknown usage, provider/accounting failures and authority failures remain failures.

## Verification evidence

The primary native regression first failed with `author_review_reserve` on the original implementation. With the policy enabled, the same 749,250 micro-CNY design allocation and 249,750 reserve permits one charged native summary and the next ordinary request. The fake provider charges the entire summary reservation; feasibility does not rely on an unusually cheap summary. The fixture's summary input is 21,182 bytes and next input 9,781 bytes. Original journal prefix, saved file bytes and observable summary content are checked directly.

The focused new file covers 19 distinct checks: native success and legacy refusal; structured writer diagnostics and a complete multi-tool success batch; combined COS175 selection retaining its latest trusted rejected batch; read/error/mixed/spoofed/unknown/read-only/authority-error exclusions; skip/length/abort/summary-unknown with no second summary; incomplete/duplicate/oversized batches and clone-only filtering; actual write/edit/plan callback ownership; and ordinary-design-only configuration. The four cancellation cases were repeated after narrowing the controlled cancellation signal check; repeated checks are not additional distinct coverage.

Three affected COS175 native representatives pass: trusted preserved-draft rejection, mixed errors and omitted selection. Production typecheck and build pass. Tests use local temporary workspaces, synthetic provider responses and disabled network. Existing unrelated evidence is reused.

The separate R32 projection calculation used its old 3,448-byte summary only as a size fixture. Neither that calculation nor these tests establish the content or length of a future summary, successful completion of the acceptance plan, independent design approval, downstream game generation or user experience acceptance. Every actual next request remains subject to the unchanged admission guard.
