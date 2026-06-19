/**
 * The OPEN→CLOSED seam: a discovery report's candidates become scoped closed
 * tasks. Pure + deterministic — no SDK, no network.
 */
import { describe, expect, it } from "vitest";
import { discoveryToTasks, type DiscoveryReport } from "../exploration";

function report(overrides: Partial<DiscoveryReport> = {}): DiscoveryReport {
  return {
    goal: "make the widget accessible",
    findings: ["no aria labels", "contrast too low"],
    candidates: [
      { title: "Add aria labels to Widget", rationale: "screen readers can't parse it", scope: ["src/widget/"] },
      { title: "Fix contrast tokens", rationale: "fails WCAG AA", scope: ["src/theme/"] },
    ],
    openQuestions: ["which contrast ratio target?"],
    ...overrides,
  };
}

describe("discoveryToTasks", () => {
  it("maps each candidate to a scoped task, preserving scope and order", () => {
    const { tasks, skipped } = discoveryToTasks(report());

    expect(skipped).toHaveLength(0);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]!.scope).toEqual(["src/widget/"]);
    expect(tasks[1]!.scope).toEqual(["src/theme/"]);
    // goal + title + rationale all reach the developer prompt
    expect(tasks[0]!.prompt).toContain("make the widget accessible");
    expect(tasks[0]!.prompt).toContain("Add aria labels to Widget");
    expect(tasks[0]!.prompt).toContain("screen readers");
  });

  it("generates stable, unique, filesystem-safe ids", () => {
    const { tasks } = discoveryToTasks(report(), { idPrefix: "x" });
    expect(tasks[0]!.id).toBe("x-1-add-aria-labels-to-widget");
    expect(tasks[1]!.id).toBe("x-2-fix-contrast-tokens");
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
  });

  it("applies task defaults", () => {
    const { tasks } = discoveryToTasks(report(), { timeoutMs: 5000, maxRetries: 3 });
    expect(tasks[0]).toMatchObject({ timeoutMs: 5000, maxRetries: 3 });
  });

  it("drops unscoped candidates (closed engine refuses unscoped work) and reports them", () => {
    const r = report({
      candidates: [
        { title: "vague idea", rationale: "no clear target", scope: [] },
        { title: "scoped work", rationale: "clear", scope: ["src/x/"] },
        { title: "blank scope entries", rationale: "whitespace only", scope: ["  ", ""] },
      ],
    });

    const { tasks, skipped } = discoveryToTasks(r);

    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.title).toBe("scoped work");
    expect(skipped.map((c) => c.title)).toEqual(["vague idea", "blank scope entries"]);
  });

  it("an empty report yields no tasks", () => {
    const { tasks, skipped } = discoveryToTasks(report({ candidates: [] }));
    expect(tasks).toEqual([]);
    expect(skipped).toEqual([]);
  });
});
