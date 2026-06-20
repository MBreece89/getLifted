/**
 * Triage every open GitHub issue with the dev-team Supervisor.
 *
 *   pnpm dev:agents:issues          # DRY RUN — print the plan, no SDK spend, no edits
 *   pnpm dev:agents:issues --live   # LIVE   — one triage agent per issue, real gh edits
 *
 * The Supervisor processes issues ONE AT A TIME and spawns a FRESH single-use
 * Developer (here a triage agent) for each assignment — the previous one is let
 * go (enforced by DeveloperAgent's single-use guard). Each agent administers its
 * one issue purely via the `gh` CLI (its edit scope is empty, so it can touch no
 * repository file) and reports the label decision.
 *
 * Critical issues (anything carrying the `security` label, or that an agent
 * marks `CRITICAL:`) are surfaced *sooner* — announced up front and spoken aloud
 * via macOS `say` — instead of waiting for the end-of-run summary.
 *
 * Requires `gh` authenticated; the live path requires Claude Code auth / ANTHROPIC_API_KEY.
 */
import { execFile, execFileSync } from "node:child_process";
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
const LEDGER_FILE = path.join(here, ".run-ledger.issues-triage.jsonl");
const LIVE = process.argv.includes("--live");

/**
 * The triage label state machine — see docs/agents/triage-labels.md.
 * Frozen constant: keep byte-stable so the Agent SDK's automatic prompt caching
 * reads (not re-writes) the system prefix across issues — see DEVELOPER_SYSTEM
 * in runners/ClaudeRunner.ts for the rationale.
 */
const TRIAGE_SYSTEM = [
  "You are a Triage agent in a supervised team. You handle exactly ONE GitHub issue.",
  "You make administrative changes ONLY via the `gh` CLI; you must not modify any repository",
  "file (your edit scope is empty). Steps for your one issue:",
  "1) Read it: `gh issue view <n>` (and its comments if useful).",
  "2) Decide the single correct triage label:",
  "   - needs-triage: a maintainer still has to evaluate it;",
  "   - needs-info: blocked waiting on the reporter for missing information;",
  "   - ready-for-agent: fully specified, an autonomous agent can implement it as-is;",
  "   - ready-for-human: needs a human decision, or hands-on/manual/infra/verification work;",
  "   - wontfix: will not be actioned.",
  "3) Apply it: `gh issue edit <n> --add-label <chosen> --remove-label <other triage labels>`.",
  "   Remove any OTHER triage label, but PRESERVE non-triage labels such as `enhancement` and `security`.",
  "Do NOT close the issue, change its title, or post comments.",
  "If the issue is CRITICAL — a security vulnerability, data loss, or a production-breaking bug —",
  "begin your summary with 'CRITICAL:' and say why.",
  "Report status 'completed' once the label is set, with summary = the decision, e.g.",
  "'needs-triage -> ready-for-agent'.",
].join(" ");

interface OpenIssue {
  number: number;
  title: string;
  labels: { name: string }[];
}

