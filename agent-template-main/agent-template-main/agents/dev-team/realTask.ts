/**
 * Phase-2 proof: run the real Developer Supervisor against one tiny, safely
 * scoped task using the live Agent SDK (`ClaudeRunner`).
 *
 *   pnpm dev:agents:real
 *
 * It assigns a single task whose scope is one scratch file, streams the
 * supervisor↔developer conversation to stdout, and prints the structured
 * report. The `canUseTool` scope gate confines any edit to the scoped file,
 * and `maxBudgetUsd` caps spend — so this is safe to run against the repo.
 *
 * Requires Claude Code auth (or `ANTHROPIC_API_KEY`) in the environment.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SupervisorAgent } from "./SupervisorAgent";
import { ClaudeRunner } from "./runners/ClaudeRunner";
import { ShellTestRunner } from "./runners/ShellTestRunner";
import { RunStateTracker } from "./runState";
import { JsonlRunLedger } from "./runLedger";
import type { BusMessage, Task } from "./types";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const STATE_FILE = path.join(here, ".run-state.json");
const LEDGER_FILE = path.join(here, ".run-ledger.real.jsonl");

// A safe, repo-agnostic demo target: a single gitignored scratch file. The
// `canUseTool` scope gate confines every edit to this path, so the real run
// cannot touch your product code regardless of what the model attempts.
const SCRATCH = "agents/dev-team/.scratch/hello.txt";

const task: Task = {
  id: "scratch-hello",
  title: "write a hello line to the scratch file",
  prompt: [
    `Create the file ${SCRATCH} (and its parent directory if needed) containing`,
    `exactly one line: "hello from the developer agent". Do not create, edit, or`,
    `delete any other file.`,
  ].join(" "),
  scope: [SCRATCH],
  timeoutMs: 120_000,
  maxRetries: 1,
};

function describe(m: BusMessage): string {
  const arrow = m.dir === "down" ? "→ dev " : m.dir === "up" ? "← dev " : "·· sys";
  switch (m.type) {
    case "assign":
      return `${arrow} assign     ${m.task.title}`;
    case "progress":
      return `${arrow} progress   ${m.note}`;
    case "flag_out_of_scope":
      return `${arrow} OUT-OF-SCOPE requested ${m.requested}`;
    case "result":
      return `${arrow} result     ${m.result.status} — ${m.result.summary}`;
    case "retry":
      return `${arrow} retry      (${m.reason}) → attempt ${m.nextAttempt}`;
    case "quality_escalation":
      return `${arrow} quality ↑  ${m.from} → ${m.to} (attempt ${m.nextAttempt})`;
    case "escalation":
      return `${arrow} ESCALATION ${m.reason}`;
    case "task_completed":
    case "task_failed":
    case "task_out_of_scope":
      return `${arrow} ${m.type.replace("task_", "outcome:")} ${m.result.summary}`;
    case "note":
      return `${arrow} note       ${m.note}`;
    case "test_started":
      return `${arrow} test       ${m.kind} → ${m.scope.join(", ")}`;
    case "test_result":
      return `${arrow} test       ${m.kind} ${m.passed ? "PASS" : `FAIL (${m.failures.length})`}`;
    case "fix_dispatched":
      return `${arrow} fix        round ${m.round}: ${m.kind} failures → new developer`;
    case "verified":
      return `${arrow} VERIFIED   after ${m.rounds} fix round(s)`;
    case "verify_exhausted":
      return `${arrow} UNVERIFIED ${m.reason}`;
    default:
      return `${arrow} ${m.type}`;
  }
}

// Quality ladder, cheapest-first: the supervisor starts every task on the
// minimal model and only climbs a rung when an attempt fails and is retried —
// "minimal when it can, higher quality when it must." Tune per project.
const MODEL_LADDER = [
  "claude-haiku-4-5-20251001", // attempt 1: frugal baseline
  "claude-sonnet-4-6", // first retry: more capable
  "claude-opus-4-8", // last resort: strongest
];

async function main(): Promise<void> {
  // Resume backbone: records each task as it settles; a prior run cut off by a
  // token/context cutoff resumes past already-done tasks instead of re-spending.
  const ledger = new JsonlRunLedger(LEDGER_FILE);
  const supervisor = new SupervisorAgent(
    new ClaudeRunner({
      cwd: repoRoot,
      maxBudgetUsd: 0.5,
      permissionMode: "acceptEdits",
    }),
    {
      // Start minimal; let a struggling task pull in a stronger model on retry.
      modelLadder: MODEL_LADDER,
      ledger,
      // After the developer reports 'completed', run the unit + regression test
      // agents targeted at what changed (per `modules.config.ts`) and dispatch a
      // fresh developer to fix any failure, up to 2 rounds. With the default empty
      // module graph this scratch task maps to no module, so verification skips —
      // fill in `modules.config.ts` to enable it for real source changes.
      verification: {
        unit: new ShellTestRunner({ cwd: repoRoot }),
        regression: new ShellTestRunner({ cwd: repoRoot }),
        maxFixRounds: 2,
      },
    },
  );

  supervisor.bus.subscribe((m) => console.log(describe(m)));
  const tracker = new RunStateTracker(supervisor.bus, {
    mode: "real",
    totalTasks: 1,
    filePath: STATE_FILE,
  });

  console.log(`\nSupervisor starting "${task.title}" (scope: ${task.scope.join(", ")})\n`);
  try {
    const report = await supervisor.run([task]);
    tracker.finish();
    ledger.finalize(); // batch finished cleanly → next run starts fresh

    console.log("\n--- report ---");
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.failed > 0 ? 1 : 0;
  } catch (err) {
    // Mark the on-disk state interrupted (not a clean "done"). The ledger is
    // deliberately NOT finalized, so the next run resumes the unfinished tasks.
    tracker.interrupt();
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
