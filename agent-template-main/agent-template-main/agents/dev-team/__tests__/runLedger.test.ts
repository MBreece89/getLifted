/**
 * The run ledger is the resume-after-interruption backbone: it must persist each
 * settled task across process boundaries, skip done work on resume, re-run
 * failures, and start fresh once a batch finishes — all without ever throwing
 * into the control loop. These tests exercise both the JsonlRunLedger directly
 * and the SupervisorAgent integration (a "killed" run resumed on a second run).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SupervisorAgent } from "../SupervisorAgent";
import { completes, fails, FakeRunner } from "../runners/FakeRunner";
import { JsonlRunLedger, type LedgerOutcome } from "../runLedger";
import type { Task } from "../types";

const noSleep = async () => {};

function task(overrides: Partial<Task> = {}): Task {
  return { id: "t1", title: "demo", prompt: "go", scope: ["agents/dev-team"], timeoutMs: 30, maxRetries: 1, ...overrides };
}

function outcome(overrides: Partial<LedgerOutcome> = {}): LedgerOutcome {
  return { taskId: "t1", status: "completed", attempts: 1, escalated: false, summary: "ok", ...overrides };
}

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "run-ledger-"));
  file = join(dir, ".run-ledger.test.jsonl");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("JsonlRunLedger", () => {
  it("skips completed and out_of_scope, but re-runs failed", () => {
    const l = new JsonlRunLedger(file);
    l.record(outcome({ taskId: "done", status: "completed" }));
    l.record(outcome({ taskId: "oos", status: "out_of_scope" }));
    l.record(outcome({ taskId: "bad", status: "failed" }));

    expect(l.priorOutcome("done")?.status).toBe("completed");
    expect(l.priorOutcome("oos")?.status).toBe("out_of_scope");
    expect(l.priorOutcome("bad")).toBeUndefined(); // failed → retried on resume
    expect(l.priorOutcome("never-seen")).toBeUndefined();
  });

  it("persists across instances so a fresh process can resume", () => {
    new JsonlRunLedger(file).record(outcome({ taskId: "keep", status: "completed" }));
    // A brand-new instance (≈ a restarted process) loads the prior run from disk.
    const resumed = new JsonlRunLedger(file);
    expect(resumed.priorOutcome("keep")?.summary).toBe("ok");
  });

  it("finalize() makes the next instance start a fresh batch", () => {
    const l = new JsonlRunLedger(file);
    l.record(outcome({ taskId: "keep", status: "completed" }));
    l.finalize(); // batch completed cleanly

    const fresh = new JsonlRunLedger(file);
    expect(fresh.priorOutcome("keep")).toBeUndefined(); // cleared, not skipped
    expect(existsSync(file)).toBe(false); // stale ledger removed
  });

  it("tolerates a torn final line from a process killed mid-write", () => {
    new JsonlRunLedger(file).record(outcome({ taskId: "good", status: "completed" }));
    appendFileSync(file, '{"taskId":"torn","status":"comple'); // half a line, no newline

    const l = new JsonlRunLedger(file);
    expect(l.priorOutcome("good")?.status).toBe("completed");
    expect(l.priorOutcome("torn")).toBeUndefined();
  });

  it("never throws on an unwritable path — durability is a safety net, not a dependency", () => {
    const badPath = join(dir, "no", "such", "dir", "ledger.jsonl");
    const l = new JsonlRunLedger(badPath);
    expect(() => l.record(outcome())).not.toThrow();
    expect(() => l.finalize()).not.toThrow();
    // The live run still works in-memory; only persistence was lost, so a fresh
    // instance (≈ a restart) sees nothing on disk.
    expect(l.priorOutcome("t1")?.status).toBe("completed");
    expect(new JsonlRunLedger(badPath).priorOutcome("t1")).toBeUndefined();
  });

  it("appends one JSONL line per recorded outcome", () => {
    const l = new JsonlRunLedger(file);
    l.record(outcome({ taskId: "a" }));
    l.record(outcome({ taskId: "b" }));
    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).taskId).toBe("a");
    expect(JSON.parse(lines[1]!).ts).toBeTypeOf("string");
  });
});

describe("SupervisorAgent resume (via ledger)", () => {
  it("skips a task a prior run already completed instead of re-running it", async () => {
    const t = task();
    // Run 1: completes t1 and records it, then the "process dies" before finalize.
    const sup1 = new SupervisorAgent(new FakeRunner({ t1: completes() }), {
      sleepFn: noSleep,
      ledger: new JsonlRunLedger(file),
    });
    await sup1.run([t]);

    // Run 2 (resumed): the runner is scripted to FAIL t1 — if the skip works, the
    // record stays 'completed' (from the ledger) and the runner is never consulted.
    const sup2 = new SupervisorAgent(new FakeRunner({ t1: fails() }), {
      sleepFn: noSleep,
      ledger: new JsonlRunLedger(file),
    });
    const report = await sup2.run([t]);

    expect(report.completed).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.records[0]!.status).toBe("completed");
  });

  it("re-runs a task that previously failed", async () => {
    const t = task();
    const sup1 = new SupervisorAgent(new FakeRunner({ t1: fails() }), {
      sleepFn: noSleep,
      ledger: new JsonlRunLedger(file),
    });
    await sup1.run([t]);

    // Resume with a runner that now succeeds → the failed task is retried, not skipped.
    const sup2 = new SupervisorAgent(new FakeRunner({ t1: completes() }), {
      sleepFn: noSleep,
      ledger: new JsonlRunLedger(file),
    });
    const report = await sup2.run([t]);

    expect(report.completed).toBe(1);
    expect(report.records[0]!.status).toBe("completed");
  });

  it("resumes a partial batch: done task skipped, unfinished task still run", async () => {
    const t1 = task({ id: "t1" });
    const t2 = task({ id: "t2" });
    // Run 1 completes only t1 (t2 'not reached' — its outcome was never recorded).
    const ledger1 = new JsonlRunLedger(file);
    ledger1.record({ taskId: "t1", status: "completed", attempts: 1, escalated: false, summary: "done in run 1" });

    // Run 2: t1 is scripted to fail (must be skipped), t2 completes (must run).
    const sup2 = new SupervisorAgent(new FakeRunner({ t1: fails(), t2: completes() }), {
      sleepFn: noSleep,
      ledger: new JsonlRunLedger(file),
    });
    const report = await sup2.run([t1, t2]);

    expect(report.records[0]!.status).toBe("completed"); // t1 resumed/skipped
    expect(report.records[0]!.result.summary).toBe("done in run 1");
    expect(report.records[1]!.status).toBe("completed"); // t2 actually run
    expect(report.completed).toBe(2);
  });
});
