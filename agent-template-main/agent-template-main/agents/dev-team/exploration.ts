/**
 * OPEN → CLOSED seam.
 *
 * The explorer (an OPEN, token-frugal discovery agent) roams wide and produces a
 * `DiscoveryReport`: a goal, what it found, and a set of bounded *candidate* work
 * items — each with a proposed scope. `discoveryToTasks` turns those candidates
 * into the CLOSED engine's `Task[]`, which the `SupervisorAgent` runs under its
 * usual assign → verify → escalate guarantees.
 *
 * This file is deliberately pure (no SDK, no IO) so the OPEN→CLOSED handoff is
 * unit-testable offline, like the rest of the harness.
 */
import type { Task } from "./types";

/** One bounded unit of work the explorer proposes for the closed engine. */
export interface DiscoveryCandidate {
  /** Short imperative title (becomes the task title). */
  title: string;
  /** Why this is worth doing / what was discovered (folded into the prompt). */
  rationale: string;
  /**
   * The only paths this work should touch — the closed developer is hard-gated to
   * them. Keep candidates *disjoint* so they can run on parallel lanes.
   */
  scope: string[];
}

/** What an explorer hands back after an OPEN discovery pass. */
export interface DiscoveryReport {
  /** The overarching goal the exploration was oriented around. */
  goal: string;
  /** Compressed notes on what was found (for humans + the crystallization step). */
  findings: string[];
  /** Bounded, scoped work items to feed the closed engine. */
  candidates: DiscoveryCandidate[];
  /** Unknowns a human should resolve before/while the closed work runs. */
  openQuestions: string[];
}

/** Defaults applied to every task minted from a candidate. */
export interface ToTaskDefaults {
  /** Wall-clock budget per attempt (ms). */
  timeoutMs?: number;
  /** Retries before the supervisor escalates. */
  maxRetries?: number;
  /** Prefix for generated task ids (default "explore"). */
  idPrefix?: string;
}

/** Stable, filesystem-safe slug from a title, for deterministic task ids. */
function slug(title: string, index: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base.length > 0 ? `${index + 1}-${base}` : `${index + 1}`;
}

/**
 * Convert a discovery report's candidates into closed `Task`s. Candidates with an
 * empty scope are dropped (the closed engine refuses unscoped work by design) and
 * reported via the returned `skipped` list, so nothing is silently lost.
 */
export function discoveryToTasks(
  report: DiscoveryReport,
  defaults: ToTaskDefaults = {},
): { tasks: Task[]; skipped: DiscoveryCandidate[] } {
  const timeoutMs = defaults.timeoutMs ?? 120_000;
  const maxRetries = defaults.maxRetries ?? 1;
  const idPrefix = defaults.idPrefix ?? "explore";

  const tasks: Task[] = [];
  const skipped: DiscoveryCandidate[] = [];

  report.candidates.forEach((c, i) => {
    const scope = c.scope.filter((s) => s.trim().length > 0);
    if (scope.length === 0) {
      skipped.push(c);
      return;
    }
    tasks.push({
      id: `${idPrefix}-${slug(c.title, i)}`,
      title: c.title,
      prompt: [
        `Goal (from exploration): ${report.goal}`,
        `Task: ${c.title}.`,
        c.rationale ? `Context: ${c.rationale}` : "",
        "Implement only within your scope; flag anything that would require going outside it.",
      ]
        .filter(Boolean)
        .join("\n"),
      scope,
      timeoutMs,
      maxRetries,
    });
  });

  return { tasks, skipped };
}
