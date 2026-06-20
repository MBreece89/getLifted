/**
 * Eval: proves the supervisor runs the unit + regression test agents after a
 * developer task completes, targets them at what changed, and treats a failing
 * suite as work for a fresh developer fix-task — looping until green or until
 * the fix-round budget escalates. Deterministic: FakeRunner + FakeTestRunner,
 * no network and no process spawn.
 */
import { describe, expect, it } from "vitest";
import { SupervisorAgent, type Verification } from "../SupervisorAgent";
import { completes, fails, FakeRunner } from "../runners/FakeRunner";
import { failing, FakeTestRunner, passing } from "../runners/FakeTestRunner";
import type { FakeTestScript } from "../runners/FakeTestRunner";
import { EXAMPLE_MODULE_GRAPH } from "../targeting";
import type { Task } from "../types";

const noSleep = async () => {};

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "feat",
    title: "ship a feature",
    prompt: "do the thing",
    scope: ["apps/web/"],
    timeoutMs: 40,
    maxRetries: 2,
    ...overrides,
  };
}

/** A supervisor whose dev work completes (fix-tasks too, via fallback) and whose
 *  test agents are scripted by the caller. `devFallback` lets a test make
 *  dispatched fix-tasks fail instead. */
function supervisor(
  unit: FakeTestScript,
  regression: FakeTestScript,
  opts: { changeSet?: Verification["changeSet"]; maxFixRounds?: number; devFallback?: ReturnType<typeof fails> } = {},
) {
  const verification: Verification = {
    unit: new FakeTestRunner(unit),
    regression: new FakeTestRunner(regression),
    graph: EXAMPLE_MODULE_GRAPH,
    ...(opts.changeSet ? { changeSet: opts.changeSet } : {}),
    ...(opts.maxFixRounds !== undefined ? { maxFixRounds: opts.maxFixRounds } : {}),
  };
  return new SupervisorAgent(
    new FakeRunner({ feat: completes("dev done") }, opts.devFallback ?? completes("fix done")),
    { sleepFn: noSleep, verification },
  );
}

describe("verification — passes first try", () => {
  it("runs unit then regression, records 'verified', dispatches no fix", async () => {
    const sup = supervisor([passing("unit")], [passing("regression")]);

    const report = await sup.run([task()]);

    expect(report.completed).toBe(1);
    const rec = report.records[0]!;
    expect(rec.status).toBe("completed");
    expect(rec.verification?.status).toBe("verified");
    expect(rec.verification?.rounds).toBe(0);
    expect(sup.bus.ofType("test_started").map((m) => m.kind)).toEqual(["unit", "regression"]);
    expect(sup.bus.ofType("verified").length).toBe(1);
    expect(sup.bus.ofType("fix_dispatched").length).toBe(0);
  });

  it("targets unit at the changed module and fans regression out to dependents", async () => {
    const sup = supervisor([passing("unit")], [passing("regression")], {
      changeSet: () => ["packages/shared/src/schemas/x.ts"],
    });

    await sup.run([task({ scope: ["packages/shared/"] })]);

    const started = sup.bus.ofType("test_started");
    expect(started.find((m) => m.kind === "unit")!.scope).toEqual(["packages/shared/"]);
    const reg = started.find((m) => m.kind === "regression")!.scope;
    expect(reg).toEqual(expect.arrayContaining(["packages/shared/", "apps/api/", "apps/web/"]));
  });
});

describe("verification — skipped when nothing changed", () => {
  it("does not run any test when no changed path maps to a module", async () => {
    const sup = supervisor([passing("unit")], [passing("regression")], {
      changeSet: () => [],
    });

    const report = await sup.run([task()]);

    expect(report.records[0]!.verification?.status).toBe("skipped");
    expect(sup.bus.ofType("test_started").length).toBe(0);
  });
});

describe("verification — failing unit tests dispatch a developer fix", () => {
  it("fixes, re-verifies, and ends verified", async () => {
    const sup = supervisor(
      [failing("unit", ["apps/web/src/x.test.ts"]), passing("unit")],
      [passing("regression")],
    );

    const report = await sup.run([task()]);

    expect(report.completed).toBe(1);
    const rec = report.records[0]!;
    expect(rec.status).toBe("completed");
    expect(rec.verification?.status).toBe("verified");
    expect(rec.verification?.rounds).toBe(1);

    const fixes = sup.bus.ofType("fix_dispatched");
    expect(fixes.length).toBe(1);
    expect(fixes[0]!.kind).toBe("unit");
    expect(fixes[0]!.failing).toContain("apps/web/src/x.test.ts");
    // A real fix-task was assigned and completed through the same machinery.
    expect(sup.bus.ofType("assign").some((m) => m.task.id === "feat-fix-1")).toBe(true);
  });
});

describe("verification — failing regression tests dispatch a developer fix", () => {
  it("fixes the regression and ends verified", async () => {
    const sup = supervisor(
      [passing("unit"), passing("unit")],
      [failing("regression", ["apps/api/src/y.test.ts"]), passing("regression")],
    );

    const rec = (await sup.run([task()])).records[0]!;

    expect(rec.status).toBe("completed");
    expect(rec.verification?.status).toBe("verified");
    expect(rec.verification?.rounds).toBe(1);
    expect(sup.bus.ofType("fix_dispatched")[0]!.kind).toBe("regression");
  });
});

describe("verification — exhausts the fix budget", () => {
  it("escalates to failed when tests never pass", async () => {
    const sup = supervisor(
      [failing("unit", ["apps/web/src/x.test.ts"])], // always fails
      [passing("regression")],
      { maxFixRounds: 1 },
    );

    const report = await sup.run([task()]);

    expect(report.failed).toBe(1);
    expect(report.completed).toBe(0);
    const rec = report.records[0]!;
    expect(rec.status).toBe("failed");
    expect(rec.escalated).toBe(true);
    expect(rec.verification?.status).toBe("exhausted");
    expect(rec.verification?.rounds).toBe(1);
    expect(sup.bus.ofType("fix_dispatched").length).toBe(1);
    expect(sup.bus.ofType("verify_exhausted").length).toBe(1);
  });
});

describe("verification — a fix the developer cannot complete", () => {
  it("escalates as fix_failed", async () => {
    const sup = supervisor(
      [failing("unit", ["apps/web/src/x.test.ts"])],
      [passing("regression")],
      { devFallback: fails("cannot fix") },
    );

    const rec = (await sup.run([task()])).records[0]!;

    expect(rec.status).toBe("failed");
    expect(rec.verification?.status).toBe("fix_failed");
    expect(sup.bus.ofType("verify_exhausted").length).toBe(1);
  });
});
