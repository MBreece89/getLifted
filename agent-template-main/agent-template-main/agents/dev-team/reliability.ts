/**
 * Enforced reliability primitives. These make "timeout" and "retry" real
 * behaviours of the orchestration code rather than documented intentions.
 */

/** Thrown by `withTimeout` when an attempt exceeds its wall-clock budget. */
export class TimeoutError extends Error {
  constructor(public readonly ms: number) {
    super(`operation timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn` with a hard wall-clock deadline. On timeout the provided
 * `AbortSignal` is aborted (so a well-behaved `fn` can stop work) and the
 * returned promise rejects with `TimeoutError`. An optional `linkedSignal`
 * lets a caller abort the attempt early (e.g. a parent cancellation).
 */
export async function withTimeout<T>(
  ms: number,
  fn: (signal: AbortSignal) => Promise<T>,
  linkedSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;

  return await new Promise<T>((resolve, reject) => {
    // First settlement wins; later ones (e.g. fn rejecting *because* we aborted
    // it) are ignored. Crucially we settle with TimeoutError BEFORE calling
    // abort(), so the timeout outcome is deterministic regardless of how fn
    // reacts to cancellation.
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (linkedSignal) linkedSignal.removeEventListener("abort", onLinked);
      action();
    };

    function onLinked() {
      const reason = linkedSignal?.reason ?? new Error("aborted by linked signal");
      settle(() => reject(reason));
      controller.abort(reason);
    }

    if (linkedSignal) {
      if (linkedSignal.aborted) {
        onLinked();
        return;
      }
      linkedSignal.addEventListener("abort", onLinked, { once: true });
    }

    timer = setTimeout(() => {
      const err = new TimeoutError(ms);
      settle(() => reject(err));
      controller.abort(err);
    }, ms);

    fn(controller.signal).then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    );
  });
}

export interface RetryOptions {
  /** Number of retries *after* the first attempt. Total attempts = maxRetries + 1. */
  maxRetries: number;
  /** Base backoff before the first retry. */
  backoffMs: number;
  /** Multiplier applied per retry (default 2 = exponential). */
  backoffFactor?: number;
  /** Decide whether a thrown error is retryable (default: always). */
  shouldRetry?: (error: unknown) => boolean;
  /** Called before each retry, with the just-failed attempt number and its error. */
  onRetry?: (attempt: number, error: unknown) => void;
  /** Injectable delay (tests pass a no-op to stay fast/deterministic). */
  sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Invoke `fn(attempt)` (1-based). On a retryable throw, back off and retry up
 * to `maxRetries` times; when retries are exhausted the last error propagates
 * so the caller can escalate. A value returned by `fn` is terminal — it is
 * never retried (the supervisor relies on this for completed/out-of-scope).
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    maxRetries,
    backoffMs,
    backoffFactor = 2,
    shouldRetry = () => true,
    onRetry,
    sleepFn = sleep,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt > maxRetries;
      if (isLastAttempt || !shouldRetry(error)) throw error;
      onRetry?.(attempt, error);
      await sleepFn(backoffMs * backoffFactor ** (attempt - 1));
    }
  }
  // Unreachable: the loop either returns or throws.
  throw lastError;
}
