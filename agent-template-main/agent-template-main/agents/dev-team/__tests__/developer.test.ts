/**
 * The Developer is single-use: it handles exactly one work assignment and is
 * then let go. This guards the supervisor's "fresh developer per assignment"
 * rule against accidental reuse.
 */
import { describe, expect, it } from "vitest";
import { DeveloperAgent } from "../DeveloperAgent";
import { MessageBus } from "../messageBus";
import { completes, FakeRunner } from "../runners/FakeRunner";
import type { Task } from "../types";

const task: Task = {
  id: "one-shot",
  title: "single assignment",
  prompt: "do it once",
  scope: ["agents/dev-team"],
  timeoutMs: 1000,
  maxRetries: 0,
};

function developer() {
  return new DeveloperAgent(new MessageBus(), new FakeRunner({ "one-shot": completes() }));
}

describe("DeveloperAgent (single-use)", () => {
  it("runs its one assignment", async () => {
    const result = await developer().run(task, 1, new AbortController().signal);
    expect(result.status).toBe("completed");
  });

  it("throws if asked to do work a second time", async () => {
    const dev = developer();
    await dev.run(task, 1, new AbortController().signal);
    await expect(dev.run(task, 2, new AbortController().signal)).rejects.toThrow(/single-use/);
  });
});
