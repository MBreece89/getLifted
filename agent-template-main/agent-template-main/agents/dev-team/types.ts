/**
 * Shared contracts for the Developer Supervisor + Developer agent process.
 *
 * The whole harness is built around two roles:
 *  - a Supervisor that assigns, monitors, times out, retries, and escalates;
 *  - a Developer that works exactly one fixed-scope task and reports back.
 *
 * Everything here is transport-agnostic: the same types describe both the
 * deterministic `FakeRunner` (used by the eval) and the real `ClaudeRunner`
 * (which drives `@anthropic-ai/claude-agent-sdk`).
 */

/** Terminal outcome of a single developer run attempt. */
export type RunStatus = "completed" | "failed" | "out_of_scope";

/** One unit of work handed to a single developer. Its scope never changes. */
export interface Task {
  id: string;
  title: string;
  /** The instruction the developer works against. */
  prompt: string;
  /**
   * The only paths/areas this developer is allowed to touch. Entries are path
   * prefixes relative to the repo root (e.g. "agents/dev-team/types.ts" or
   * "apps/api/"). Work outside this set must be flagged, never performed.
   */
  scope: string[];
  /** Wall-clock budget for a single attempt before the supervisor aborts it. */
  timeoutMs: number;
  /** How many times the supervisor retries on timeout/failure before escalating. */
  maxRetries: number;
}

/** Structured report a developer returns for one attempt. */
export interface RunResult {
  status: RunStatus;
  summary: string;
  detail?: string;
  /**
   * True when the attempt ended because it hit a turn/budget ceiling (the SDK's
   * `error_max_turns` / `error_max_budget_usd`) rather than failing on its own
   * merits — i.e. it ran out of room, not out of ideas. Lets the supervisor and
   * any observers tell "needs continuation" apart from "genuinely broken".
   */
  endedEarly?: boolean;
}

// --- Test agents ----------------------------------------------------------

/**
 * The two test roles the supervisor runs after a developer task completes.
 *  - "unit"       — fast, narrow: only the modules that actually changed.
 *  - "regression" — broader: the changed modules plus everything that depends
 *    on them, to catch breakage the change rippled into.
 * They share one mechanism (the `devtools/dev test` dispatcher); the kind only
 * decides how wide the targeting net is cast.
 */
export type TestKind = "unit" | "regression";

/** One failing test, identified well enough to scope a fix at it. */
export interface TestFailure {
  /** Repo-relative test file (or suite path). */
  file: string;
  /** Test/spec name, when the runner could parse one. */
  name?: string;
  /** First line of the failure message, when available. */
  message?: string;
}

/** What a `TestRunner` is asked to run for one verification pass. */
export interface TestRequest {
  kind: TestKind;
  /**
   * Targeted module/path prefixes to run (the output of `targeting.ts`). Empty
   * means "nothing in scope" — the supervisor skips the run rather than scanning
   * the whole app.
   */
  scope: string[];
  /** The changed paths the targeting was derived from (for the runner's context). */
  changedPaths: string[];
  /** Aborts when the supervisor's per-run timeout fires. */
  signal: AbortSignal;
  /** Emit an interim note up to the supervisor's bus. */
  report: (note: string) => void;
}

/** Structured outcome of one test run. */
export interface TestOutcome {
  kind: TestKind;
  passed: boolean;
  summary: string;
  /** Failing tests, when the run failed (best-effort parse; may be empty). */
  failures: TestFailure[];
  /** The scope the run actually exercised (echoed back for the record/trace). */
  scanned: string[];
}

/**
 * Runs one kind of test pass over a targeted scope. Implementations:
 *  - `FakeTestRunner`  — scripted, deterministic, no process spawn (eval).
 *  - `ShellTestRunner` — shells out to `devtools/dev test <filter>` (real work).
 */
export interface TestRunner {
  run(req: TestRequest): Promise<TestOutcome>;
}

/** How a developer task's post-completion verification ended. */
export type VerificationStatus =
  /** Both test kinds passed (possibly after some fix rounds). */
  | "verified"
  /** Nothing changed, so there was nothing to test. */
  | "skipped"
  /** Tests still failed after the fix-round budget was exhausted. */
  | "exhausted"
  /** A dispatched developer fix-task could not itself complete. */
  | "fix_failed";

/** The full verification story attached to a task record. */
export interface VerificationOutcome {
  status: VerificationStatus;
  /** Developer fix-rounds the supervisor had to dispatch (0 = passed first try). */
  rounds: number;
  /** Every test run performed, in execution order. */
  runs: TestOutcome[];
}

/**
 * Context the supervisor hands to a runner for a single attempt. The callbacks
 * are the developer→supervisor "up" channel; `signal` is how the supervisor's
 * timeout cancels an in-flight attempt.
 */
