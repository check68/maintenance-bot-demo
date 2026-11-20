import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planNextAction } from './maintenance.ts';

test('plans a test-first PR for a CI failure on an allowlisted service', () => {
  const plan = planNextAction(
    { service: 'api', trigger: 'ci' },
    { prsOpened: 0, consecutiveRedCi: 0 },
  );

  assert.equal(plan.action, 'open-pr');
  assert.match(plan.reason, /failing test first/);
});

test('skips services outside the allowlist', () => {
  const plan = planNextAction(
    { service: 'billing-prod', trigger: 'sentry' },
    { prsOpened: 0, consecutiveRedCi: 0 },
  );

  assert.equal(plan.action, 'skip');
});

test('stops on a wide dependency diff instead of chasing the tree', () => {
  const wideDiff = Array.from({ length: 120 }, (_, index) => `+dep-${index}`).join('\n');

  const plan = planNextAction(
    { service: 'api', trigger: 'dependency', lockfileDiff: wideDiff },
    { prsOpened: 0, consecutiveRedCi: 0 },
  );

  assert.equal(plan.action, 'stop');
  assert.match(plan.reason, /package-lock/);
});

test('opens the PR when the dependency diff is small', () => {
  const plan = planNextAction(
    {
      service: 'api',
      trigger: 'dependency',
      lockfileDiff: '+  "undici": "^7.2.0",\n-  "undici": "^7.1.0",',
    },
    { prsOpened: 0, consecutiveRedCi: 0 },
  );

  assert.equal(plan.action, 'open-pr');
});

test('stops when CI has been red twice', () => {
  const plan = planNextAction(
    { service: 'api', trigger: 'ci' },
    { prsOpened: 0, consecutiveRedCi: 2 },
  );

  assert.equal(plan.action, 'stop');
});