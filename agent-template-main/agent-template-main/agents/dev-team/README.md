# dev-team — Developer Supervisor + Developer agent process

A small, enforced multi-agent dev process built on
[`@anthropic-ai/claude-agent-sdk`](https://code.claude.com/docs/en/agent-sdk/typescript).
It is **tooling, not shipped product code** — it has its own `package.json` and
`node_modules` under `agents/`, lives outside the product's build and test, and
can never affect a deploy.

The same five roles are also available as **native Claude Code subagents** under
`.claude/agents/` (`developer-supervisor`, `developer`, `verifier`, `remediator`,
`utility-reviewer`), so you can drive the process interactively or programmatically.

## The roles

| Role | Responsibility |
|---|---|
| **Developer Supervisor** (`SupervisorAgent.ts`) | Owns the task queue. For each task: assign → monitor → **time out** → **retry with backoff** → **escalate**. When a task completes, runs the **test agents** and dispatches **fix developers** until green. Per-report judgement is delegated to a swappable `Policy`. |
| **Developer** (`DeveloperAgent.ts`) | Works exactly **one** task. Its `scope` is fixed; work outside it is **flagged back**, never performed. Thin relay onto the message bus. |
| **Unit test agent** | A `TestRunner` the supervisor runs on a **completed** task, targeted at **only the modules that changed**. |
| **Regression test agent** | A `TestRunner` run after unit, targeted at the changed modules **plus everything that depends on them** — to catch ripple breakage. |

The two communicate **both ways** over `MessageBus`:

```
supervisor → developer   assign · steer · scope_decision        (dir: "down")
developer  → supervisor   progress · blocked · flag_out_of_scope · result   (dir: "up")
supervisor  (lifecycle)   retry · escalation · task_completed/failed/out_of_scope   (dir: "system")
supervisor  (verify)      test_started · test_result · fix_dispatched · verified · verify_exhausted   (dir: "system")
```

## Verification: test agents + the fix loop

When the supervisor is built with a `verification` option, every developer task
that reaches `completed` is handed to the test agents before it counts as done:

```
                  ┌─────────────── changed paths (changeSet, defaults to task.scope)
                  ▼
   targeting.ts → unit scope (changed modules)   ── unit agent ──┐
                → regression scope (+ dependents) ── regression ──┤
                                                                  ▼
                              all pass ──────────────────► record VERIFIED (rounds=0)
                              a kind fails ──► dispatch a scoped Developer fix-task
                                              (failing files + their modules + scope)
                                              ──► re-verify from scratch
                                              ──► repeat up to maxFixRounds
                                                  then escalate (UNVERIFIED → failed)
```

So a failing test is not a dead end — it becomes a **new fixed-scope developer
task**, run through the same timeout/retry/escalate machinery, and the suite is
re-run until it is green or the fix-round budget is spent. A still-failing task
is flipped to `failed`/`escalated`; the per-task record carries the full
`verification` story (`verified` | `skipped` | `exhausted` | `fix_failed`, the
rounds used, and every test run).

### Targeting — don't re-scan unchanged code

`targeting.ts` turns the task's changed paths into the **minimal** set of module
scopes worth testing, against a `ModuleGraph` you define per project in
**`modules.config.ts`** (default: empty → verification *skips* until you fill it
in). **Unit** runs only the changed modules; **regression** fans out to their
dependents (e.g. `packages/shared` → `apps/api` + `apps/web`). If nothing maps to
a known module, the run is **skipped** — the whole app is never re-scanned for an
untouched area. The targeted scope becomes the `devtools/dev test` filter, so only
those packages execute. `targeting.ts` ships an `EXAMPLE_MODULE_GRAPH` as a worked
reference; copy its shape into `modules.config.ts`.

### Concurrency — parallel lanes

`SupervisorAgent` takes a `concurrency` option (default 1 = sequential,
order-preserving). Raise it to advance N tasks with **disjoint scopes** at once —
each lane is the full assign → verify → escalate loop pulling from the same queue,
and `records` always settle in input order. The `ClaudeRunner` scope gate stops a
lane writing another lane's files, so well-chosen disjoint scopes never collide.
`teamTask.ts` (`npm run dev:team`) is the worked example: three parallel lanes.

### Quality ladder — minimal first, escalate on need

`SupervisorAgent` takes an optional `modelLadder` (model ids, cheapest-first).
Every task — and every dispatched fix-task — starts on the **minimal** model
(`modelLadder[0]`); each *retry* climbs one rung, so easy work stays cheap and only
a struggling task pulls in a stronger (more expensive) model. The top rung repeats
once reached, and a `quality_escalation` bus message marks each bump. The model is
threaded per attempt to the runner (`ctx.model`), which prefers it over its own
configured default; omit the ladder to keep a single model for every attempt.
`realTask.ts` and the CLOSED phase of `exploreTask.ts` wire `haiku → sonnet → opus`.

Verification is opt-in and fully deterministic in the eval: `FakeTestRunner`
scripts pass/fail outcomes (and `FakeRunner`'s `fallback` lets dispatched
fix-tasks resolve) so the real fix loop is exercised with no network.

## Why it's testable without spending tokens

The developer depends on a `Runner` interface, not on `query()` directly:

- **`FakeRunner`** — scripted, deterministic; drives the eval.
- **`ClaudeRunner`** — wraps the real Agent SDK `query()`.

The supervisor's control loop (timeout/retry/escalate) is deterministic code,
so the eval exercises the **real orchestration** against `FakeRunner`. Only
`ClaudeRunner` touches the network.

### Timeouts & retries are enforced, not advisory

- `withTimeout(ms, fn)` (`reliability.ts`) gives each attempt a hard wall-clock
  budget; on expiry it settles with `TimeoutError` **before** aborting the
  attempt's `AbortSignal`, so the outcome is deterministic. `ClaudeRunner`
  bridges that signal into the SDK's `abortController`, so a timed-out attempt
  is genuinely cancelled.
- `withRetry(fn, { maxRetries, backoffMs })` retries failures/timeouts with
  exponential backoff and surfaces a final escalation when exhausted.

### Scope is enforced, not just instructed

`ClaudeRunner` passes a `canUseTool` gate that denies any `Write`/`Edit`/
`MultiEdit`/`NotebookEdit` to a path outside the task's `scope`, flags it up the
bus, and returns `out_of_scope`.

### The developer runs its own dev tools (token-frugal)

A Developer that floods its own context with raw `pnpm test` / `tsc` output is
expensive and slow. So `ClaudeRunner` instructs the developer to self-verify
through one shared, repo-agnostic dispatcher — `devtools/dev` — instead of
calling test/lint/typecheck tools directly:

```bash
sh agents/dev-team/devtools/dev verify        # typecheck + tests, fail-fast (the pre-report gate)
sh agents/dev-team/devtools/dev test [filter]  # tests only; filter passed through
sh agents/dev-team/devtools/dev typecheck      # types only
sh agents/dev-team/devtools/dev lint           # lint only
sh agents/dev-team/devtools/dev build          # build only
sh agents/dev-team/devtools/dev caps           # JSON: which verbs this repo supports
```

Every verb is routed through [`rtk`](https://github.com/) (Rust Token Killer)
when it is on `PATH`, so the developer gets failures-only / grouped output
(60-99% fewer tokens) and degrades gracefully to the raw tool when `rtk` is
absent. The script discovers the repo root, package manager, and which npm
scripts actually exist, so **any** Developer-agent instance dropped into a
pnpm/npm/yarn workspace gets the same `dev <verb>` contract — no per-repo
memorisation. The developer is told to report `completed` only after `verify`
passes.

## Run it

All commands run from the `agents/` directory (one-time `npm install` first).

```bash
# Deterministic eval — every flow type, no network, no tokens:
npm run test:agents
#   ├─ happy path · timeout → retry · fail → escalate · scope pushback
#   ├─ targeting (unit narrow · regression fan-out · skip)
#   ├─ verify → fix loop (pass · fix·re-verify · exhaust · fix-failed)
#   └─ concurrency (lane cap respected · records in input order)

# Live Agent SDK entry points (need Claude Code auth / ANTHROPIC_API_KEY):
npm run dev:real            # one safe scratch task, end to end
npm run dev:team            # three parallel lanes (concurrency demo)
npm run dev:issues          # triage open GitHub issues (dry-run; add -- --live)
npm run dev:explore -- "goal"  # OPEN: cheap discovery → scoped plan; add --run to execute (CLOSED)
```

## OPEN → CLOSED

`exploreTask.ts` is the **OPEN** front-end: a token-frugal `explorer` (Haiku,
read-mostly, bounded `maxTurns`) roams the repo and writes `.exploration/report.json`
(a `DiscoveryReport`). `exploration.ts`'s pure `discoveryToTasks()` turns its scoped
candidates into closed `Task`s, which the existing supervisor → developer → verifier
loop executes. On a Pro plan the limit is *tokens, not dollars* — `maxBudgetUsd` is
inert; frugality comes from the cheap model, bounded turns, and read-mostly roaming.

## Files

```
dev-team/
  types.ts            Task · Runner · RunResult · BusMessage · TestRunner · VerificationOutcome · pathInScope()
  messageBus.ts       typed two-way pub/sub + history (eval asserts on this)
  reliability.ts      withTimeout · withRetry (enforced timeouts/retries)
  targeting.ts        ModuleGraph · changed paths → unit/regression/fix scopes (+ EXAMPLE_MODULE_GRAPH)
  modules.config.ts   PER-PROJECT module graph — EDIT THIS (empty default → verification skips)
  DeveloperAgent.ts   one fixed-scope task; relays up the bus
  SupervisorAgent.ts  queue + assign/monitor/timeout/retry/escalate + verify→fix + concurrency lanes
  policy.ts           RuleBasedPolicy (default) · LlmPolicy (stub)
  runState.ts         heartbeat sink — emits run-state JSON for /status
  runners/
    FakeRunner.ts     scripted behaviours: completes/fails/hangs/refusesOutOfScope (+ fallback)
    ClaudeRunner.ts   real Agent SDK query(): abort bridge, canUseTool scope gate, outputFormat
    FakeTestRunner.ts scripted test outcomes (passing/failing) for the verify eval
    ShellTestRunner.ts real test agent: shells `devtools/dev test <filter>`, parses failures
  exploration.ts      OPEN→CLOSED seam: DiscoveryReport · discoveryToTasks() (pure, tested)
  realTask.ts         entry — one real, safely-scoped scratch task, verified by the test agents
  teamTask.ts         entry — three parallel lanes (concurrency demo)
  issuesTask.ts       entry — triage every open GitHub issue (one fresh agent each)
  exploreTask.ts      entry — OPEN discovery (Haiku) → discoveryToTasks → closed execution
  devtools/
    dev               token-frugal dev-tool dispatcher the developer runs itself (rtk-routed)
    README.md         the dispatcher's contract, for humans and agents
  __tests__/
    flows.eval.test.ts    the four-flow eval
    reliability.test.ts   timeout/retry unit tests
    targeting.test.ts     change → module-scope targeting
    verify.eval.test.ts   the verify → fix loop eval
    concurrency.test.ts   parallel lanes: cap respected, records in input order
    exploration.test.ts   OPEN→CLOSED seam: discoveryToTasks candidate→task mapping
    developer.test.ts · runState.test.ts   developer single-use guard · heartbeat
```

## Follow-ups (intentionally out of scope)

- `LlmPolicy`: an LLM-backed supervisor decision policy (the seam already
  exists; the control loop calls `policy.decide()`).
- A harness `utilityReview` phase (the interactive `utility-reviewer` subagent
  already covers this role).
- Run persistence / metrics; git-worktree isolation per lane.
