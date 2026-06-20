import {
  type CanUseTool,
  type Options,
  type PermissionMode,
  query,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { pathInScope, type RunContext, type RunResult, type Runner } from "../types";

/**
 * The real developer runner. It drives one `@anthropic-ai/claude-agent-sdk`
 * `query()` as a single, fixed-scope developer:
 *
 *  - the supervisor's per-attempt timeout is bridged into the SDK's
 *    `abortController`, so a timed-out attempt is actually cancelled;
 *  - `canUseTool` hard-gates edits to the task's `scope` paths, and on a
 *    violation flags it back up the bus and denies the write — the "scope
 *    never changes" guarantee, enforced not just instructed;
 *  - `outputFormat` asks the developer for a structured `RunResult`, parsed
 *    back into our domain type;
 *  - assistant text is relayed as progress on the developer→supervisor channel.
 *
 * This path is exercised by `pnpm dev:agents:real`; the deterministic eval uses
 * `FakeRunner` instead, so this code never runs in CI.
 */

/** Built-in tools that mutate the working tree; gated against task scope. */
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/** Repo-relative path to the token-frugal dev-tool dispatcher (see devtools/dev). */
const DEVTOOLS = "agents/dev-team/devtools/dev";

// Frozen system prompt — keep it a byte-stable constant. The Claude Agent SDK
// applies prompt caching automatically to the system prompt + tool definitions,
// so NEVER interpolate dates, run IDs, or other per-request values here: a single
// changed byte makes every attempt re-write the cache instead of reading it.
// Per-task/volatile context goes in the user prompt (`prompt`, below), which sits
// after the cached prefix and so invalidates nothing upstream of it.
const DEVELOPER_SYSTEM = [
  "You are a Developer agent in a supervised team. You work exactly ONE task.",
  "Your scope is fixed and listed in <scope> in the prompt — the only paths you may modify.",
  "If completing the task would require editing anything outside <scope>, DO NOT do it:",
  "stop, explain what was needed and why it is out of scope, and report status 'out_of_scope'.",
  "Keep changes minimal and focused on the task.",
  // Make the agent run its own checks through the shared dispatcher so it never
  // floods its own context with raw test/tsc output (the script routes through
  // rtk for failures-only results). This is how it self-verifies before reporting.
  `Verify your work by running the project's dev tools YOURSELF via the dispatcher \`${DEVTOOLS}\`:`,
  `\`sh ${DEVTOOLS} verify\` (typecheck + tests, fail-fast) before reporting 'completed';`,
  `\`sh ${DEVTOOLS} test [filter]\`, \`typecheck\`, \`lint\`, \`build\` individually as needed;`,
  `\`sh ${DEVTOOLS} caps\` to see which verbs the current repo supports.`,
  "Do NOT run raw `pnpm test`/`tsc`/`vitest`/`eslint` directly — the dispatcher returns",
  "compact, failures-only output and keeps your context lean. Only report status 'completed'",
  "after `verify` passes. When finished, return the required structured result.",
].join(" ");

const RESULT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["completed", "failed", "out_of_scope"] },
    summary: { type: "string" },
    detail: { type: "string" },
  },
  required: ["status", "summary"],
};

const ResultSchema = z.object({
  status: z.enum(["completed", "failed", "out_of_scope"]),
  summary: z.string(),
  detail: z.string().optional(),
});

export interface ClaudeRunnerOptions {
  /**
   * System prompt for the agent (default: the scoped-developer prompt that tells
   * it to self-verify via `devtools/dev`). Override for non-developer roles —
   * e.g. a triage agent that only administers issues via `gh` and edits no code.
   */
  systemPrompt?: string;
  /** Model id (default: claude-sonnet-4-6 — cheap/fast is right for a scoped task). */
  model?: string;
  /** Repo root the developer operates in (default: process.cwd()). */
  cwd?: string;
  /** Max agentic turns before the SDK stops the attempt. */
  maxTurns?: number;
  /** Hard USD cost ceiling for one attempt. */
  maxBudgetUsd?: number;
  /** Permission mode (default: acceptEdits, with scope gated by canUseTool). */
  permissionMode?: PermissionMode;
  /** Restrict the developer's toolset (optional). */
  allowedTools?: string[];
}

export class ClaudeRunner implements Runner {
  constructor(private readonly opts: ClaudeRunnerOptions = {}) {}