function fetchOpenIssues(): OpenIssue[] {
  const out = execFileSync(
    "gh",
    ["issue", "list", "--state", "open", "--limit", "100", "--json", "number,title,labels"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return JSON.parse(out) as OpenIssue[];
}

const isCritical = (issue: OpenIssue): boolean =>
  issue.labels.some((l) => l.name === "security");

function toTask(issue: OpenIssue): Task {
  const labels = issue.labels.map((l) => l.name).join(", ") || "(none)";
  return {
    id: `triage-${issue.number}`,
    title: `triage #${issue.number}: ${issue.title}`,
    prompt: [
      `Triage GitHub issue #${issue.number} ("${issue.title}").`,
      `Its current labels are: ${labels}.`,
      "Read it, decide the one correct triage label per your instructions, and apply it with `gh`.",
      "Preserve non-triage labels. Report the before -> after label decision.",
    ].join(" "),
    scope: [], // empty: the triage agent may edit no repository file
    timeoutMs: 120_000,
    maxRetries: 1,
  };
}

/** Speak + print an alert (macOS `say`; print-only elsewhere). */
function alert(text: string): void {
  console.log(`\n🔊 ALERT: ${text}\n`);
  execFile("say", [text], () => {}); // fire-and-forget; ignore if `say` is absent
}

function describe(m: BusMessage): string {
  const arrow = m.dir === "down" ? "→ agt " : m.dir === "up" ? "← agt " : "·· sup";
  switch (m.type) {
    case "assign":
      return `${arrow} assign     ${m.task.title}`;
    case "progress":
      return `${arrow} progress   ${m.note}`;
    case "result":
      return `${arrow} result     ${m.result.status} — ${m.result.summary}`;
    case "retry":
      return `${arrow} retry      (${m.reason}) → attempt ${m.nextAttempt}`;
    case "escalation":
      return `${arrow} ESCALATION ${m.reason}`;
    case "task_completed":
    case "task_failed":
    case "task_out_of_scope":
      return `${arrow} ${m.type.replace("task_", "outcome:")} ${m.result.summary}`;
    default:
      return `${arrow} ${m.type}`;
  }
}

function printPlan(tasks: Task[], issues: OpenIssue[]): void {
  console.log(`\nDRY RUN — ${tasks.length} open issue(s), one triage agent each (fresh per issue).`);
  console.log("No SDK spend and no GitHub changes. Re-run with --live to execute.\n");
  for (const issue of issues) {
    const flag = isCritical(issue) ? " ⚠️ CRITICAL (security)" : "";
    const labels = issue.labels.map((l) => l.name).join(", ") || "(none)";
    console.log(`  #${issue.number}  [${labels}]${flag}\n        ${issue.title}`);
  }
  console.log("\nEach agent will: gh issue view → decide a triage label → gh issue edit (labels only).");
}

async function main(): Promise<void> {
  const issues = fetchOpenIssues();
  if (issues.length === 0) {
    console.log("No open issues — nothing to triage.");
    return;
  }
  const tasks = issues.map(toTask);

  // Soonest possible heads-up: announce critical issues before any work starts.
  const critical = issues.filter(isCritical);
  if (critical.length > 0) {
    alert(
      `Heads up: ${critical.length} critical issue${critical.length > 1 ? "s" : ""} in this triage batch — ` +
        critical.map((i) => `number ${i.number}`).join(", ") + ".",
    );
  }

  if (!LIVE) {
    printPlan(tasks, issues);
    return;
  }

  const ledger = new JsonlRunLedger(LEDGER_FILE);
  const supervisor = new SupervisorAgent(
    new ClaudeRunner({
      cwd: repoRoot,
      // Closed-set label classification driven purely via `gh` — a Haiku-class task.
      // Env-overridable (mirrors EXPLORER_MODEL) so a batch can be bumped if needed.
      model: process.env.TRIAGE_MODEL ?? "claude-haiku-4-5-20251001",
      systemPrompt: TRIAGE_SYSTEM,
      // gh runs through Bash; no Write/Edit so the agent cannot touch repo files.
      allowedTools: ["Bash", "Read", "Grep", "Glob"],
      maxBudgetUsd: 0.3,
      permissionMode: "acceptEdits",
    }),
    {
      // No verification: triage changes no code, so the test agents would have nothing to do.
      // Resume: a killed triage batch skips issues already labeled this run; a clean
      // finish finalizes the ledger so the next nightly run re-triages from scratch.
      ledger,
    },
  );

  // Alert sooner the moment an agent flags its issue critical, not at the end.
  supervisor.bus.subscribe((m) => {
    console.log(describe(m));
    if (m.type === "result" && /^critical/i.test(m.result.summary)) {
      alert(`Agent flagged a critical issue on ${m.taskId.replace("triage-", "number ")}: ${m.result.summary}`);
    }
  });

  // Heartbeat the run-state so `/status` can report supervisor/agent activity live.
  const tracker = new RunStateTracker(supervisor.bus, {
    mode: "issues-triage",
    totalTasks: tasks.length,
    filePath: STATE_FILE,
  });

  console.log(`\nSupervisor triaging ${tasks.length} open issue(s), one fresh agent each…\n`);
  try {
    const report = await supervisor.run(tasks);
    tracker.finish();
    ledger.finalize(); // batch finished cleanly → next nightly run re-triages fresh

    console.log("\n--- triage report ---");
    for (const r of report.records) {
      console.log(`  ${r.task.id.padEnd(12)} ${r.status.padEnd(13)} ${r.result.summary}`);
    }
    console.log(`\ncompleted ${report.completed} · failed ${report.failed} · out-of-scope ${report.outOfScope}`);
    process.exitCode = report.failed > 0 ? 1 : 0;
  } catch (err) {
    tracker.interrupt(); // ledger NOT finalized → next run resumes the un-triaged issues
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
