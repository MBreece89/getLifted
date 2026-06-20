---
name: prod-triage
description: A read-only production-health triage report for <PROD_DOMAIN> — outside-in site reachability (HTTP status, latency, TLS cert expiry), /api/health liveness, latest Vercel deployment state (READY/ERROR/BUILDING) with build/runtime logs on failure, Supabase project health (paused/over-quota), DB connectivity, security/perf advisors, recent error logs, cron freshness for all 5 scheduled jobs, and an error-rate sweep (auth, webhook, Stripe). Produces a prioritized verdict: 🔴 Act now / 🟡 Investigate / 🟢 Healthy, ending with a short likely-culprit and next-step. Use when the user asks "is prod down", "prod triage", "check production", "site is down", "health check", "what's wrong with production", or runs /prod-triage. Read-only: it gathers and recommends, it must NOT restart, redeploy, revert, pause/resume, or mutate anything.
---

# prod-triage

A **read-only production-health orchestrator** for the first ten minutes of a
production incident (or a routine health pulse). It assembles — in one pass —
every signal you'd otherwise check by hand, then ranks findings into:

- **🔴 Act now** — confirmed broken: site 5xx, DB paused, failed/rolled-back
  deploy, expired TLS cert.
- **🟡 Investigate** — degraded: elevated errors, slow latency, security or
  performance advisors, stale/failing cron jobs.
- **🟢 Healthy** — confirmed fine; shown so you know it was checked.

It ends with a short **"likely culprit / next step"** so there is always one
clear thing to do.

It is **read-only**. It never redeploys, reverts, restarts, pauses/resumes,
runs DDL, or mutates any record — it *recommends* the fix and shows the exact
command; the human pulls the trigger.

> **Why this matters here:** a merge to `main` auto-deploys to production via
> Vercel (see `AGENTS.md` → Deployment). So the **latest production deployment
> is the prime suspect** in almost any sudden outage — correlate "when did it
> break" with "what just shipped."

## Targets (<PROD_DOMAIN> production)

| What | Value |
|---|---|
| Site (outside-in) | `https://<PROD_DOMAIN>` |
| App + DB health | `https://<PROD_DOMAIN>/api/health` → `{"status":"ok",…}` |
| Vercel project | `<VERCEL_PROJECT>` (or resolve via `get_project` / `list_projects`) |
| Supabase project ref | `<SUPABASE_PROJECT_REF>` |
| Repo | current repo, production branch `main` |
| Crons (vercel.json) | `retry-webhooks` (daily 06:00), `safe-check-escalate` (daily 07:00), `witness-reminders` (daily 09:00), `weekly-digest` (Mon 08:00), `audit-retention-purge` (Sun 03:00) |

If any constant has drifted, rediscover it (`get_project`, `list_projects`,
`git remote -v`) rather than trusting the table blindly.

## Tooling — detect, don't assume; degrade gracefully

- **Always available:** `curl` for public endpoint probes, `gh` for
  repo/commit/deploy state, `openssl` for TLS cert inspection.
- **MCP (preferred for deploy + DB internals):** Vercel MCP tools
  (`list_deployments`, `get_deployment`, `get_runtime_logs`, `get_project`)
  and Supabase MCP tools (`get_project`, `get_advisors`, `get_logs`,
  `execute_sql`, `list_migrations`). Prefer these over polling endpoints when
  available.
- **No MCP:** fall back to `gh` commit statuses for Vercel deploy state (the
  Vercel GitHub integration posts a status per commit with an inspector URL)
  and to the `/api/health` response for the DB signal.
- **If a source is unreachable, say so and keep going** — a partial report
  beats aborting. Never let one failed call sink the whole report; mark that
  source `unavailable` and continue.
- Do **not** route calls through `rtk`; use plain `curl`/`gh`/MCP directly so
  JSON stays parseable.

## Gather (run all sections in parallel; each is independent)

### A. Site / edge — outside-in curl

```bash
# HTTP status + latency (follow redirects; treat 2xx/3xx as up)
curl -sS -m 15 -o /dev/null \
  -w "site %{http_code}  latency %{time_total}s\n" \
  -L https://<PROD_DOMAIN>

# TLS certificate validity + expiry
echo | openssl s_client -connect <PROD_DOMAIN>:443 -servername <PROD_DOMAIN> \
  2>/dev/null | openssl x509 -noout -dates -subject
```

