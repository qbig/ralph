# ralph (Cursor CLI)

Local CLI that runs a ralph-style Plan & Build loop using Cursor Agent in print mode.

See also: https://github.com/snwfdhmp/awesome-ralph

## Why & rationale

Ralph exists to make long-running agent work predictable and resumable. It separates planning from building, keeps requirements and progress in simple Markdown files, and repeats small, verifiable iterations until the work is done.

Under the hood it:
- Creates a dedicated plan branch when planning starts.
- Uses `PRD.md` as the source of truth for requirements and `PROGRESS.md` as the progress tracker.
- Runs Cursor Agent headlessly in a loop, updating progress every iteration.
- Auto-commits after each iteration so work is durable and restartable.
- Stops automatically when `PROGRESS.md` contains `DONE` and all checklist items are checked.

## Requirements

- Bun (preferred runtime)
- Cursor CLI (`cursor-agent`) installed and authenticated with your existing Cursor account
- git (required for plan/build branch workflow)

## Quickstart

```bash
bun install
bun run ralph init
bun run ralph loop
```

## Workflow: Plan & Build

### Plan mode

- Always creates and checks out a new plan branch.
- Uses the plan skill to generate/update `PRD.md` and initialize `PROGRESS.md`.
- Marks `PRD.md` as ready by setting `Status: ready`.

```bash
bun run ralph run --mode plan
```

Optional branch name:

```bash
bun run ralph run --mode plan --plan-branch ralph/plan-my-feature
```

### Build mode

- Reads `PRD.md` and `PROGRESS.md` at the start of every iteration.
- Continues on the plan branch created earlier (auto-switches to it if needed and the worktree is clean).
- Completes one self-contained part of the work and updates `PROGRESS.md` every iteration.
- Stops automatically when `PROGRESS.md` contains a line `DONE` and all checklist items are checked.
- Auto-commits after each iteration when there are changes.

```bash
bun run ralph run --mode build
```

## Recommended entrypoint: `ralph loop`

Runs plan once, then loops build until done:

```bash
bun run ralph loop
```

Plan only runs if `PRD.md` is missing or not marked `Status: ready`.

Limit build iterations or runtime:

```bash
bun run ralph loop --max 5
bun run ralph loop --max-minutes 60
bun run ralph loop --sleep 10
```

Control plan iterations (default 1):

```bash
bun run ralph loop --plan-max 1
```

## Commands and output

### `ralph init`

Creates the standard ralph loop files in the target directory:

- `AGENTS.md`
- `PRD.md`
- `PROGRESS.md`
- `PROMPT_build.md`
- `PROMPT_plan.md`

Example output:

```
write AGENTS.md
write PRD.md
write PROGRESS.md
write PROMPT_build.md
write PROMPT_plan.md
```

If files already exist, it prints `skip <file>` unless `--force` is used (then it prints `overwrite <file>`).

### `ralph run`

Runs a single mode (plan or build). It prints a banner, streams Cursor Agent output, and prints a loop marker after each iteration.

### `ralph loop`

Runs plan, then build until done. Useful for long-running autonomous loops.

### `ralph status`

Shows current branch, plan branch, PRD/PROGRESS presence, progress status, and last run state.

## Progress tracking (done detection)

`PROGRESS.md` must include an explicit `DONE` line and all checklist items must be checked. For example:

```
DONE
- [x] Requirement A
- [x] Requirement B
```

## Branches and worktrees

- Plan mode always creates a new branch; use `--plan-branch` to name it.
- Build mode will continue on the latest plan branch if recorded.
- If your working tree has uncommitted changes, ralph will refuse to switch branches.
- If you need isolation, create a git worktree yourself and run `ralph` inside it.

## Logs and state

- Loop state is recorded under `.git/ralph/state.json` (or `.ralph/state.json` if not in git).
- Run logs (JSONL) default to `.git/ralph/loop.log` when building or looping.
- Override log output with `--log-file <path>`.

## Cursor CLI auth

The CLI uses your existing Cursor account. Log in once:

```bash
cursor-agent login
```

Or set an API key:

```bash
export CURSOR_API_KEY="..."
```

## Tests

```bash
bun test
```

## Notes

- `ralph run` uses Cursor Agent print mode and enables `--force` by default so file edits are allowed.
- Prompt templates live in `templates/` and are copied by `ralph init`.
- Override the cursor CLI command via `--cursor-cmd` or `RALPH_CURSOR_CMD`.
- Build/loop auto-commits each iteration if there are changes.
