import { DeveloperAgent } from "./DeveloperAgent";
import { MessageBus } from "./messageBus";
import { type Policy, RuleBasedPolicy } from "./policy";
import type { RunLedger } from "./runLedger";
import { sleep, TimeoutError, withRetry, withTimeout } from "./reliability";
import {
  fixScope,
  type ModuleGraph,
  regressionScope,
  unitScope,
} from "./targeting";
import { PROJECT_MODULES } from "./modules.config";
import type {
  RunResult,
  Runner,
  SupervisorReport,
  Task,
  TaskRecord,
  TestKind,
  TestOutcome,
  TestRunner,
  VerificationOutcome,
} from "./types";

/**
 * Post-completion verification wiring. When present, every developer task that
 * reaches `completed` is handed to the unit + regression test agents, and any
 * failure dispatches a scoped developer fix-task until the suite is green or the
 * fix-round budget is spent. Absent → the supervisor behaves exactly as before.
 */
export interface Verification {
  /** Fast, change-targeted test agent. */
  unit: TestRunner;
  /** Broader test agent (changed modules + their dependents). */
  regression: TestRunner;
  /**
   * The paths a just-finished task changed, used to target the test run.
   * Defaults to the task's own `scope` — a sound proxy, since the developer is
   * hard-gated to edit only within scope. A real deployment can pass a git-diff
   * function here for precise targeting.
   */
  changeSet?: (task: Task) => string[] | Promise<string[]>;
  /** Module dependency graph for targeting (default: this project's `modules.config.ts`). */
  graph?: ModuleGraph;
  /** Developer fix-rounds allowed before a still-failing task is escalated. */
  maxFixRounds?: number;
}

/** Internal signal that an attempt should be retried, carrying the failing result. */
class AttemptFailedError extends Error {
  constructor(
    readonly result: RunResult,
    readonly reason: "timeout" | "failed",
  ) {
    super(result.summary);
    this.name = "AttemptFailedError";
  }
}

export interface SupervisorOptions {
  /** Share a bus across runs (defaults to a fresh one). */
  bus?: MessageBus;
  /** Decision policy for each developer report (defaults to RuleBasedPolicy). */
  policy?: Policy;
  /** Base backoff before the first retry (per-attempt growth is exponential). */
  backoffMs?: number;
  /** Injectable delay — tests pass a no-op to stay fast and deterministic. */
  sleepFn?: (ms: number) => Promise<void>;
  /** Run the test agents + fix loop after each completed task (off by default). */
  verification?: Verification;
  /**
   * How many developer lanes run at once (default 1 = sequential, order-preserving).
   * Raise it to advance N tasks with **disjoint scopes** simultaneously: each lane
   * is the full assign → verify → escalate loop pulling from the same queue. The
   * `ClaudeRunner` scope gate stops a lane from writing another lane's files, so
   * well-chosen disjoint scopes never collide. Records always settle in input order.
   */
  concurrency?: number;
  /**
   * Quality ladder: model ids cheapest-first. The supervisor starts every task on
   * the **minimal** model (`modelLadder[0]`) and escalates one rung per retry, so
   * cheap models do the easy work and only a struggling task pulls in a stronger
   * (more expensive) model. The top rung is reused once reached. Undefined → no
   * override; the runner's own single model is used for every attempt (the prior
   * behavior). This is the "minimal when it can, higher quality when it must" lever.
   */
  modelLadder?: string[];
  /**
   * Durable run ledger for resume-after-interruption. When present, each
   * top-level task's terminal outcome is recorded as it settles, and a task that
   * a prior (killed) run already settled to a done state is SKIPPED instead of
   * re-run — so a session ended early by a token/context cutoff resumes where it
   * stopped instead of re-spending from task 0. Undefined → no persistence (the
   * prior behavior). Fix-tasks are never ledgered (only top-level tasks are).
   */
  ledger?: RunLedger;
}

/**
 * The Developer Supervisor. It owns the task queue and the lifecycle of every
 * developer it spawns: assign → monitor → time out → retry (with backoff) →
 * escalate. The control loop is deterministic code so timeouts/retries are
 * enforced (not advisory) and the whole thing is testable against a fake
 * runner. Per-report judgement is delegated to a swappable `Policy`.
 */
export class SupervisorAgent {
  readonly bus: MessageBus;
  private readonly policy: Policy;
  private readonly backoffMs: number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly verification: Verification | undefined;
  private readonly concurrency: number;
  private readonly modelLadder: string[] | undefined;
  private readonly ledger: RunLedger | undefined;

