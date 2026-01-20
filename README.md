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

## Cursor CLI auth

The CLI uses your existing Cursor account. Log in once:

```bash
cursor-agent login
```

Or set an API key:

```bash
export CURSOR_API_KEY="..."
```

## Notes

- `ralph run` uses Cursor Agent print mode and enables `--force` by default so file edits are allowed.
- Prompt templates live in `templates/` and are copied by `ralph init`.
- Override the cursor CLI command via `--cursor-cmd` or `RALPH_CURSOR_CMD`.
