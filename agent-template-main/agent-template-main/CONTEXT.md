# CONTEXT.md — <PROJECT_NAME>

Durable, high-signal context for agents and humans. Keep it short and current —
this is the "what you need to know before touching the code" page, not docs.

## What this is

<ONE_PARAGRAPH: what the product does and for whom.>

## Architecture at a glance

- **Stack:** <STACK>
- **Entry points:** <e.g. apps/web, apps/api, src/…>
- **Data:** <DB / storage / external services>
- **Deploy:** <how it ships to <PROD_DOMAIN>>

## Module map

List the top-level modules and who depends on whom. Mirror this into
`agents/dev-team/modules.config.ts` so the verifier can target only what changed.

| Module | Purpose | Depended on by |
|---|---|---|
| `<module>` | <purpose> | <consumers> |

## Conventions worth knowing

- <naming / structure / testing conventions that aren't obvious from the code>

## Gotchas

- <non-obvious traps, required env vars, ordering constraints, etc.>

## Key references

- Agent + skill catalog: [docs/agents/README.md](docs/agents/README.md)
- Working agreements: [CLAUDE.md](CLAUDE.md)