  async run(ctx: RunContext): Promise<RunResult> {
    const { task } = ctx;
    const cwd = this.opts.cwd ?? process.cwd();

    // Bridge the supervisor's timeout signal to an AbortController the SDK takes.
    const abortController = new AbortController();
    const onAbort = () => abortController.abort(ctx.signal.reason);
    if (ctx.signal.aborted) abortController.abort(ctx.signal.reason);
    else ctx.signal.addEventListener("abort", onAbort, { once: true });

    let flaggedOutOfScope = false;
    const canUseTool: CanUseTool = async (toolName, input) => {
      if (WRITE_TOOLS.has(toolName)) {
        const target = firstString(input["file_path"], input["path"], input["notebook_path"]);
        if (target && !pathInScope(toRepoRelative(target, cwd), task.scope)) {
          flaggedOutOfScope = true;
          ctx.flagOutOfScope(target, task.scope);
          return {
            behavior: "deny",
            message: `"${target}" is outside your assigned scope (${task.scope.join(", ")}). Do not edit it — stop and report status 'out_of_scope'.`,
          };
        }
      }
      // Echo the (unmodified) input back as `updatedInput`. The CLI's
      // control-protocol schema for an allow response requires this field; a
      // bare `{ behavior: "allow" }` is rejected with a ZodError, which silently
      // breaks every tool that round-trips through canUseTool (e.g. Bash, so the
      // developer's `devtools/dev verify` self-check never runs). Edits dodged it
      // only because `acceptEdits` approves them CLI-side without this round-trip.
      return { behavior: "allow", updatedInput: input };
    };

    const prompt = `${task.prompt}\n\n<scope>\n${task.scope.join("\n")}\n</scope>`;
    const options: Options = {
      systemPrompt: this.opts.systemPrompt ?? DEVELOPER_SYSTEM,
      cwd,
      // Per-attempt override (the supervisor's quality ladder) wins over the
      // runner's configured default, which is the frugal baseline.
      model: ctx.model ?? this.opts.model ?? "claude-sonnet-4-6",
      maxTurns: this.opts.maxTurns ?? 20,
      permissionMode: this.opts.permissionMode ?? "acceptEdits",
      abortController,
      canUseTool,
      outputFormat: { type: "json_schema", schema: RESULT_JSON_SCHEMA },
      ...(this.opts.maxBudgetUsd !== undefined ? { maxBudgetUsd: this.opts.maxBudgetUsd } : {}),
      ...(this.opts.allowedTools !== undefined ? { allowedTools: this.opts.allowedTools } : {}),
    };

    try {
      let result: RunResult | undefined;
      for await (const message of query({ prompt, options })) {
        const next = this.handleMessage(message, ctx);
        if (next) result = next;
      }
      if (result) return result;
      if (flaggedOutOfScope) {
        return { status: "out_of_scope", summary: "stopped: task required edits outside the assigned scope" };
      }
      return { status: "failed", summary: "developer produced no structured result" };
    } finally {
      ctx.signal.removeEventListener("abort", onAbort);
    }
  }

  private handleMessage(message: SDKMessage, ctx: RunContext): RunResult | undefined {
    if (message.type === "assistant") {
      const text = extractAssistantText(message.message);
      if (text) ctx.report(truncate(text, 200));
      return undefined;
    }
    if (message.type === "result") {
      if (message.subtype === "success") {
        return coerceResult(message.structured_output ?? message.result) ?? {
          status: "completed",
          summary: truncate(message.result, 200),
        };
      }
      const detail = "errors" in message ? message.errors.join("; ") : undefined;
      // Distinguish "ran out of room" (the SDK's turn/budget ceilings) from a
      // genuine execution error, so the supervisor/ledger can treat an
      // early-exit as "needs continuation" rather than "broken". A plan/usage
      // limit that kills the whole process is handled one level up by the run
      // ledger (the next run resumes past already-settled tasks); these subtypes
      // cover the per-attempt ceilings the SDK reports cleanly.
      const endedEarly =
        message.subtype === "error_max_turns" || message.subtype === "error_max_budget_usd";
      const base: RunResult = {
        status: "failed",
        summary: `${endedEarly ? "ended early" : "agent error"}: ${message.subtype}`,
        ...(endedEarly ? { endedEarly: true } : {}),
      };
      return detail ? { ...base, detail } : base;
    }
    return undefined;
  }
}

// --- helpers ---------------------------------------------------------------

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) if (typeof v === "string" && v.length > 0) return v;
  return undefined;
}

function toRepoRelative(p: string, cwd: string): string {
  if (p.startsWith(cwd)) return p.slice(cwd.length).replace(/^\/+/, "");
  return p.replace(/^\.?\//, "");
}

function extractAssistantText(message: { content?: unknown }): string | undefined {
  const blocks = (message.content ?? []) as Array<{ type?: string; text?: string }>;
  const text = blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join(" ")
    .trim();
  return text.length > 0 ? text : undefined;
}

function coerceResult(value: unknown): RunResult | undefined {
  let candidate = value;
  if (typeof value === "string") {
    try {
      candidate = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  const parsed = ResultSchema.safeParse(candidate);
  if (!parsed.success) return undefined;
  const out: RunResult = { status: parsed.data.status, summary: parsed.data.summary };
  if (parsed.data.detail !== undefined) out.detail = parsed.data.detail;
  return out;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
