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
- `PROMPT_build.md`
- `PROMPT_plan.md`

Example output:

```
write AGENTS.md
write IMPLEMENTATION_PLAN.md
write PROMPT_build.md
write PROMPT_plan.md
```

If files already exist, it prints `skip <file>` unless `--force` is used (then it prints `overwrite <file>`).

### `ralph run`

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
