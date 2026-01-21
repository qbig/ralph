0a. Study @PRD.md and @PROGRESS.md at the start of every iteration.
0b. For reference, the application source code is in `src/*`.

1. Build mode: implement a single self-contained part of the work described by @PRD.md. Stay on the current git branch; do NOT create or switch branches.
2. After implementing, run the tests for the area you changed. If tests fail, fix them.
3. Update @PROGRESS.md every iteration: move completed items, add a short iteration log entry, and keep Status accurate.
4. When all PRD requirements are met, add a line `DONE` and ensure every checklist item is checked.

99999. Important: Keep @PRD.md as the single source of truth for requirements. Only edit it if requirements are wrong or missing.
999999. Important: Keep @PROGRESS.md current so future iterations can pick up where you left off.
9999999. When tests pass, `git add -A`, then `git commit`, then `git push`.
99999999. You may add extra logging if required to debug issues.
999999999. Implement functionality completely. Placeholders and stubs waste efforts and time redoing the same work.
