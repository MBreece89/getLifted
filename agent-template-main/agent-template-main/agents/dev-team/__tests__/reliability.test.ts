import { describe, expect, it, vi } from "vitest";
import { TimeoutError, withRetry, withTimeout } from "../reliability";

const noSleep = async () => {};

describe("withTimeout", () => {
  it("resolves when the operation finishes within the budget", async () => {
    const value = await withTimeout(1000, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 42;
    });
    expect(value).toBe(42);
  });

  it("rejects with TimeoutError and aborts the signal when the budget is exceeded", async () => {
    let abortedReason: unknown;
    const run = withTimeout(20, (signal) =>
      new Promise<never>((_, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            abortedReason = signal.reason;
            reject(new Error("aborted"));
          },
          { once: true },
        );
      }),
    );
    await expect(run).rejects.toBeInstanceOf(TimeoutError);
    expect(abortedReason).toBeInstanceOf(TimeoutError);
  });
});

describe("withRetry", () => {
  it("returns immediately on success without retrying", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await withRetry(fn, { maxRetries: 3, backoffMs: 1, sleepFn: noSleep });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries up to maxRetries, then throws the last error", async () => {
    const fn = vi.fn(async () => {
      throw new Error("boom");
    });
    const onRetry = vi.fn();
    await expect(
      withRetry(fn, { maxRetries: 2, backoffMs: 1, sleepFn: noSleep, onRetry }),
    ).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(3); // 1 + 2 retries
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("succeeds once a later attempt stops throwing", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("not yet");
        return attempts;
      },
      { maxRetries: 5, backoffMs: 1, sleepFn: noSleep },
    );
    expect(result).toBe(3);
  });

  it("does not retry when shouldRetry returns false", async () => {
    const fn = vi.fn(async () => {
      throw new Error("fatal");
    });
    await expect(
      withRetry(fn, { maxRetries: 5, backoffMs: 1, sleepFn: noSleep, shouldRetry: () => false }),
    ).rejects.toThrow("fatal");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
