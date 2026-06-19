import type { RunContext, RunResult, Runner } from "../types";

/**
 * A scripted developer behaviour for a single attempt. Behaviours use the
 * `RunContext` exactly as the real runner does — emitting progress, honouring
 * the abort `signal`, and flagging out-of-scope work — so the eval exercises
 * the genuine orchestration paths, just without a network call.
 */
export type FakeBehavior = (ctx: RunContext) => Promise<RunResult>;

/**
 * Map of task id → behaviour(s). A list runs one behaviour per attempt (the
 * last entry repeats for further attempts); a single behaviour applies to
 * every attempt.
 */
export type FakeScript = Record<string, FakeBehavior[] | FakeBehavior>;

export class FakeRunner implements Runner {
  /**
   * @param script   per-task behaviour(s).
   * @param fallback behaviour for task ids not in the script — used so that
   *   supervisor-dispatched fix-tasks (whose ids are derived at runtime) resolve
   *   without the eval having to predict their names. Omit to keep the strict
   *   "unknown id throws" behaviour.
   */
  constructor(
    private readonly script: FakeScript,
    private readonly fallback?: FakeBehavior,
  ) {}

  async run(ctx: RunContext): Promise<RunResult> {
    const entry = this.script[ctx.task.id] ?? this.fallback;
    if (!entry) {
      throw new Error(`FakeRunner: no behaviour scripted for task "${ctx.task.id}"`);
    }
    const behaviors = Array.isArray(entry) ? entry : [entry];
    const index = Math.min(ctx.attempt - 1, behaviors.length - 1);
    const behavior = behaviors[index]!;
    return behavior(ctx);
  }
}

// --- Behaviour builders ----------------------------------------------------

/** Reports progress, then completes successfully. */
export const completes =
  (summary = "task complete"): FakeBehavior =>
  async (ctx) => {
    ctx.report("starting work");
    ctx.report("work finished");
    return { status: "completed", summary };
  };

/** Returns a failed result (the supervisor will retry, then escalate). */
export const fails =
  (summary = "developer hit an unrecoverable error"): FakeBehavior =>
  async () => ({ status: "failed", summary });

/**
 * Hangs forever, settling only when the supervisor's timeout aborts the
 * `signal`. This is how the eval triggers the real timeout path.
 */
export const hangs =
  (): FakeBehavior =>
  (ctx) =>
    new Promise<RunResult>((_, reject) => {
      const abort = () => reject(new Error("aborted by supervisor timeout"));
      if (ctx.signal.aborted) abort();
      else ctx.signal.addEventListener("abort", abort, { once: true });
    });

/**
 * Detects the task wants work outside its fixed scope, flags it back up the
 * bus, and returns `out_of_scope` instead of doing it.
 */
export const refusesOutOfScope =
  (requestedPath: string): FakeBehavior =>
  async (ctx) => {
    ctx.flagOutOfScope(requestedPath, ctx.task.scope);
    return {
      status: "out_of_scope",
      summary: `refused: "${requestedPath}" is outside the assigned scope`,
    };
  };
