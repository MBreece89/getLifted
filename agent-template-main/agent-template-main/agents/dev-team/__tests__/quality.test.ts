import { describe, expect, it } from "vitest";
import { SupervisorAgent } from "../SupervisorAgent";
import { FakeRunner } from "../runners/FakeRunner";
import type { BusMessage, RunContext, RunResult, Task } from "../types";

const noSleep = async () => {};

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "ladder task",
  prompt: "do the thing",
  scope: ["src/"],
  timeoutMs: 1000,
  maxRetries: 3,
  ...overrides,
});

/** A runner that records the model handed to each attempt, then runs `behave`. */
function recordingRunner(behave: (attempt: number) => RunResult) {
  const models: Array<string | undefined> = [];
  const runner: { models: typeof models; run: FakeRunner["run"] } = {
    models,
    run: async (ctx: RunContext): Promise<RunResult> => {
      models.push(ctx.model);
      return behave(ctx.attempt);
    },
  };
  return runner;
}

describe("quality ladder", () => {
  it("starts on the minimal model and climbs one rung per retry", async () => {
    const runner = recordingRunner((attempt) =>
      attempt < 3 ? { status: "failed", summary: "nope" } : { status: "completed", summary: "ok" },
    );
    const sup = new SupervisorAgent(runner, {
      modelLadder: ["haiku", "sonnet", "opus"],
      backoffMs: 1,
      sleepFn: noSleep,
    });

    const report = await sup.run([task()]);

    expect(report.completed).toBe(1);
    // attempt 1 → rung 0 (minimal), attempt 2 → rung 1, attempt 3 → rung 2.
    expect(runner.models).toEqual(["haiku", "sonnet", "opus"]);
  });

  it("clamps at the top rung once the ladder is exhausted", async () => {
    const runner = recordingRunner(() => ({ status: "failed", summary: "always fails" }));
    const sup = new SupervisorAgent(runner, {
      modelLadder: ["haiku", "sonnet"],
      backoffMs: 1,
      sleepFn: noSleep,
    });

    const report = await sup.run([task({ maxRetries: 3 })]);

    expect(report.failed).toBe(1);
    // 4 attempts (1 + 3 retries); ladder has 2 rungs, so the top rung repeats.
    expect(runner.models).toEqual(["haiku", "sonnet", "sonnet", "sonnet"]);
  });

  it("emits a quality_escalation message each time the tier increases", async () => {
    const runner = recordingRunner((attempt) =>
      attempt < 3 ? { status: "failed", summary: "nope" } : { status: "completed", summary: "ok" },
    );
    const sup = new SupervisorAgent(runner, {
      modelLadder: ["haiku", "sonnet", "opus"],
      backoffMs: 1,
      sleepFn: noSleep,
    });

    const escalations: BusMessage[] = [];
    sup.bus.subscribe((m) => {
      if (m.type === "quality_escalation") escalations.push(m);
    });

    await sup.run([task()]);

    expect(escalations).toHaveLength(2);
    expect(escalations.map((m) => (m.type === "quality_escalation" ? [m.from, m.to] : []))).toEqual([
      ["haiku", "sonnet"],
      ["sonnet", "opus"],
    ]);
  });

  it("passes no model override when no ladder is configured (frugal default)", async () => {
    const runner = recordingRunner(() => ({ status: "completed", summary: "ok" }));
    const sup = new SupervisorAgent(runner, { backoffMs: 1, sleepFn: noSleep });

    await sup.run([task()]);

    expect(runner.models).toEqual([undefined]);
  });
});
