/**
 * The run-state tracker is what `/status` reads to report supervisor activity.
 * It must derive correct counts purely from the bus, and encode the harness
 * guarantees: developers are single-use (never idle) and run one at a time.
 */
import { describe, expect, it } from "vitest";
import { SupervisorAgent } from "../SupervisorAgent";
import { completes, fails, hangs, FakeRunner } from "../runners/FakeRunner";
import type { FakeScript } from "../runners/FakeRunner";
import { RunStateTracker, type RunState } from "../runState";
import type { Task } from "../types";

const noSleep = async () => {};

function task(overrides: Partial<Task> = {}): Task {
  return { id: "t1", title: "demo", prompt: "go", scope: ["agents/dev-team"], timeoutMs: 30, maxRetries: 2, ...overrides };
}

/** Run a supervisor with a tracker attached; return the supervisor + captured final state. */
async function trackedRun(script: FakeScript, tasks: Task[]) {
  const sup = new SupervisorAgent(new FakeRunner(script, completes()), { sleepFn: noSleep });
  const states: RunState[] = [];
  const tracker = new RunStateTracker(sup.bus, { mode: "test", totalTasks: tasks.length, sink: (s) => states.push(s) });
  await sup.run(tasks);
  tracker.finish();
  return { tracker, states, final: tracker.snapshot };
}

describe("RunStateTracker", () => {
  it("starts 'running' with a clean slate", () => {
    const sup = new SupervisorAgent(new FakeRunner({}), { sleepFn: noSleep });
    const t = new RunStateTracker(sup.bus, { mode: "test", totalTasks: 3, sink: () => {} });
    const s = t.snapshot;
    expect(s.status).toBe("running");
    expect(s.tasks.total).toBe(3);
    expect(s.developers.spawned).toBe(0);
  });

  it("counts one spawned-and-released developer for a happy task", async () => {
    const { final } = await trackedRun({ t1: completes() }, [task()]);
    expect(final.tasks.completed).toBe(1);
    expect(final.developers.spawned).toBe(1);
    expect(final.developers.released).toBe(1);
    expect(final.developers.active).toBe(0);
    expect(final.developers.idleNotClosed).toBe(0);
    expect(final.current).toBeNull();
  });

  it("counts a fresh developer per retry attempt", async () => {
    // attempt 1 hangs (timeout → retry), attempt 2 completes → 2 developers spawned.
    const { final } = await trackedRun({ t1: [hangs(), completes()] }, [task()]);
    expect(final.tasks.completed).toBe(1);
    expect(final.developers.spawned).toBe(2);
    expect(final.developers.released).toBe(2);
  });

  it("spawns a developer for every attempt of a doomed task, then records the failure", async () => {
    const { final } = await trackedRun({ t1: fails() }, [task({ maxRetries: 2 })]);
    expect(final.tasks.failed).toBe(1);
    expect(final.developers.spawned).toBe(3); // 1 + 2 retries
  });

  it("never reports an idle, un-closed developer mid-run", async () => {
    const { states } = await trackedRun({ t1: [hangs(), completes()] }, [task()]);
    expect(states.every((s) => s.developers.idleNotClosed === 0)).toBe(true);
    // active is only ever 0 or 1 — sequential supervisor.
    expect(states.every((s) => s.developers.active === 0 || s.developers.active === 1)).toBe(true);
  });

  it("marks the run 'done' on finish", async () => {
    const { final } = await trackedRun({ t1: completes() }, [task()]);
    expect(final.status).toBe("done");
    expect(final.developers.active).toBe(0);
  });
});
