import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HttpError,
  errorCodeChain,
  isRetryable,
  withRetry,
} from './retry.ts';

const noSleep = async (): Promise<void> => {};

function wrappedReset(): Error {
  return Object.assign(new TypeError('fetch failed'), {
    cause: { code: 'ECONNRESET' },
  });
}

test('retries when fetch wraps ECONNRESET in the cause chain', async () => {
  let calls = 0;

  const result = await withRetry(
    async () => {
      calls += 1;
      if (calls === 1) throw wrappedReset();
      return 'ok';
    },
    { attempts: 2, sleep: noSleep },
  );

  assert.equal(result, 'ok');
  assert.equal(calls, 2);
});

test('stops after the configured attempts and rethrows the last error', async () => {
  let calls = 0;

  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw wrappedReset();
      },
      { attempts: 3, sleep: noSleep },
    ),
    /fetch failed/,
  );

  assert.equal(calls, 3);
});

test('does not retry a 400', async () => {
  let calls = 0;

  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw new HttpError('bad request', 400);
      },
      { attempts: 3, sleep: noSleep },
    ),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );

  assert.equal(calls, 1);
});

test('retries a 503 and returns the next successful value', async () => {
  let calls = 0;

  const value = await withRetry(
    async () => {
      calls += 1;
      if (calls === 1) throw new HttpError('upstream unavailable', 503);
      return 42;
    },
    { attempts: 2, sleep: noSleep },
  );

  assert.equal(value, 42);
  assert.equal(calls, 2);
});

test('aborts before the first attempt when the signal is already aborted', async () => {
  const controller = new AbortController();
  controller.abort(new Error('stop'));

  let calls = 0;

  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        return 'never';
      },
      { signal: controller.signal, sleep: noSleep },
    ),
    /stop/,
  );

  assert.equal(calls, 0);
});

test('exposes the cause chain and classifies retryable errors', () => {
  assert.deepEqual(errorCodeChain(wrappedReset()), ['ECONNRESET']);
  assert.equal(isRetryable(wrappedReset()), true);
  assert.equal(isRetryable(new HttpError('nope', 404)), false);
  assert.equal(isRetryable(new HttpError('too many', 429)), true);
});