  constructor(
    private readonly runner: Runner,
    options: SupervisorOptions = {},
  ) {
    this.bus = options.bus ?? new MessageBus();
    this.policy = options.policy ?? new RuleBasedPolicy();
    this.backoffMs = options.backoffMs ?? 100;
    this.sleepFn = options.sleepFn ?? sleep;
    this.verification = options.verification;
    this.concurrency = Math.max(1, options.concurrency ?? 1);
    this.modelLadder = options.modelLadder?.length ? options.modelLadder : undefined;
    this.ledger = options.ledger;
  }

  /**
   * The model for a given attempt off the quality ladder. Attempts are 1-based
   * (see `withRetry`), so attempt 1 maps to rung 0 (the minimal model) and each
   * retry climbs one rung, clamped to the top once reached. Returns undefined for
   * a non-positive attempt or when no ladder is configured, so the runner falls
   * back to its own frugal default.
   */
  private modelForAttempt(attempt: number): string | undefined {
    if (!this.modelLadder) return undefined;
    const rung = attempt - 1;
    if (rung < 0) return undefined;
    return this.modelLadder[Math.min(rung, this.modelLadder.length - 1)];
  }

  /**
   * Run a batch of tasks and return a per-task report. With `concurrency` 1 (the
   * default) tasks run one at a time in order; with N>1 up to N lanes advance
   * disjoint-scope tasks at once. Either way `records` is in input order.
   */
  async run(tasks: Task[]): Promise<SupervisorReport> {
    if (this.concurrency === 1) {
      const records: TaskRecord[] = [];
      for (const task of tasks) records.push(await this.runTask(task));
      return summarize(records);
    }

    // Bounded worker pool: each lane pulls the next index off the shared queue.
    // Writing results by index keeps `records` in input order regardless of which
    // lane finishes first.
    const records = new Array<TaskRecord>(tasks.length);
    let next = 0;
    const lane = async (): Promise<void> => {
      while (true) {
        const i = next++;
        if (i >= tasks.length) return;
        records[i] = await this.runTask(tasks[i]!);
      }
    };
    const lanes = Math.min(this.concurrency, tasks.length);
    await Promise.all(Array.from({ length: lanes }, () => lane()));
    return summarize(records);
  }

  /**
   * Run one task to a terminal dev outcome, then — if verification is wired and
   * the dev work completed — hand it to the test agents and fix loop.
   */
  private async runTask(task: Task): Promise<TaskRecord> {
    // Resume: if a prior (killed) run already settled this task to a done state,
    // skip it instead of re-spending. Only top-level tasks consult the ledger —
    // fix-tasks go straight through runAttempts.
    const prior = this.ledger?.priorOutcome(task.id);
    if (prior) {
      this.bus.publish({
        dir: "system",
        type: "note",
        taskId: task.id,
        attempt: 0,
        note: `resumed: already ${prior.status} in a prior run — skipping`,
      });
      return {
        task,
        status: prior.status,
        attempts: prior.attempts,
        escalated: prior.escalated,
        result: { status: prior.status, summary: prior.summary },
      };
    }

    const devRecord = await this.runAttempts(task);
    const record =
      !this.verification || devRecord.status !== "completed"
        ? devRecord
        : await this.verify(task, devRecord);

    // Durably record the terminal outcome so a later run can resume past it.
    this.ledger?.record({
      taskId: task.id,
      status: record.status,
      attempts: record.attempts,
      escalated: record.escalated,
      summary: record.result.summary,
    });
    return record;
  }

