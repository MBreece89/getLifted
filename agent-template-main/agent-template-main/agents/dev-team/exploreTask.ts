/**
 * OPEN exploration entry point — the token-frugal front-end to the CLOSED engine.
 *
 *   npm run dev:explore -- "your open-ended goal here"
 *   npm run dev:explore -- "..." --run    # also execute the discovered plan (closed)
 *
 * An explorer agent roams WIDE but CHEAP (Haiku, read-mostly, breadth-first,
 * bounded) over the repo and writes a discovery report to `.exploration/`:
 *   - report.md   — human-readable findings
 *   - report.json — a machine-readable `DiscoveryReport` (goal + scoped candidates)
 * The script then turns those candidates into CLOSED `Task`s via `discoveryToTasks`
 * and prints them; with `--run` it hands them to the `SupervisorAgent` so the
 * existing assign → verify → escalate engine executes the discovered plan.
 *
 * BUDGET NOTE: on a Claude Pro subscription the limit is *tokens*, not dollars, so
 * `maxBudgetUsd` is inert. Frugality here comes from the cheap model (Haiku for
 * breadth), a bounded `maxTurns`, and a read-mostly breadth-first prompt — not a
 * dollar cap. Synthesis/execution can use a stronger model where it earns its cost.
 *
 * Requires Claude Code auth (or `ANTHROPIC_API_KEY`) in the environment.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SupervisorAgent } from "./SupervisorAgent";
import { ClaudeRunner } from "./runners/ClaudeRunner";
import { ShellTestRunner } from "./runners/ShellTestRunner";
import { discoveryToTasks, type DiscoveryReport } from "./exploration";
import type { BusMessage } from "./types";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

// Cheap, fast model for wide breadth. Override via EXPLORER_MODEL if desired.
const EXPLORER_MODEL = process.env.EXPLORER_MODEL ?? "claude-haiku-4-5-20251001";
// Quality ladder for actually doing the discovered work (closed developers):
// cheapest-first, escalated one rung per retry by the supervisor. The frugal
// baseline does the easy slices; only a struggling task pulls in a stronger model.
const DEVELOPER_LADDER = (process.env.DEVELOPER_LADDER ?? "claude-haiku-4-5-20251001,claude-sonnet-4-6,claude-opus-4-8").split(",");

const EXPLORE_DIR = ".exploration";
const REPORT_JSON = path.join(repoRoot, EXPLORE_DIR, "report.json");

const RUN = process.argv.includes("--run");
const goal =
  process.argv.slice(2).find((a) => !a.startsWith("--")) ??
  "Survey this repository and propose the highest-value improvements.";

// Frozen, byte-stable system prompt (keep it cacheable — see ClaudeRunner notes).
const EXPLORER_SYSTEM = [
  "You are an Explorer agent: an OPEN, token-FRUGAL discovery pass. You roam WIDE",
  "but CHEAP. Your job is to discover what matters and hand back a bounded plan —",
  "NOT to do the work.",
  "Frugality rules (you are on a tight token budget):",
  "- Breadth-first, not depth-first. Sample many areas shallowly.",
  "- Prefer Grep/Glob and read only EXCERPTS; never read whole files end to end.",
  "- Keep a short running note; do not echo file contents back.",
  "- Cover a bounded number of areas, then STOP and synthesize.",
  "Output: write TWO files under .exploration/ (your only writable scope):",
  "1) .exploration/report.md — concise human-readable findings.",
  "2) .exploration/report.json — a DiscoveryReport JSON object with EXACTLY these keys:",
  '   { "goal": string, "findings": string[], "candidates": [ { "title": string,',
  '     "rationale": string, "scope": string[] } ], "openQuestions": string[] }.',
  "Each candidate is a bounded, independently-shippable unit; its `scope` lists the",
  "FEW repo-relative paths that work should touch, and candidates should be DISJOINT",
  "so they can run on parallel lanes. Do not edit anything outside .exploration/.",
].join(" ");

function describe(m: BusMessage): string {
  const arrow = m.dir === "down" ? "→ agt " : m.dir === "up" ? "← agt " : "·· sys";
  switch (m.type) {
    case "assign":
      return `${arrow} assign     ${m.task.title}`;
    case "progress":
      return `${arrow} progress   ${m.note}`;
    case "quality_escalation":
      return `${arrow} quality ↑  ${m.from} → ${m.to} (attempt ${m.nextAttempt})`;
    case "result":
      return `${arrow} result     ${m.result.status} — ${m.result.summary}`;
    case "task_completed":
    case "task_failed":
    case "task_out_of_scope":
      return `${arrow} ${m.type.replace("task_", "outcome:")} ${m.result.summary}`;
    default:
      return `${arrow} ${m.type}`;
  }
}

function readReport(): DiscoveryReport | null {
  try {
    const raw = readFileSync(REPORT_JSON, "utf8");
    const obj = JSON.parse(raw) as DiscoveryReport;
    if (!obj || typeof obj.goal !== "string" || !Array.isArray(obj.candidates)) return null;
    return obj;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  // --- OPEN phase: one cheap, read-mostly explorer scoped to its report dir. ---
  const explorer = new SupervisorAgent(
    new ClaudeRunner({
      cwd: repoRoot,
      model: EXPLORER_MODEL,
      systemPrompt: EXPLORER_SYSTEM,
      maxTurns: 40, // bounded roam — the real frugality lever on a Pro plan
      permissionMode: "acceptEdits",
    }),
  );
  explorer.bus.subscribe((m) => console.log(describe(m)));

  console.log(`\n🔭 OPEN exploration (model: ${EXPLORER_MODEL})\n   goal: ${goal}\n`);
  await explorer.run([
    {
      id: "explore",
      title: "discovery pass",
      prompt: `Explore this repository for the goal below and write your discovery report.\n\nGoal: ${goal}`,
      scope: [`${EXPLORE_DIR}/`],
      timeoutMs: 300_000,
      maxRetries: 1,
    },
  ]);

  const report = readReport();
  if (!report) {
    console.error(`\nNo valid ${EXPLORE_DIR}/report.json was produced. See ${EXPLORE_DIR}/report.md if it exists.`);
    process.exitCode = 1;
    return;
  }

  // --- OPEN→CLOSED seam: bounded candidates become scoped closed tasks. ---
  const { tasks, skipped } = discoveryToTasks(report);
  console.log(`\n--- discovered plan ---\n${report.goal}`);
  for (const t of tasks) console.log(`  • ${t.id}  [${t.scope.join(", ")}]  ${t.title}`);
  if (skipped.length) console.log(`  (skipped ${skipped.length} unscoped candidate(s))`);
  if (report.openQuestions?.length) {
    console.log("\nOpen questions for a human:");
    for (const q of report.openQuestions) console.log(`  ? ${q}`);
  }

  if (!RUN) {
    console.log(
      `\nReport: ${EXPLORE_DIR}/report.md  ·  ${tasks.length} task(s) ready.\n` +
        "Re-run with --run to execute them through the CLOSED engine, or crystallize\n" +
        "further with the /grill-with-docs → /to-prd → /to-issues skills first.",
    );
    return;
  }

  // --- CLOSED phase: the existing, frugal, verified execution engine. ---
  console.log(`\n⚙️  CLOSED execution (ladder: ${DEVELOPER_LADDER.join(" → ")}) — ${tasks.length} task(s)\n`);
  const supervisor = new SupervisorAgent(
    new ClaudeRunner({ cwd: repoRoot, permissionMode: "acceptEdits" }),
    {
      // Start each discovered task on the minimal model; escalate one rung per retry.
      modelLadder: DEVELOPER_LADDER,
      concurrency: Math.min(3, tasks.length || 1),
      verification: {
        unit: new ShellTestRunner({ cwd: repoRoot }),
        regression: new ShellTestRunner({ cwd: repoRoot }),
        maxFixRounds: 2,
      },
    },
  );
  supervisor.bus.subscribe((m) => console.log(describe(m)));
  const report2 = await supervisor.run(tasks);
  console.log(`\ncompleted ${report2.completed} · failed ${report2.failed} · out-of-scope ${report2.outOfScope}`);
  process.exitCode = report2.failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
