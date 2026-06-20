import { spawn } from "node:child_process";
import type { TestOutcome, TestRequest, TestRunner } from "../types";

/**
 * The real test runner. It shells out to the repo's token-frugal dispatcher
 * (`devtools/dev test <filter…>`) — the same one the Developer agent uses — so
 * unit and regression runs go through one contract and inherit rtk's
 * failures-only output. The targeted `scope` becomes the test filter, so only
 * the changed modules are exercised; an empty scope is reported by the
 * supervisor as "nothing to test" before we ever get here.
 *
 * Pass/fail is the dispatcher's exit code. Failing files are parsed best-effort
 * from the output purely to help scope a fix; the supervisor falls back to the
 * run's scope when nothing parses, so correctness never depends on the parse.
 *
 * Exercised only on the live `pnpm dev:agents:real` path — never in CI.
 */
export interface ShellTestRunnerOptions {
  /** Repo root to run in (default: process.cwd()). */
  cwd?: string;
  /** Path to the dispatcher relative to cwd. */
  dispatcher?: string;
}

const stripSlash = (p: string): string => p.replace(/\/+$/, "");

export class ShellTestRunner implements TestRunner {
  constructor(private readonly opts: ShellTestRunnerOptions = {}) {}

  async run(req: TestRequest): Promise<TestOutcome> {
    const cwd = this.opts.cwd ?? process.cwd();
    const dispatcher = this.opts.dispatcher ?? "agents/dev-team/devtools/dev";
    const filters = req.scope.map(stripSlash);
    const args = ["test", ...filters];

    req.report(`${req.kind}: sh ${dispatcher} ${args.join(" ")}`);
    const { code, output } = await execDispatcher(cwd, dispatcher, args, req.signal);

    const passed = code === 0;
    const failures = passed ? [] : parseFailures(output);
    return {
      kind: req.kind,
      passed,
      summary: passed
        ? `${req.kind} tests passed${filters.length ? ` (${filters.join(", ")})` : ""}`
        : `${req.kind} tests failed (${failures.length || "see output"} failing)`,
      failures,
      scanned: req.scope,
    };
  }
}

/** Run `sh <dispatcher> <args…>`, capturing combined output and honouring abort. */
function execDispatcher(
  cwd: string,
  dispatcher: string,
  args: string[],
  signal: AbortSignal,
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("sh", [dispatcher, ...args], { cwd });
    let output = "";
    const collect = (chunk: Buffer) => {
      output += chunk.toString();
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);

    const onAbort = () => child.kill("SIGTERM");
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });

    child.on("error", (err) => {
      signal.removeEventListener("abort", onAbort);
      resolve({ code: 1, output: `${output}\n${err.message}` });
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      resolve({ code: code ?? 1, output });
    });
  });
}

/**
 * Best-effort scrape of failing test files from vitest-style output. Matches
 * file-ish tokens ending in a test/spec extension; deduplicated, capped. Empty
 * is a valid answer — the supervisor then scopes the fix at the run's scope.
 */
function parseFailures(output: string): { file: string }[] {
  const re = /([\w./-]+\.(?:test|spec)\.[jt]sx?)/g;
  const files = new Set<string>();
  for (const line of output.split("\n")) {
    // Bias toward lines the reporter marks as failing to avoid summary noise.
    if (!/fail|✗|×|✖|FAIL/i.test(line)) continue;
    for (const m of line.matchAll(re)) files.add(m[1]!.replace(/^\.\//, ""));
  }
  return [...files].slice(0, 50).map((file) => ({ file }));
}
