/**
 * Run-state heartbeat for the Supervisor.
 *
 * The Supervisor is an ephemeral process, so there is nothing for `/status` to
 * inspect unless a run leaves a trace. This tracker subscribes to the same
 * message bus the supervisor already publishes on, derives live counts (tasks
 * done, developers spawned/active/released), and writes them to a JSON file
 * that the `status` skill reads. No change to the supervisor's control loop —
 * it's a pure observer.
 *
 * The developer counts encode the harness's guarantees:
 *  - `active` is 0 or 1: the supervisor runs tasks sequentially.
 *  - `idleNotClosed` is always 0: developers are single-use and let go after one
 *    assignment, so none can linger idle.
 *  - `released` = developers that have been spawned and dropped.
 */
import { writeFileSync } from "node:fs";
import type { MessageBus } from "./messageBus";

export interface RunState {
  pid: number;
  mode: string;
  /**
   * "running" while live, "done" on a clean finish, "interrupted" when the run
   * was torn down before finishing (crash / kill / token-or-context cutoff).
   * "interrupted" deliberately preserves the in-flight `current` task and counts
   * — unlike "done" — so a reader can see exactly where a run was cut off.
   */
  status: "running" | "done" | "interrupted";
  startedAt: string;
  updatedAt: string;
  tasks: { total: number; completed: number; failed: number; outOfScope: number };
  developers: {
    spawned: number;
    active: number;
    idleNotClosed: number;
    released: number;
  };
  current: { taskId: string; title: string } | null;
}

export interface RunStateTrackerOptions {
  /** Label for what this run is doing, e.g. "issues-triage" or "real". */
  mode: string;
  /** Total tasks the supervisor was handed (for progress reporting). */
  totalTasks: number;
  /** Absolute path to write the state JSON to (omit to skip file writes). */
  filePath?: string;
  /** Injectable clock (tests). */
  now?: () => Date;
  /** Injectable sink (tests capture states instead of writing a file). */
  sink?: (state: RunState) => void;
}

export class RunStateTracker {
  private readonly state: RunState;
  private readonly now: () => Date;
  private readonly sink: (state: RunState) => void;

  constructor(bus: MessageBus, opts: RunStateTrackerOptions) {
    this.now = opts.now ?? (() => new Date());
    const iso = this.now().toISOString();
    this.state = {
      pid: process.pid,
      mode: opts.mode,
      status: "running",
      startedAt: iso,
      updatedAt: iso,
      tasks: { total: opts.totalTasks, completed: 0, failed: 0, outOfScope: 0 },
      developers: { spawned: 0, active: 0, idleNotClosed: 0, released: 0 },
      current: null,
    };
    this.sink =
      opts.sink ??
      (opts.filePath
        ? (s) => writeFileSync(opts.filePath!, `${JSON.stringify(s, null, 2)}\n`)
        : () => {});

    bus.subscribe((m) => this.apply(m.type, m));
    this.flush(); // write the initial "running" state immediately
  }

  /** Mark the whole run finished; the last thing an entry script calls. */
  finish(): void {
    this.state.status = "done";
    this.state.current = null;
    this.state.developers.active = 0;
    this.flush();
  }

  /**
   * Mark the run interrupted — call from an entry script's catch/finally when the
   * run did not reach `finish()`. Unlike `finish()`, this preserves `current` and
   * the developer counts so a reader (or a resume) can see where it was cut off.
   * Idempotent and safe to call after `finish()` is not (it would clobber a clean
   * "done"), so only call it on the error path.
   */
  interrupt(): void {
    this.state.status = "interrupted";
    this.flush();
  }

  get snapshot(): RunState {
    return structuredClone(this.state);
  }

  private apply(type: string, m: { task?: { id: string; title: string }; taskId?: string }): void {
    const d = this.state.developers;
    switch (type) {
      case "assign": // a task starts → spawn its first fresh developer
        if (m.task) this.state.current = { taskId: m.task.id, title: m.task.title };
        d.spawned += 1;
        d.active = 1;
        break;
      case "retry": // previous developer let go, a fresh one spawned for the next attempt
        d.spawned += 1;
        d.released += 1;
        d.active = 1;
        break;
      case "result": // an attempt's developer finished its one assignment → released
        if (d.active > 0) {
          d.active = 0;
          d.released += 1;
        }
        break;
      case "task_completed":
        this.state.tasks.completed += 1;
        this.state.current = null;
        break;
      case "task_failed":
        this.state.tasks.failed += 1;
        this.state.current = null;
        break;
      case "task_out_of_scope":
        this.state.tasks.outOfScope += 1;
        this.state.current = null;
        break;
      default:
        return; // not state-affecting; don't bother rewriting the file
    }
    this.flush();
  }

  private flush(): void {
    this.state.updatedAt = this.now().toISOString();
    this.state.developers.idleNotClosed = 0; // invariant: single-use developers never idle
    this.sink(this.snapshot);
  }
}
