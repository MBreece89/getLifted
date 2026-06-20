/**
 * Parallel-lanes demo: run THREE disjoint-scope tasks at once via the live Agent
 * SDK, to show the supervisor's `concurrency` lanes in action.
 *
 *   npm run dev:team        (or: pnpm dev:team)
 *
 * Each task writes one gitignored scratch file in its OWN directory, so the three
 * scopes are disjoint and the lanes can never collide. The `canUseTool` scope
 * gate confines every edit to that lane's file, and `maxBudgetUsd` caps spend —
 * so this is safe to run against any repo.
 *
 * Requires Claude Code auth (or `ANTHROPIC_API_KEY`) in the environment.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SupervisorAgent } from "./SupervisorAgent";
import { ClaudeRunner } from "./runners/ClaudeRunner";
import { RunStateTracker } from "./runState";
import { JsonlRunLedger } from "./runLedger";
import type { BusMessage, Task } from "./types";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const STATE_FILE = path.join(here, ".run-state.json");
const LEDGER_FILE = path.join(here, ".run-ledger.team.jsonl");

const LANES = ["alpha", "beta", "gamma"] as const;

const tasks: Task[] = LANES.map((lane, i) => {
  const file = `agents/dev-team/.scratch/${lane}.txt`;
  return {
    id: `lane-${lane}`,
    title: `write the ${lane} scratch file`,
    prompt: [
      `Create the file ${file} (and its parent directory if needed) containing`,
      `exactly one line: "lane ${lane} (#${i + 1}) reporting in". Do not create,`,
      `edit, or delete any other file.`,
    ].join(" "),
    scope: [file], // disjoint per lane
    timeoutMs: 120_000,
    maxRetries: 1,
  };
});

function describe(m: BusMessage): string {
  const arrow = m.dir === "down" ? "→ dev " : m.dir === "up" ? "← dev " : "·· sys";
  switch (m.type) {
    case "assign":
      return `${arrow} assign     ${m.task.title}`;
    case "progress":
      return `${arrow} progress   [${m.taskId}] ${m.note}`;
    case "result":
      return `${arrow} result     [${m.taskId}] ${m.result.status} — ${m.result.summary}`;
    case "retry":
      return `${arrow} retry      [${m.taskId}] (${m.reason}) → attempt ${m.nextAttempt}`;
    case "escalation":
      return `${arrow} ESCALATION [${m.taskId}] ${m.reason}`;
    case "task_completed":
    case "task_failed":
    case "task_out_of_scope":
      return `${arrow} ${m.type.replace("task_", "outcome:")} [${m.taskId}] ${m.result.summary}`;
    default:
      return `${arrow} ${m.type}`;
  }
}

async function main(): Promise<void> {
  // Resume backbone: a run cut off mid-batch resumes past already-settled lanes.
  const ledger = new JsonlRunLedger(LEDGER_FILE);
  const supervisor = new SupervisorAgent(
    new ClaudeRunner({
      cwd: repoRoot,
      maxBudgetUsd: 0.5,
      permissionMode: "acceptEdits",
    }),
    {
      concurrency: LANES.length, // all three lanes in flight at once
      // Start each lane on the frugal baseline; only climb a rung if an attempt
      // fails and is retried (mirrors realTask's quality ladder).
      modelLadder: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-8"],
      ledger,
    },
  );

  supervisor.bus.subscribe((m) => console.log(describe(m)));
  const tracker = new RunStateTracker(supervisor.bus, {
    mode: "team",
    totalTasks: tasks.length,
    filePath: STATE_FILE,
  });

  console.log(`\nSupervisor starting ${tasks.length} parallel lanes…\n`);
  try {
    const report = await supervisor.run(tasks);
    tracker.finish();
    ledger.finalize(); // batch finished cleanly → next run starts fresh

    console.log("\n--- report ---");
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.failed > 0 ? 1 : 0;
  } catch (err) {
    tracker.interrupt(); // ledger NOT finalized → next run resumes unfinished lanes
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