export interface RunContext {
  task: Task;
  /** 1-based attempt number. */
  attempt: number;
  /** Aborts when the supervisor's per-attempt timeout fires. */
  signal: AbortSignal;
  /** Emit an interim progress note up to the supervisor. */
  report: (note: string) => void;
  /** Refuse out-of-scope work and tell the supervisor what was requested. */
  flagOutOfScope: (requested: string, allowed: string[]) => void;
  /**
   * Optional per-attempt model override the supervisor selects from its quality
   * ladder (cheapest first, escalating on retry). A runner that understands model
   * tiers (e.g. `ClaudeRunner`) prefers this over its configured default; runners
   * that don't (e.g. `FakeRunner`) ignore it. Undefined → use the runner's own
   * default, which is the frugal baseline.
   */
  model?: string;
}

/**
 * A runner executes one attempt of one task. Implementations:
 *  - `FakeRunner` — scripted, deterministic, no network (eval).
 *  - `ClaudeRunner` — wraps the Agent SDK `query()` (real work).
 */
export interface Runner {
  run(ctx: RunContext): Promise<RunResult>;
}

// --- Message bus payloads -------------------------------------------------

/** Direction of travel on the bus. */
export type BusDirection = "down" | "up" | "system";

interface BaseMessage {
  taskId: string;
  /** Attempt this message belongs to (0 for pre-assignment/system framing). */
  attempt: number;
  ts: number;
}

/** Every message that flows between supervisor and developer, both ways. */
export type BusMessage =
  // supervisor → developer
  | (BaseMessage & { dir: "down"; type: "assign"; task: Task })
  | (BaseMessage & { dir: "down"; type: "steer"; note: string })
  | (BaseMessage & { dir: "down"; type: "scope_decision"; decision: "approve" | "reject"; note?: string })
  // developer → supervisor
  | (BaseMessage & { dir: "up"; type: "progress"; note: string })
  | (BaseMessage & { dir: "up"; type: "blocked"; reason: string })
  | (BaseMessage & { dir: "up"; type: "flag_out_of_scope"; requested: string; allowed: string[] })
  | (BaseMessage & { dir: "up"; type: "result"; result: RunResult })
  // supervisor lifecycle / observability
  | (BaseMessage & { dir: "system"; type: "retry"; reason: "timeout" | "failed"; nextAttempt: number })
  | (BaseMessage & { dir: "system"; type: "quality_escalation"; from: string; to: string; nextAttempt: number })
  | (BaseMessage & { dir: "system"; type: "escalation"; reason: string })
  | (BaseMessage & { dir: "system"; type: "task_completed"; result: RunResult })
  | (BaseMessage & { dir: "system"; type: "task_failed"; result: RunResult })
  | (BaseMessage & { dir: "system"; type: "task_out_of_scope"; result: RunResult })
  // free-form observability note (e.g. a test runner's progress)
  | (BaseMessage & { dir: "system"; type: "note"; note: string })
  // verification: test agents + the dev fix loop
  | (BaseMessage & { dir: "system"; type: "test_started"; kind: TestKind; scope: string[] })
  | (BaseMessage & { dir: "system"; type: "test_result"; kind: TestKind; passed: boolean; failures: TestFailure[] })
  | (BaseMessage & { dir: "system"; type: "fix_dispatched"; round: number; kind: TestKind; failing: string[] })
  | (BaseMessage & { dir: "system"; type: "verified"; rounds: number })
  | (BaseMessage & { dir: "system"; type: "verify_exhausted"; rounds: number; reason: string });

/** Per-task record the supervisor accumulates. */
export interface TaskRecord {
  task: Task;
  status: RunStatus;
  /** Total attempts run (1 + retries actually used). */
  attempts: number;
  /** True when retries were exhausted on a failing task. */
  escalated: boolean;
  result: RunResult;
  /**
   * Present only when the supervisor was configured with verification and the
   * developer task reached `completed` — the post-completion test story.
   */
  verification?: VerificationOutcome;
}

/** Final report of a supervisor run over a batch of tasks. */
export interface SupervisorReport {
  records: TaskRecord[];
  completed: number;
  failed: number;
  outOfScope: number;
}

/**
 * Does `targetPath` fall within the task's allowed scope?
 * Scope entries are repo-relative path prefixes; a trailing "/" marks a
 * directory. An exact match or a directory-prefix match counts as in-scope.
 */
export function pathInScope(targetPath: string, scope: string[]): boolean {
  const norm = (p: string) => p.replace(/^\.?\//, "").replace(/\/+$/, "");
  const target = norm(targetPath);
  return scope.some((entry) => {
    const e = norm(entry);
    return target === e || target.startsWith(`${e}/`);
  });
}
