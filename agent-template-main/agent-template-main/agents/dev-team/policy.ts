import type { RunResult } from "./types";

/** What the supervisor should do with a developer's attempt result. */
export type PolicyDecision = "accept" | "retry";

/**
 * Decides how the supervisor reacts to each developer report. Swapping the
 * policy changes supervisor judgement without touching the control loop.
 */
export interface Policy {
  decide(result: RunResult): PolicyDecision;
}

/**
 * Default deterministic policy: retry failures, accept everything else.
 * `out_of_scope` is accepted as a terminal outcome — it is the developer
 * correctly refusing work, not a failure to retry.
 */
export class RuleBasedPolicy implements Policy {
  decide(result: RunResult): PolicyDecision {
    return result.status === "failed" ? "retry" : "accept";
  }
}

/**
 * Placeholder for an LLM-backed policy (a small planning `query()` that reads
 * the report and decides). The control loop already calls `decide()`, so this
 * can be filled in later without any other change. Intentionally not wired.
 */
export class LlmPolicy implements Policy {
  decide(_result: RunResult): PolicyDecision {
    throw new Error(
      "LlmPolicy is a stub — wire a planning query() here, or use RuleBasedPolicy.",
    );
  }
}
