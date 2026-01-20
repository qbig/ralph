## Build & Run

- Install: `bun install`
- Run CLI: `bun run ralph <command>`
- Initialize ralph files: `bun run ralph init`
- Run loop: `bun run ralph run --mode build --max 1`

## Validation

- Tests: none
- Typecheck: none
- Lint: none

## Operational Notes

- Requires Cursor CLI (`cursor-agent`) installed and authenticated.
- Headless runs use `--force` by default; pass `--no-force` for read-only runs.

### Codebase Patterns

- Templates live in `templates/` and are copied by `ralph init`.
- CLI entrypoint: `bin/ralph.js` (Bun).
