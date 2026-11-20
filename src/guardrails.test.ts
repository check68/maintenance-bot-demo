import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GUARDRAILS,
  canOpenPullRequest,
  countChangedLines,
  isServiceAllowed,
  lockfileDiffAllowed,
} from './guardrails.ts';

test('allows one PR per run', () => {
  assert.equal(canOpenPullRequest({ prsOpened: 0, consecutiveRedCi: 0 }).ok, true);
  const second = canOpenPullRequest({ prsOpened: 1, consecutiveRedCi: 0 });
  assert.equal(second.ok, false);
});

test('stops after two consecutive red CI runs instead of retrying', () => {
  const first = canOpenPullRequest({ prsOpened: 0, consecutiveRedCi: 1 });
  assert.equal(first.ok, true);

  const second = canOpenPullRequest({ prsOpened: 0, consecutiveRedCi: 2 });
  assert.equal(second.ok, false);
  if (!second.ok) assert.match(second.reason, /red 2 runs in a row/);
});

test('keeps the bot inside the service allowlist', () => {
  assert.equal(isServiceAllowed('api'), true);
  assert.equal(isServiceAllowed('worker'), true);
  assert.equal(isServiceAllowed('billing-prod'), false);
});

test('caps the package-lock diff', () => {
  const small = [
    '--- a/package-lock.json',
    '+++ b/package-lock.json',
    '+  "undici": "^7.2.0",',
    '-  "undici": "^7.1.0",',
  ].join('\n');

  assert.equal(countChangedLines(small), 2);
  assert.equal(lockfileDiffAllowed(small).ok, true);

  const large = Array.from({ length: 50 }, (_, index) => `+line-${index}`).join('\n');
  const decision = lockfileDiffAllowed(large);
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.match(decision.reason, /cap 40/);
});

test('default config is conservative', () => {
  assert.equal(DEFAULT_GUARDRAILS.maxPrsPerRun, 1);
  assert.equal(DEFAULT_GUARDRAILS.consecutiveRedCiLimit, 2);
  assert.equal(DEFAULT_GUARDRAILS.maxLockfileDiffLines, 40);
});