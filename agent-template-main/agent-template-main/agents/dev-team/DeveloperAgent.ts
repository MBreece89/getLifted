import type { MessageBus } from "./messageBus";
import type { RunContext, RunResult, Runner, Task } from "./types";

/**
 * The Developer agent. It works exactly one assigned task via the injected
 * `Runner` and is a thin, scope-honest relay onto the message bus: it wires the
 * developer→supervisor "up" channel (progress / out-of-scope flags / result)
 * and otherwise does not manage its own lifecycle — timeouts and retries are
 * the supervisor's job.
 *
 * Whether a task is in or out of scope is detected inside the runner (the real
 * `ClaudeRunner` hard-gates writes to the task's scope and lets the agent flag;
 * the `FakeRunner` scripts it), then surfaced here as a `flag_out_of_scope`
 * message plus an `out_of_scope` result.
 *
 * A developer is **single-use**: it handles exactly one work assignment and is
 * then discarded. `run()` throws if called twice, so the supervisor's "fresh
 * developer per assignment, old one let go" guarantee can't be violated by
 * accidental reuse.
 */
export class DeveloperAgent {
  private used = false;

  constructor(
    private readonly bus: MessageBus,
    private readonly runner: Runner,
  ) {}

  async run(
    task: Task,
    attempt: number,
    signal: AbortSignal,
    model?: string,
  ): Promise<RunResult> {
    if (this.used) {
      throw new Error(
        "DeveloperAgent is single-use — spawn a new developer for each assignment.",
      );
    }
    this.used = true;
    const ctx: RunContext = {
      task,
      attempt,
      signal,
      ...(model !== undefined ? { model } : {}),
      report: (note) =>
        void this.bus.publish({
          dir: "up",
          type: "progress",
          taskId: task.id,
          attempt,
          note,
        }),
      flagOutOfScope: (requested, allowed) =>
        void this.bus.publish({
          dir: "up",
          type: "flag_out_of_scope",
          taskId: task.id,
          attempt,
          requested,
          allowed,
        }),
    };

    const result = await this.runner.run(ctx);

    this.bus.publish({
      dir: "up",
      type: "result",
      taskId: task.id,
      attempt,
      result,
    });
    return result;
  }
}
