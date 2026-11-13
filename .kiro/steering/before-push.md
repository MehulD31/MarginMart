# Before every push: run what CI runs (owner, 13 Nov 2026)

CI (`.github/workflows/ci.yml`) runs `npm run lint`, `npm run build` and `npm test` on the whole repo, and a failure goes to the Telegram group
("CI fail hua"). On 12-13 Nov that fired 6 times because only parts were checked before pushing (`eslint src`, `eslint api scripts/ops`,
`vitest`), and a lint error sat in `tests/eds/delete.spec.ts`.

- Before `git push`, run all three, exactly as CI does: `npm run lint`, `npm run build`, `npm test`. Push only when all pass.
- After pushing, check the CI run: `gh run list --workflow=ci.yml --limit 1`. If it fails, fix it at once.