  /**
   * The assign → monitor → time out → retry (with backoff) → escalate loop for a
   * single task. Shared by the primary task and every dispatched fix-task.
   */
  private async runAttempts(task: Task): Promise<TaskRecord> {
    this.bus.publish({ dir: "down", type: "assign", taskId: task.id, attempt: 0, task });

    let attemptsUsed = 0;
    try {
      const result = await withRetry(
        async (attempt) => {
          attemptsUsed = attempt;
          // One fresh developer per work assignment. The supervisor never reuses
          // a developer across attempts (or tasks): the previous one is dropped
          // here and a new agent picks up the next attempt with no carried-over
          // state. Combined with runTask/verify each calling runAttempts, every
          // assignment — initial, retry, or fix-task — gets its own developer.
          const developer = new DeveloperAgent(this.bus, this.runner);
          // Pick the model off the quality ladder for this attempt: minimal first,
          // a rung higher on each retry. Announce the moment a retry buys quality.
          const model = this.modelForAttempt(attempt);
          const prevModel = this.modelForAttempt(attempt - 1);
          if (model && prevModel && model !== prevModel) {
            this.bus.publish({
              dir: "system",
              type: "quality_escalation",
              taskId: task.id,
              attempt,
              from: prevModel,
              to: model,
              nextAttempt: attempt,
            });
          }
          let r: RunResult;
          try {
            r = await withTimeout(task.timeoutMs, (signal) =>
              developer.run(task, attempt, signal, model),
            );
          } catch (err) {
            if (err instanceof TimeoutError) {
              throw new AttemptFailedError(
                { status: "failed", summary: `attempt ${attempt} timed out after ${task.timeoutMs}ms` },
                "timeout",
              );
            }
            throw new AttemptFailedError(
              { status: "failed", summary: err instanceof Error ? err.message : String(err) },
              "failed",
            );
          }
          // A returned result is terminal unless the policy says retry.
          if (this.policy.decide(r) === "retry") {
            throw new AttemptFailedError(r, "failed");
          }
          return r;
        },
        {
          maxRetries: task.maxRetries,
          backoffMs: this.backoffMs,
          sleepFn: this.sleepFn,
          shouldRetry: (err) => err instanceof AttemptFailedError,
          onRetry: (attempt, err) => {
            const reason = err instanceof AttemptFailedError ? err.reason : "failed";
            this.bus.publish({
              dir: "system",
              type: "retry",
              taskId: task.id,
              attempt,
              reason,
              nextAttempt: attempt + 1,
            });
          },
        },
      );

      if (result.status === "out_of_scope") {
        this.bus.publish({ dir: "system", type: "task_out_of_scope", taskId: task.id, attempt: attemptsUsed, result });
        return { task, status: "out_of_scope", attempts: attemptsUsed, escalated: false, result };
      }

      this.bus.publish({ dir: "system", type: "task_completed", taskId: task.id, attempt: attemptsUsed, result });
      return { task, status: "completed", attempts: attemptsUsed, escalated: false, result };
    } catch (err) {
      const result: RunResult =
        err instanceof AttemptFailedError
          ? err.result
          : { status: "failed", summary: err instanceof Error ? err.message : String(err) };
      this.bus.publish({ dir: "system", type: "escalation", taskId: task.id, attempt: attemptsUsed, reason: result.summary });
      this.bus.publish({ dir: "system", type: "task_failed", taskId: task.id, attempt: attemptsUsed, result });
      return { task, status: "failed", attempts: attemptsUsed, escalated: true, result };
    }
  }

  /**
   * Post-completion verification. Targets the test agents at what changed (so
   * untouched code is never re-scanned), runs unit then regression, and on any
   * failure dispatches a scoped developer fix-task and re-verifies — until the
   * suite is green or the fix-round budget is spent (then it escalates).
   */
  private async verify(task: Task, devRecord: TaskRecord): Promise<TaskRecord> {
    const v = this.verification!;
    const graph = v.graph ?? PROJECT_MODULES;
    const maxFixRounds = v.maxFixRounds ?? 2;

    let changed = await this.changedPathsFor(task, v);
    const runs: TestOutcome[] = [];
    let rounds = 0;

    while (true) {
      // Nothing in scope → nothing to test. Don't scan the whole app.
      if (unitScope(changed, graph).length === 0 && regressionScope(changed, graph).length === 0) {
        this.bus.publish({ dir: "system", type: "note", taskId: task.id, attempt: 0, note: "verification skipped — no changed modules in scope" });
        return { ...devRecord, verification: { status: "skipped", rounds, runs } };
      }

      const failure = await this.runTestRound(task, changed, graph, v, runs);
      if (!failure) {
        this.bus.publish({ dir: "system", type: "verified", taskId: task.id, attempt: 0, rounds });
        return { ...devRecord, verification: { status: "verified", rounds, runs } };
      }

      if (rounds >= maxFixRounds) {
        const reason = `${failure.kind} tests still failing after ${rounds} fix round(s)`;
        this.bus.publish({ dir: "system", type: "verify_exhausted", taskId: task.id, attempt: 0, rounds, reason });
        return this.finishUnverified(task, devRecord, { status: "exhausted", rounds, runs }, reason);
      }

      rounds += 1;
      const failingFiles = failure.failures.map((f) => f.file);
      this.bus.publish({ dir: "system", type: "fix_dispatched", taskId: task.id, attempt: 0, round: rounds, kind: failure.kind, failing: failingFiles });

      const fixTask = buildFixTask(task, failure, graph, rounds);
      const fixRecord = await this.runAttempts(fixTask);
      if (fixRecord.status !== "completed") {
        const reason = `fix developer could not complete (${fixRecord.status}) for round ${rounds}`;
        this.bus.publish({ dir: "system", type: "verify_exhausted", taskId: task.id, attempt: 0, rounds, reason });
        return this.finishUnverified(task, devRecord, { status: "fix_failed", rounds, runs }, reason);
      }

      // Re-target on the fix's changes too, then loop and re-verify from scratch.
      const fixChanged = await this.changedPathsFor(fixTask, v);
      changed = [...new Set([...changed, ...fixChanged])];
    }
  }

