## Build & Run

- Install: `bun install`
- Run CLI: `bun run ralph <command>`
- Initialize ralph files: `bun run ralph init`
- Plan loop (creates new branch): `bun run ralph run --mode plan --max 1`
- Build loop (continues on plan branch): `bun run ralph run --mode build`
- Full loop (plan then build until done): `bun run ralph loop`
- Status: `bun run ralph status`

## Validation

- Tests: `bun test`
- Typecheck: none
- Lint: none

## Operational Notes

- Requires Cursor CLI (`cursor-agent`) installed and authenticated.
- Headless runs use `--force` by default; pass `--no-force` for read-only runs.
- Plan mode updates `ralph/PRD.md`; build mode uses `ralph/PRD.md` + `ralph/PROGRESS.md` and updates `ralph/PROGRESS.md` each iteration.
- Build/loop stops when `PROGRESS.md` contains `DONE` and all checklist items are checked.
- Plan mode always creates and checks out a new branch.
- Build/loop auto-commits each iteration when there are changes.
- Ralph files live under `ralph/` by default (override via `--dir` on init or `--ralph-dir` on run/loop/status).
- Avoid manual git commits in prompts; ralph handles per-iteration commits.
- Ralph handles branch creation; do not run git commands in the agent.

### Codebase Patterns

- Templates live in `templates/` and are copied by `ralph init`.
- CLI entrypoint: `bin/ralph.js` (Bun).
