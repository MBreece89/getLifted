/**
 * Eval: proves the supervisor↔developer control loop behaves correctly across
 * all four flow types, using the deterministic FakeRunner (no network). Each
 * test asserts both the supervisor's recorded outcome and the exact two-way
 * conversation that took place on the message bus.
 */
import { describe, expect, it } from "vitest";
import { SupervisorAgent } from "../SupervisorAgent";
import { completes, fails, hangs, refusesOutOfScope } from "../runners/FakeRunner";
import type { FakeScript } from "../runners/FakeRunner";
import { FakeRunner } from "../runners/FakeRunner";
import type { Task } from "../types";

const noSleep = async () => {};

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "demo task",
    prompt: "do the thing",
    scope: ["agents/dev-team"],
    timeoutMs: 40,
    maxRetries: 2,
    ...overrides,
  };
}

function supervisorFor(script: FakeScript) {
  return new SupervisorAgent(new FakeRunner(script), { sleepFn: noSleep });
}

describe("flow 1 — happy path", () => {
  it("assigns, the developer completes, and it is recorded as completed", async () => {
    const t = task({ id: "happy" });
    const sup = supervisorFor({ happy: completes("shipped it") });

    const report = await sup.run([t]);

    expect(report.completed).toBe(1);
    expect(report.failed).toBe(0);
    const record = report.records[0]!;
    expect(record.status).toBe("completed");
    expect(record.attempts).toBe(1);
    expect(record.escalated).toBe(false);

    // Two-way conversation: assign down, progress + result up, completion system msg.
    expect(sup.bus.ofType("assign").length).toBe(1);
    expect(sup.bus.ofType("progress").length).toBeGreaterThan(0);
    expect(sup.bus.ofType("result").length).toBe(1);
    expect(sup.bus.ofType("task_completed").length).toBe(1);
    expect(sup.bus.ofType("retry").length).toBe(0);
  });
});

describe("flow 2 — timeout → retry", () => {
  it("times out a hung attempt, retries, and the next attempt completes", async () => {
    const t = task({ id: "slow", timeoutMs: 30 });
    // attempt 1 hangs (forces the timeout), attempt 2 completes.
    const sup = supervisorFor({ slow: [hangs(), completes("recovered on retry")] });

    const report = await sup.run([t]);

    expect(report.completed).toBe(1);
    const record = report.records[0]!;
    expect(record.status).toBe("completed");
    expect(record.attempts).toBe(2);

    const retries = sup.bus.ofType("retry");
    expect(retries.length).toBe(1);
    expect(retries[0]!.reason).toBe("timeout");
  });
});

describe("flow 3 — fail → escalate", () => {
  it("retries to the limit, then escalates and records a failure", async () => {
    const t = task({ id: "doomed", maxRetries: 2 });
    const sup = supervisorFor({ doomed: fails("cannot resolve dependency") });

    const report = await sup.run([t]);

    expect(report.failed).toBe(1);
    expect(report.completed).toBe(0);
    const record = report.records[0]!;
    expect(record.status).toBe("failed");
    expect(record.escalated).toBe(true);
    expect(record.attempts).toBe(3); // 1 + 2 retries

    expect(sup.bus.ofType("retry").length).toBe(2);
    expect(sup.bus.ofType("retry").every((m) => m.reason === "failed")).toBe(true);
    expect(sup.bus.ofType("escalation").length).toBe(1);
    expect(sup.bus.ofType("task_failed").length).toBe(1);
  });
});

describe("flow 4 — scope pushback", () => {
  it("flags out-of-scope work, does not retry, and does not count as a failure", async () => {
    const t = task({ id: "scoped", scope: ["agents/dev-team"] });
    const sup = supervisorFor({
      scoped: refusesOutOfScope("apps/api/src/secret.ts"),
    });

    const report = await sup.run([t]);

    expect(report.outOfScope).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.completed).toBe(0);
    const record = report.records[0]!;
    expect(record.status).toBe("out_of_scope");
    expect(record.attempts).toBe(1); // refused immediately, no retries
    expect(record.escalated).toBe(false);

    const flags = sup.bus.ofType("flag_out_of_scope");
    expect(flags.length).toBe(1);
    expect(flags[0]!.requested).toBe("apps/api/src/secret.ts");
    expect(sup.bus.ofType("retry").length).toBe(0);
    expect(sup.bus.ofType("task_out_of_scope").length).toBe(1);
  });
});

describe("all flows in one batch", () => {
  it("produces the right aggregate outcome across mixed tasks", async () => {
    const tasks: Task[] = [
      task({ id: "a" }),
      task({ id: "b", timeoutMs: 30 }),
      task({ id: "c" }),
      task({ id: "d", scope: ["agents/dev-team"] }),
    ];
    const sup = supervisorFor({
      a: completes(),
      b: [hangs(), completes()],
      c: fails(),
      d: refusesOutOfScope("apps/web/src/x.tsx"),
    });

    const report = await sup.run(tasks);

    expect(report.completed).toBe(2); // a + b(after retry)
    expect(report.failed).toBe(1); // c
    expect(report.outOfScope).toBe(1); // d
    expect(report.records.map((r) => r.status)).toEqual([
      "completed",
      "completed",
      "failed",
      "out_of_scope",
    ]);
  });
});