  /** Run unit then regression; return the first failing outcome, or null if both pass. */
  private async runTestRound(
    task: Task,
    changed: string[],
    graph: ModuleGraph,
    v: Verification,
    runs: TestOutcome[],
  ): Promise<TestOutcome | null> {
    const plan: Array<{ kind: TestKind; runner: TestRunner; scope: string[] }> = [
      { kind: "unit", runner: v.unit, scope: unitScope(changed, graph) },
      { kind: "regression", runner: v.regression, scope: regressionScope(changed, graph) },
    ];

    for (const { kind, runner, scope } of plan) {
      if (scope.length === 0) continue; // nothing targeted for this kind
      this.bus.publish({ dir: "system", type: "test_started", taskId: task.id, attempt: 0, kind, scope });

      let outcome: TestOutcome;
      try {
        outcome = await withTimeout(task.timeoutMs, (signal) =>
          runner.run({
            kind,
            scope,
            changedPaths: changed,
            signal,
            report: (note) => void this.bus.publish({ dir: "system", type: "note", taskId: task.id, attempt: 0, note }),
          }),
        );
      } catch (err) {
        const summary = err instanceof TimeoutError ? `${kind} tests timed out after ${task.timeoutMs}ms` : err instanceof Error ? err.message : String(err);
        outcome = { kind, passed: false, summary, failures: [], scanned: scope };
      }

      runs.push(outcome);
      this.bus.publish({ dir: "system", type: "test_result", taskId: task.id, attempt: 0, kind, passed: outcome.passed, failures: outcome.failures });
      if (!outcome.passed) return outcome;
    }
    return null;
  }

  /** Resolve the paths a task changed (configured changeSet, else its scope). */
  private async changedPathsFor(task: Task, v: Verification): Promise<string[]> {
    return v.changeSet ? await v.changeSet(task) : task.scope;
  }

  /** Override a dev-completed record to failed because verification did not pass. */
  private finishUnverified(
    task: Task,
    devRecord: TaskRecord,
    verification: VerificationOutcome,
    reason: string,
  ): TaskRecord {
    const result: RunResult = { status: "failed", summary: `verification failed: ${reason}`, detail: devRecord.result.summary };
    this.bus.publish({ dir: "system", type: "task_failed", taskId: task.id, attempt: devRecord.attempts, result });
    return { ...devRecord, status: "failed", escalated: true, result, verification };
  }
}

/** Build a scoped developer fix-task aimed at a failing test run. */
function buildFixTask(orig: Task, failure: TestOutcome, graph: ModuleGraph, round: number): Task {
  const failingFiles = failure.failures.map((f) => f.file);
  // Scope the fix at the failing files + their modules + the run's scope + the
  // original task's scope, so the developer can touch both the breakage and the
  // test, but nothing further afield.
  const scope = fixScope(failingFiles, [...orig.scope, ...failure.scanned], graph);
  const filesLine = failingFiles.length ? `Failing tests: ${failingFiles.join(", ")}.` : `Failing area: ${failure.scanned.join(", ")}.`;
  return {
    id: `${orig.id}-fix-${round}`,
    title: `fix failing ${failure.kind} tests (${orig.title})`,
    prompt: [
      `The ${failure.kind} test suite is failing after the previous change for task "${orig.title}".`,
      filesLine,
      "Investigate and make the failing tests pass by fixing the implementation.",
      "Do NOT weaken, skip, or delete tests to make them pass — fix the underlying cause.",
      "If a test itself is genuinely wrong, correct it minimally and explain why.",
      "Run the dev tools to confirm the suite is green before reporting 'completed'.",
    ].join(" "),
    scope,
    timeoutMs: orig.timeoutMs,
    maxRetries: orig.maxRetries,
  };
}

function summarize(records: TaskRecord[]): SupervisorReport {
  return {
    records,
    completed: records.filter((r) => r.status === "completed").length,
    failed: records.filter((r) => r.status === "failed").length,
    outOfScope: records.filter((r) => r.status === "out_of_scope").length,
  };
}