Interpret results:
- HTTP 5xx or connection timeout → **site down** (🔴).
- HTTP 4xx on root → **site error** (🔴, unless it's a known redirect pattern).
- HTTP 2xx/3xx → site reachable; note actual code.
- TLS `notAfter` already past → **cert expired** (🔴); within 14 days → **cert
  expiring soon** (🟡); otherwise healthy.
- Latency > 3 s → **slow response** (🟡).

### B. App + database liveness — /api/health

```bash
curl -sS -m 20 \
  -w "\nHTTP %{http_code}  latency %{time_total}s\n" \
  https://<PROD_DOMAIN>/api/health
```

Interpret results:
- Non-200 or timeout → **API/app down** (🔴).
- 200 but body does not contain `"status":"ok"` (or equivalent) → **API
  degraded** (🟡).
- 200 + ok + `db` field present and not `"ok"` → **DB connection failing from
  app** (🔴 if hard error, 🟡 if latency spike only).
- `ms` value (DB round-trip in the response, if present): > 500 ms → slow DB
  (🟡).

### C. Vercel deployment state

Prefer MCP:
```
list_deployments(projectId="<VERCEL_PROJECT>")    # newest first; look for target:"production"
get_project(id="<VERCEL_PROJECT>")               # overall project health, env config
```

For the newest `target:"production"` deployment, report:
- `state` (`READY` / `BUILDING` / `ERROR` / `QUEUED` / `CANCELED`)
- `githubCommitSha` (short) + `githubCommitMessage` + associated PR/issue number
- `createdAt` → compute age

Flags:
- `state: ERROR` → **failed deploy** (🔴); pull
  `get_deployment` details + `get_runtime_logs` for the top error line.
- `state: BUILDING` for > 10 min → **stuck build** (🟡).
- `isRollbackCandidate: false` on the prior READY deploy → no safe rollback
  target (mention it).
- If a deployment was manually rolled back → flag it (🔴).

No MCP? Fall back to gh commit statuses:
```bash
LATEST_SHA=$(gh api repos/:owner/:repo/commits/main -q .sha)
gh api repos/:owner/:repo/commits/${LATEST_SHA}/statuses \
  -q '.[] | .context + " → " + .state + "  " + .target_url' | head -10
```

### D. Supabase / database health

Prefer MCP (skip silently if not present):
```
get_project(id="<SUPABASE_PROJECT_REF>")
```
Interpret `status`:
- `PAUSED` / `INACTIVE` / not `ACTIVE_HEALTHY` → **database down at the
  platform** (🔴 — a paused project is the single most common outage cause
  here). Resolution: resume from the Supabase dashboard.
- `ACTIVE_HEALTHY` → platform healthy; proceed to deeper checks.
- Any `OVER_QUOTA` signal → 🟡.

```
get_advisors(project_id="<SUPABASE_PROJECT_REF>", type="security")
get_advisors(project_id="<SUPABASE_PROJECT_REF>", type="performance")
```
- Report **new or critical** advisors only (🟡). Skip routine/informational
  noise — don't dump the full list.

```
get_logs(project_id="<SUPABASE_PROJECT_REF>", service="postgres")
get_logs(project_id="<SUPABASE_PROJECT_REF>", service="auth")
get_logs(project_id="<SUPABASE_PROJECT_REF>", service="api")
```
- Quote the top distinct error from each service (last ~15 min). Suppress
  routine health-check noise.

DB connectivity probe via MCP:
```
execute_sql(project_id="<SUPABASE_PROJECT_REF>", query="SELECT 1 AS ok")
```
- Failure → **DB unreachable** (🔴).
- Success → DB reachable; optionally probe one core table:
  `SELECT count(*) FROM <CORE_TABLE> LIMIT 1` (catches schema/permission
  issues; `<CORE_TABLE>` is the canonical stamps table — there is no `stamps`
  table).

Migration drift:
```
list_migrations(project_id="<SUPABASE_PROJECT_REF>")
```
- Compare the latest applied migration against the newest file in
  `supabase/migrations/`. Any un-applied migration on `main` = drift (🟡).

### E. Cron freshness

Read the cron config from `vercel.json`:
```bash
cat vercel.json   # parse the "crons" array
```

The 5 crons and their expected cadences:
| Path | Schedule | Max expected gap |
|---|---|---|
| `/api/cron/retry-webhooks` | `0 6 * * *` (daily) | 26 h |
| `/api/cron/safe-check-escalate` | `0 7 * * *` (daily) | 26 h |
| `/api/cron/witness-reminders` | `0 9 * * *` (daily) | 26 h |
| `/api/cron/weekly-digest` | `0 8 * * 1` (weekly Mon) | 8 days |
| `/api/cron/audit-retention-purge` | `0 3 * * 0` (weekly Sun) | 8 days |

Check for cron execution evidence via Vercel runtime logs:
```
get_runtime_logs(projectId="<VERCEL_PROJECT>")   # filter for /api/cron/ paths
```
- For each cron path: find the most recent invocation in the logs.
- Last run more than `max expected gap` ago (or no log entry at all) → **stale
  cron** (🟡).
- HTTP 5xx response on a cron invocation → **failing cron** (🟡 to 🔴 depending
  on severity).

No MCP logs? Note it as `unavailable` — don't invent state.

### F. Recent changes (correlate cause)

```bash
git -c core.pager=cat log --oneline -8 origin/main
gh pr list --state merged --base main --limit 5 \
  --json number,title,mergedAt,mergeCommit
```

Line up the newest merge's `mergedAt` against when symptoms started. A deploy
minutes before the outage + an `ERROR`/newly-deployed build = prime suspect.

### G. Error rate sweep

From Supabase logs (sections D) or Vercel runtime logs (section C/E), count
and flag elevated rates of:
- **Auth failures** — unusual spike in `401`/`403` from the `auth` service or
  `/api/auth/*` routes (🟡 if elevated, 🔴 if total auth outage).
- **Webhook delivery failures** — HTTP 5xx or timeout responses in
  `/api/webhooks/*` routes (🟡).
- **Stripe webhook errors** — specifically `/api/webhooks/stripe` errors or
  Stripe signature failures (🟡).

If logs are unavailable for a service, mark it `unavailable` and skip.

## Prioritize

Build three buckets from the gathered signals. Each item is one line:
`<area>  <signal>  →  <recommended first action>`.

### 🔴 Act now (confirmed broken)

Include if **any** of these are true:
- Site returns 5xx or times out.
- TLS cert is expired (or couldn't be fetched).
- `/api/health` returns non-200 or body is not ok.
- Supabase project status is `PAUSED`, `INACTIVE`, or not `ACTIVE_HEALTHY`.
- Latest production deployment state is `ERROR` or was manually rolled back.
- DB connectivity probe (`SELECT 1`) fails.
- Any cron has been failing (consistent 5xx responses).

### 🟡 Investigate (degraded / at risk)

Include if **any** of these are true:
- TLS cert expires within 14 days.
- Site latency > 3 s.
- `/api/health` `ms` DB round-trip > 500 ms.
- Latest production deployment is still `BUILDING` after > 10 min.
- Supabase project has new/critical security or performance advisors.
- Recent postgres/auth/api logs contain distinct errors.
- Any cron is stale (last run older than its max expected gap).
- Elevated auth failure, webhook delivery failure, or Stripe webhook error rate.
- Un-applied migration on `main`.

### 🟢 Healthy (confirmed fine)

List each checked area that is unambiguously healthy — so the user sees what
was verified, not just what was wrong.

## Output shape

```
🔴 / 🟡 / 🟢  PROD TRIAGE — <one-line verdict>

Likely culprit: <one line>
Next step:      <one line, read-only recommendation>

SITE / EDGE
  Site          https://<PROD_DOMAIN>    🔴 503 in 0.32s
  TLS cert      <PROD_DOMAIN>            🟢 valid → 2025-09-14
  App health    /api/health              🔴 503

DATABASE
  Supabase      <SUPABASE_PROJECT_REF>     🔴 PAUSED
  DB probe      SELECT 1                 🔴 unreachable
  Advisors      security                 🟡 1 new advisory
  Migrations    supabase/migrations/     🟢 up to date

DEPLOYS
  Vercel        <VERCEL_PROJECT> (production)   🔴 ERROR · abc1234 · 4m ago
  Build log:    ReferenceError: x is not defined at …
  Prior deploy  def5678                  🟢 READY (rollback candidate)

CRONS
  retry-webhooks        🟢 last run 6h ago
  safe-check-escalate   🟡 last run 31h ago (stale)
  witness-reminders     🟢 last run 4h ago
  weekly-digest         🟢 last run 2d ago
  audit-retention-purge 🟢 last run 5d ago

RECENT CHANGES
  #71  fix Stripe hook    merged 6m ago   ← prime suspect
  #70  auth refactor      merged 2h ago

ERROR RATES
  Auth failures          🟢 nominal
  Webhook delivery       🟡 3 failures in last 15 min
  Stripe webhooks        🟢 nominal
```

Lead with the emoji verdict header matching the worst bucket found (🔴 if any
Act-now items, 🟡 if only Investigate items, 🟢 if everything is healthy).

**End the report with a single "likely culprit / next step" block** — one or
two sentences that name the most-probable root cause and the single most
urgent action. Examples:

- *"Likely culprit: Supabase project `<SUPABASE_PROJECT_REF>` is PAUSED — this
  blocks the app, the health check, and all DB writes. Next step: resume the
  project from the Supabase dashboard (Settings → General → Resume project)."*
- *"Likely culprit: latest Vercel deploy `abc1234` (#71, 6 min ago) is in
  ERROR. Next step: roll back to `def5678` via Vercel → Deployments → Instant
  Rollback, then inspect the build log above for the root fix."*
- *"No confirmed outage detected. Investigate the stale `safe-check-escalate`
  cron and the 3 webhook delivery failures; check Vercel runtime logs for
  `/api/cron/safe-check-escalate` and `/api/webhooks`."*
- *"🟢 All production signals healthy as of <timestamp>."* (only if every
  checked area is green)

## Guardrails

- **Read-only.** Never redeploy, revert, roll back, pause/resume, restart,
  change env vars, run DDL, or mutate any record. Surface the exact
  command/click for the human to run.
- **Don't invent state.** If a source errored or was unreachable, report
  `unavailable` rather than guessing it's fine or broken.
- **Latest deploy is the prime suspect**, but confirm with `state` + timing
  before blaming it; note when evidence is only circumstantial.
- **One action at the end.** This is triage, not a runbook. Name the single
  most-urgent next action as a clear one-liner and stop. The user decides.
