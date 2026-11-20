export type SleepFn = (ms: number, signal?: AbortSignal) => Promise<void>;

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  sleep?: SleepFn;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * Network failures surface wrapped: undici reports "fetch failed" and puts the
 * socket error under `cause`. A retry policy that only reads `error.code`
 * silently stops retrying resets after a dependency bump changes the wrapper.
 */
const RETRYABLE_CODES: Record<string, true> = {
  ECONNRESET: true,
  ECONNREFUSED: true,
  ETIMEDOUT: true,
  EAI_AGAIN: true,
  UND_ERR_SOCKET: true,
  UND_ERR_CONNECT_TIMEOUT: true,
};

const RETRYABLE_STATUS: Record<number, true> = {
  408: true,
  429: true,
  502: true,
  503: true,
  504: true,
};

export function errorCodeChain(error: unknown, maxDepth = 5): string[] {
  const codes: string[] = [];
  let current: unknown = error;

  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (current === null || typeof current !== 'object') break;
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string') codes.push(candidate.code);
    current = candidate.cause;
  }

  return codes;
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) {
    return RETRYABLE_STATUS[error.status] === true;
  }

  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && RETRYABLE_STATUS[status] === true) {
    return true;
  }

  return errorCodeChain(error).some((code) => RETRYABLE_CODES[code] === true);
}

export function backoffDelay(attempt: number, baseDelayMs = 200, maxDelayMs = 5_000): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitter = 0.9 + Math.random() * 0.2;
  return Math.round(Math.min(maxDelayMs, exponential * jitter));
}

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();

  if (signal?.aborted) {
    reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
    return promise;
  }

  let timer: NodeJS.Timeout;
  const onAbort = (): void => {
    clearTimeout(timer);
    reject(signal?.reason instanceof Error ? signal.reason : new Error('aborted'));
  };

  timer = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, ms);

  signal?.addEventListener('abort', onAbort, { once: true });
  return promise;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const sleep = options.sleep ?? defaultSleep;
  const baseDelayMs = options.baseDelayMs ?? 200;
  const maxDelayMs = options.maxDelayMs ?? 5_000;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error ? options.signal.reason : new Error('aborted');
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const finalAttempt = attempt === attempts;
      if (!isRetryable(error) || finalAttempt) throw error;

      const delayMs = backoffDelay(attempt, baseDelayMs, maxDelayMs);
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs, options.signal);
    }
  }

  throw lastError;
}