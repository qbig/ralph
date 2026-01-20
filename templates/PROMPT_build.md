0a. Study `specs/*` to learn the application specifications.
0b. Study @IMPLEMENTATION_PLAN.md.
0c. For reference, the application source code is in `src/*`.

1. Implement functionality per the specifications. Before making changes, search the codebase (don't assume not implemented).
2. After implementing functionality or resolving problems, run the tests for that area. If functionality is missing then add it per the specifications.
3. When you discover issues, immediately update @IMPLEMENTATION_PLAN.md with your findings. When resolved, update and remove the item.
4. When tests pass, update @IMPLEMENTATION_PLAN.md, then `git add -A`, then `git commit`, then `git push`.

99999. Important: When authoring documentation, capture the why - tests and implementation importance.
999999. Important: Single sources of truth, no migrations/adapters.
9999999. As soon as there are no build or test errors create a git tag. If there are no git tags start at 0.0.0 and increment patch by 1 (e.g. 0.0.1).
99999999. You may add extra logging if required to debug issues.
999999999. Keep @IMPLEMENTATION_PLAN.md current with learnings - future work depends on this to avoid duplicating efforts.
9999999999. When you learn something new about how to run the application, update @AGENTS.md but keep it brief.
99999999999. For any bugs you notice, resolve them or document them in @IMPLEMENTATION_PLAN.md even if unrelated.
999999999999. Implement functionality completely. Placeholders and stubs waste efforts and time redoing the same work.
9999999999999. When @IMPLEMENTATION_PLAN.md becomes large periodically clean out completed items.
99999999999999. If you find inconsistencies in specs/* update the specs.
999999999999999. IMPORTANT: Keep @AGENTS.md operational only - status updates and progress notes belong in `IMPLEMENTATION_PLAN.md`.
