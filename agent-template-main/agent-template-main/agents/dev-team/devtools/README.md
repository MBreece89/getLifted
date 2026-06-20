# devtools — the Developer agent's own dev tools

One script, `dev`, is the **single contract** a Developer agent uses to run a
workspace's checks itself. It exists so an agent never floods its context with
raw test/typecheck output, and so the same verbs work in any repo another agent
instance is dropped into.

## Why

- **Token frugality.** Every verb is routed through [`rtk`](https://github.com/)
  (Rust Token Killer) when it's on `PATH` → failures-only / grouped output,
  60-99% fewer tokens. No `rtk`? It transparently runs the raw tool.
- **One interface, any repo.** `dev` discovers the repo root, the package
  manager (pnpm/npm/yarn, by lockfile then PATH), and which npm scripts exist.
  An agent learns `dev <verb>` once instead of each repo's quirks.

## Verbs

| Command | Does |
|---|---|
| `dev verify [filter]` | typecheck **then** test, fail-fast — the gate to run before reporting `completed` |
| `dev test [filter]` | tests only; `filter` is passed straight through (a package, a file…) |
| `dev typecheck` | type-check only |
| `dev lint` | lint only |
| `dev build` | build only |
| `dev caps` | JSON of `{root, pm, rtk, verbs}` — capability discovery |
| `dev help` | usage |

Exit code is the underlying tool's: `0` clean, non-zero means something to fix.
A verb whose npm script is missing in the target repo is skipped (not failed),
so `verify` stays useful in a repo that has tests but no `lint`, etc.

## Use it from an agent

The agent runs it via Bash with `cwd` at the repo root:

```bash
sh agents/dev-team/devtools/dev verify
```

`ClaudeRunner`'s system prompt already tells the Developer agent to self-verify
this way and to avoid raw `pnpm test`/`tsc`/`vitest`. To reuse the script in
another project, copy `dev` anywhere on the repo and point the agent at its path
— it carries no RaiseMeUp-specific assumptions.
