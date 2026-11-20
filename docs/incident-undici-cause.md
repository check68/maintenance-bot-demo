# Incident: fetch resets stopped being retried after an undici bump

**Date:** 2026-11-12 · **Scope:** `api` service · **Impact:** intermittent 500s under
load, no data loss · **Fix:** one file + one regression test · **Merged:** same day

## What happened

CI went red on `main` right after a routine Monday dependency bump. The failing
test was an integration test that opens a connection, resets it, and expects the
client to retry once. After the bump, the retry never happened and the test saw a
hard failure instead of a second attempt.

## Root cause

`undici` started wrapping socket errors: the network failure now arrives as a
`TypeError('fetch failed')` with the original error in `cause`. The retry policy
read only `error.code`:

```ts
if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
  // retry
}
```

so a wrapped reset looked like an unknown error and was rethrown on the first
attempt.

## The fix

```diff
- if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
+ const code = err.code ?? err.cause?.code;
+ if (code === 'ECONNRESET' || code === 'ETIMEDOUT') {
```

The production version in [`src/http/retry.ts`](../src/http/retry.ts) walks the
whole `cause` chain (up to five levels) and classifies the error by code and HTTP
status.

## Regression test

The test fails on the old code and passes on the fix:

```ts
const err = Object.assign(new TypeError('fetch failed'), {
  cause: { code: 'ECONNRESET' },
});

await withRetry(fnThatFailsOnce(err), { attempts: 2, sleep: noSleep });
// asserts two attempts
```

## Why the bot stopped at one file

The wide part of the problem was the dependency itself. The bot pinned the
behaviour with a test, fixed the adapter, and left the bump in place — no attempt
to chase the rest of the tree. If CI had gone red again, the red-CI guardrail
would have stopped the run and handed it back to a human.