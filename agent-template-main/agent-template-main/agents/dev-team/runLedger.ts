/**
 * Durable run ledger — the resume-after-interruption backbone.
 *
 * The Supervisor's task queue and per-task outcomes otherwise live only in
 * memory, so a process killed mid-batch (a crash, a Ctrl-C, or — the case this
 * exists for — a token/usage/context cutoff that ends the session early) loses
 * everything and a restart re-runs the whole batch from task 0, re-spending on
 * work that already succeeded. `runState.ts` does NOT help: it is a write-only
 * heartbeat of aggregate counts, never read back.
 *
 * This ledger closes that gap with the smallest durable thing that works: an
 * append-only JSONL file, one line per task as it settles, keyed by the task's
 * (deterministic) id. On the next start the Supervisor loads it and SKIPS tasks
 * that already reached a settled-and-done state, resuming the remainder.
 *
 * Batch lifecycle is tracked with a sibling `<file>.done` marker:
 *  - run finishes cleanly  → `finalize()` writes the marker;
 *  - next run sees the marker → it was a *completed* batch, so it starts FRESH
 *    (clears the ledger) rather than wrongly skipping a brand-new batch;
 *  - run is killed (no marker) → next run RESUMES, skipping settled tasks.
 *
 * Skip policy: only `completed` and `out_of_scope` are skipped on resume — both
 * are settled outcomes with nothing left to do. `failed` tasks are deliberately
 * re-run, so a resume gives transient failures another attempt (and a fresh
 * model rung off the supervisor's quality ladder).
 *
 * All writes are best-effort: a ledger I/O error never throws into the control
 * loop — durability is a safety net, not a dependency.
 */
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { RunStatus } from "./types";

/** What the supervisor hands the ledger when a top-level task settles. */
export interface LedgerOutcome {
  taskId: string;
  status: RunStatus;
  /** Attempts the supervisor actually used (1 + retries). */
  attempts: number;
  /** True when retries were exhausted on a failing task. */
  escalated: boolean;
  /** One-line summary from the task's terminal result (for the trace). */
  summary: string;
}

/** A persisted ledger line: an outcome plus when it was recorded. */
export interface LedgerEntry extends LedgerOutcome {
  ts: string;
}

/**
 * The contract the Supervisor depends on. Kept tiny and synchronous so the
 * control loop never blocks on it; a concrete impl may persist however it likes.
 */
export interface RunLedger {
  /**
   * The prior settled outcome for `taskId` IF it should be skipped on resume,
   * else undefined. (Returns undefined for `failed` so it is retried.)
   */
  priorOutcome(taskId: string): LedgerEntry | undefined;
  /** Durably record a task's terminal outcome. Best-effort; never throws. */
  record(outcome: LedgerOutcome): void;
  /** Mark the whole batch finished so the next run starts fresh. */
  finalize(): void;
}

/** Outcomes that are settled-and-done — nothing left to do, so skip on resume. */
const SKIPPABLE: ReadonlySet<RunStatus> = new Set<RunStatus>(["completed", "out_of_scope"]);

export interface JsonlRunLedgerOptions {
  /** Injectable clock (tests). */
  now?: () => Date;
}

/**
 * File-backed {@link RunLedger}: append-only JSONL + a `.done` completion marker.
 * Construct one per logical batch with a STABLE path (e.g. keyed by run mode) so
 * a killed run and its resume point at the same file.
 */
export class JsonlRunLedger implements RunLedger {
  private readonly doneMarker: string;
  private readonly now: () => Date;
  /** taskId → latest entry, loaded from disk for resume (empty on a fresh batch). */
  private readonly settled = new Map<string, LedgerEntry>();

  constructor(
    private readonly filePath: string,
    opts: JsonlRunLedgerOptions = {},
  ) {
    this.now = opts.now ?? (() => new Date());
    this.doneMarker = `${filePath}.done`;

    if (existsSync(this.doneMarker)) {
      // The previous batch completed cleanly → this is a NEW batch. Clear the
      // stale ledger so we don't skip freshly-queued tasks that reuse ids.
      this.safe(() => rmSync(this.filePath, { force: true }));
      this.safe(() => rmSync(this.doneMarker, { force: true }));
      return;
    }
    if (existsSync(this.filePath)) {
      // An interrupted prior run → load it so we can resume past settled tasks.
      this.load();
    }
  }

  priorOutcome(taskId: string): LedgerEntry | undefined {
    const entry = this.settled.get(taskId);
    return entry && SKIPPABLE.has(entry.status) ? entry : undefined;
  }

  record(outcome: LedgerOutcome): void {
    const entry: LedgerEntry = { ...outcome, ts: this.now().toISOString() };
    this.settled.set(entry.taskId, entry);
    this.safe(() => appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`));
  }

  finalize(): void {
    this.safe(() => writeFileSync(this.doneMarker, `${this.now().toISOString()}\n`));
  }

  private load(): void {
    this.safe(() => {
      const text = readFileSync(this.filePath, "utf8");
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const entry = JSON.parse(trimmed) as LedgerEntry;
          if (entry && typeof entry.taskId === "string") this.settled.set(entry.taskId, entry);
        } catch {
          // Tolerate a torn final line from a process killed mid-write.
        }
      }
    });
  }

  /** Run a side effect, swallowing any I/O error — durability must never break a run. */
  private safe(fn: () => void): void {
    try {
      fn();
    } catch {
      /* best-effort */
    }
  }
}
