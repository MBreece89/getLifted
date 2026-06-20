import type { TestKind, TestOutcome, TestRequest, TestRunner } from "../types";

/**
 * A scripted test runner for the eval. Each `run()` consumes the next entry in
 * the script (the last entry repeats), so a sequence like
 * `[failing(...), passing()]` models "failed, then passed after a fix" without
 * spawning a process. A function form lets a test compute the outcome from the
 * request + call index.
 */
export type FakeTestScript =
  | TestOutcome[]
  | ((req: TestRequest, call: number) => TestOutcome | Promise<TestOutcome>);

export class FakeTestRunner implements TestRunner {
  private calls = 0;
  constructor(private readonly script: FakeTestScript) {}

  async run(req: TestRequest): Promise<TestOutcome> {
    const call = this.calls++;
    if (typeof this.script === "function") return this.script(req, call);
    if (this.script.length === 0) {
      throw new Error("FakeTestRunner: empty script");
    }
    const entry = this.script[Math.min(call, this.script.length - 1)]!;
    // Stamp the request's targeted scope onto the outcome so assertions can see
    // what was actually exercised, just like the real runner echoes it.
    return { ...entry, kind: req.kind, scanned: req.scope };
  }
}

// --- Outcome builders ------------------------------------------------------

/** A passing run of the given kind. */
export const passing = (kind: TestKind = "unit"): TestOutcome => ({
  kind,
  passed: true,
  summary: `${kind} tests passed`,
  failures: [],
  scanned: [],
});

/** A failing run citing the given test files (drive the fix loop). */
export const failing = (kind: TestKind, files: string[]): TestOutcome => ({
  kind,
  passed: false,
  summary: `${kind} tests failed (${files.length} failing)`,
  failures: files.map((file) => ({ file })),
  scanned: [],
});
