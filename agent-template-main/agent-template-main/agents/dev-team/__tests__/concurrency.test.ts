/**
 * Concurrency: the supervisor advances up to `concurrency` disjoint-scope tasks
 * at once, while `records` always settle in input order. Deterministic — uses a
 * scripted behaviour that tracks how many developers are in flight at the peak.
 */
import { describe, expect, it } from "vitest";
import { SupervisorAgent } from "../SupervisorAgent";
import { FakeRunner, type FakeBehavior } from "../runners/FakeRunner";
import type { Task } from "../types";

const noSleep = async () => {};
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Behaviour that counts concurrent in-flight developers and records the peak. */
function trackingBehavior(state: { active: number; peak: number }): FakeBehavior {
  return async () => {
    state.active += 1;
    state.peak = Math.max(state.peak, state.active);
    await tick(5); // yield so other lanes can start before this one finishes
    state.active -= 1;
    return { status: "completed", summary: "done" };
  };
}

function tasks(n: number): Task[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    title: `task ${i}`,
    prompt: "do it",
    scope: [`area-${i}/`], // disjoint scopes
    timeoutMs: 1000,
    maxRetries: 0,
  }));
}

describe("concurrency", () => {
  it("default (1) runs one developer at a time", async () => {
    const state = { active: 0, peak: 0 };
    const sup = new SupervisorAgent(new FakeRunner({}, trackingBehavior(state)), {
      sleepFn: noSleep,
    });

    const report = await sup.run(tasks(4));

    expect(report.completed).toBe(4);
    expect(state.peak).toBe(1);
  });

  it("concurrency N runs up to N developers at once, records stay in input order", async () => {
    const state = { active: 0, peak: 0 };
    const sup = new SupervisorAgent(new FakeRunner({}, trackingBehavior(state)), {
      sleepFn: noSleep,
      concurrency: 3,
    });

    const report = await sup.run(tasks(6));

    expect(report.completed).toBe(6);
    expect(state.peak).toBe(3); // never more than the lane cap
    expect(report.records.map((r) => r.task.id)).toEqual(["t0", "t1", "t2", "t3", "t4", "t5"]);
  });
});
