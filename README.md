# maintenance-bot-demo

Sanitized demo of an unattended repo-maintenance loop for a small TypeScript service.
The bot picks up a CI or Sentry failure, reproduces it on a branch, opens a
**test-first** pull request, and stops when the guardrails say stop.

No business logic and no production code: only the parts that decide *whether* the
bot may act, and the failure it handled most recently.

## What is in here

```
src/
  http/retry.ts            retry policy that unwraps `error.cause` chains
  http/retry.test.ts       regression coverage for the wrapped-reset bug
  guardrails.ts            PR caps, lockfile cap, CI stop rule, allowlist
  guardrails.test.ts
  bot/maintenance.ts       planner: open a PR, skip, or stop
  bot/maintenance.test.ts
.github/workflows/
  ci.yml                   typecheck + tests on every push
  dependency-bump.yml      Mondays: one package per PR, revert on red
.gitea/workflows/ci.yml    the same CI mirrored for Gitea Actions
scripts/
  plan-bump.mjs            picks exactly one outdated package
  check-lockfile.mjs       rejects wide package-lock diffs before a PR
docs/
  incident-undici-cause.md write-up of the failure this setup came from
```

## The failure it handled

After an `undici` minor bump, CI went red: fetch errors arrived wrapped, so the
retry wrapper that checked `err.code` stopped seeing `ECONNRESET` and resets were
no longer retried. The bot reproduced it with a test that fails on the old code,
then fixed it — one file, one test, green PR, merged the same day.

Full write-up: [`docs/incident-undici-cause.md`](docs/incident-undici-cause.md).

## Guardrails

| Rule | Value | Why |
| --- | --- | --- |
| PRs per run | 1 | one branch, one reviewable change |
| Packages per dependency PR | 1 | no tree sweeps |
| `package-lock.json` diff | max 40 lines | wide diff = revert, not investigate |
| Consecutive red CI | 2 | stop and ping a human, no retry loops |
| Services | allowlist | the bot never touches anything else |

The rules live in [`src/guardrails.ts`](src/guardrails.ts) and are enforced both
by the planner and by `scripts/check-lockfile.mjs` in the workflow.

## Run it locally

```bash
npm ci
npm run typecheck
npm test
```

Requires Node 22.18+ (tests run the TypeScript sources directly via type
stripping, so there is no build step).

## How the loop is wired

1. CI or Sentry emits a failure event.
2. The planner checks the allowlist, the PR budget and the red-CI counter.
3. On an allowed job, the bot creates a branch, writes a failing test, reproduces
   the failure, adds the fix, and opens a PR that links the incident.
4. If CI is red twice in a row, or the lockfile diff exceeds the cap, the bot
   stops and comments on the issue instead of continuing.

The GitHub and Gitea workflows are the same file, mirrored in `.github` and
`.gitea`; Gitea Actions reads its copy the same way GitHub reads its own.