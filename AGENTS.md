# Cosmos working rules

## File encoding

- Read and write all text files using UTF-8.
- Do not change existing encoding without the user's explicit request.
- Before editing, detect encoding when possible. If a target is not UTF-8, stop and report before changing it.
- Preserve Chinese comments, strings and documents unless the task explicitly changes them.
- Prefer minimal patches, keep surrounding style and line endings, and re-open edited files to check non-English text.

## Development workflow

- Each implementation task has a dedicated implementer and an independent reviewer with separate context.
- Each batch has one merger. Only that merger integrates reviewed task commits into `main` and pushes the batch.
- Implementers work on separate branches and managed worktrees. They commit their own changes and report the exact SHA, test evidence and known gaps.
- Reviewers inspect the actual diff, first for spec compliance and then code quality. They do not replace review with the author's summary or rewrite the implementation themselves.
- Fix actionable review findings in the implementer's branch, then review the affected changes again.
- The merger checks approved SHAs, combines them, runs integration checks appropriate to the changes and records the merge outcome.
- Reuse passing evidence until code, environment, dependencies or requirements materially change. Keep later verification focused on the affected behavior.
- Continue authorized work across batches. Ask only for missing decisions or external prerequisites that actually block the remaining work.

## Project scope and budgets

- Read `CONTEXT.md`, `docs/specs/cosmos-spec.md` and the relevant task card in `docs/specs/cosmos-issues.md`.
- GitHub task IDs and dependencies are in `docs/specs/github-issues.json`.
- Paid capability validation shares one ¥150 total ledger. Prior direct API probes reserve a conservative ¥0.721771 of that total.
- Formal game generation has a ¥200 / 12h hard cap. ¥100 / 6h is an optimization target.
- Never put API keys in files, generated games, task descriptions, Git commits or logs.
- The installed reference game at `C:\Program Files (x86)\PlantsVsZombies` is read-only. Do not copy its artwork or audio into generated game assets.
- Platform implementation and runtime game generation are distinct. A hand-written reference game is not evidence that Cosmos generated it.
