# ralph (Cursor CLI)

Local CLI that runs a ralph-style plan/build loop using Cursor Agent in print mode.

## Requirements

- Bun (preferred runtime)
- Cursor CLI (`cursor-agent`) installed and authenticated with your existing Cursor account

## Quickstart

```bash
bun install
bun run ralph init
bun run ralph run --mode build --max 1
```

## Commands and output

### `ralph init`

Creates the standard ralph loop files in the target directory:

- `AGENTS.md`
- `IMPLEMENTATION_PLAN.md`
- `PRD.md`
- `ProgressTracker.md`
- `PROMPT_build.md`
- `PROMPT_plan.md`

Example output:

```
write AGENTS.md
write IMPLEMENTATION_PLAN.md
write PRD.md
write ProgressTracker.md
write PROMPT_build.md
write PROMPT_plan.md
```

If files already exist, it prints `skip <file>` unless `--force` is used (then it prints `overwrite <file>`).

### `ralph run` (what happens each iteration)

Each iteration does the following:

1) Selects a prompt file (`PROMPT_build.md` or `PROMPT_plan.md`, unless `--prompt-file` is provided).
2) Reads that prompt and sends it to Cursor Agent in print mode.
3) Streams Cursor Agent output to the terminal.
4) Prints a loop marker like `==== LOOP 1 ====`, then repeats until `--max` is reached.

Markdown updates happen only if the agent edits files. The CLI itself does not rewrite or update your markdowns.

### `ralph run` (banner + streaming output)

Runs the loop using the selected prompt file (default: `PROMPT_build.md`). It prints a banner, then streams Cursor Agent output, then prints a loop marker after each iteration.

Example banner + loop marker:

```
------------------------------
Mode:   build
Prompt: PROMPT_build.md
Cursor: cursor-agent
Format: stream-json
Force:  enabled
Max:    1 iterations
------------------------------
<cursor-agent output>

==== LOOP 1 ====
```

The actual model output is whatever Cursor Agent emits based on `--output-format`.

### `ralph` (no subcommand)

Defaults to `ralph run` and accepts the same positional form:

```
ralph plan 3
```

## Modes

### Plan mode

Uses `PROMPT_plan.md`. The prompt tells the agent to analyze and update `IMPLEMENTATION_PLAN.md` only (no code changes).

Examples:

```bash
bun run ralph run --mode plan
bun run ralph plan
bun run ralph run plan 3
```

### Build mode

Uses `PROMPT_build.md`. The prompt tells the agent to implement changes, run tests, and update `IMPLEMENTATION_PLAN.md`/`AGENTS.md` as needed.

Examples:

```bash
bun run ralph run --mode build
bun run ralph build
bun run ralph run build 5
```

## What the markdowns are for

- `PRD.md`: product requirements and success criteria.
- `ProgressTracker.md`: lightweight checklist of what has been done.
- `IMPLEMENTATION_PLAN.md`: detailed plan and work items.
- `AGENTS.md`: operational runbook (how to build/run/validate).

## Usage

Initialize ralph loop files in the current directory:

```bash
bun run ralph init
```

Run a build loop (unlimited iterations):

```bash
bun run ralph run --mode build
```

Run a plan loop with a max iteration count:

```bash
bun run ralph run plan 3
```

Disable file edits in headless mode:

```bash
bun run ralph run --no-force
```

Pass a model and output format:

```bash
bun run ralph run --model auto --output-format stream-json
```

Skip the auth check (useful for tests with a stub CLI):

```bash
bun run ralph run --skip-auth-check --cursor-cmd ./cursor-stub.js
```

## Branches and worktrees

- The CLI does not manage branches or worktrees. It runs on whatever branch you already checked out.
- If you need isolation, create a git worktree yourself and run `ralph` inside it.
- To keep all changes on one branch, add a rule in `PROMPT_build.md` like: "Do not run git checkout/branch; keep all changes on the current branch."

## Cursor Cloud Agent (handoff)

Cloud handoff is an interactive Cursor CLI feature (prefix a message with `&` to hand off to a cloud agent). `ralph run` is headless/print mode, so it does not expose cloud handoff.

Cloud agents typically work on their own branch/PR. If you need all changes on a single local branch, avoid cloud handoff and run locally.

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
