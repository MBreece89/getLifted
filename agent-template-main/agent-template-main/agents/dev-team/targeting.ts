/**
 * Change-driven test targeting.
 *
 * The point of the test agents is to verify *what changed*, not to re-scan the
 * whole app on every task. This module turns a set of changed paths into the
 * minimal set of module scopes worth testing:
 *
 *  - unit       → only the modules that actually changed.
 *  - regression → those modules *plus everything that depends on them*, because
 *    a change in a shared package can break its consumers without their own
 *    files changing.
 *
 * If nothing maps to a known module the result is empty, and the supervisor
 * skips that test run rather than scanning untouched code.
 */

/** A repo's module layout + the "who depends on whom" edges for fan-out. */
export interface ModuleGraph {
  /** Module roots as repo-relative dir prefixes (trailing slash optional). */
  modules: string[];
  /**
   * module → modules that consume it. Used to fan regression out from a changed
   * module to everything that could break because of it.
   */
  dependents: Record<string, string[]>;
}

/**
 * An illustrative module graph (a typical pnpm monorepo): `packages/shared` is
 * imported by both apps, so a change there regresses `apps/api` and `apps/web`;
 * the apps and `agents` have no in-repo consumers, so a change confined to one
 * of them regresses only it.
 *
 * This is an EXAMPLE, kept for the targeting tests and as a worked reference.
 * Real projects describe their own layout in `modules.config.ts` — copy the
 * shape below and edit it to match your tree.
 */
export const EXAMPLE_MODULE_GRAPH: ModuleGraph = {
  modules: ["packages/shared", "apps/api", "apps/web", "agents"],
  dependents: {
    "packages/shared": ["apps/api", "apps/web"],
    "apps/api": [],
    "apps/web": [],
    agents: [],
  },
};

const norm = (p: string): string => p.replace(/^\.?\//, "").replace(/\/+$/, "");
const withSlash = (m: string): string => (m.endsWith("/") ? m : `${m}/`);

/** The module a path belongs to (longest matching prefix wins), or null. */
export function moduleOf(path: string, graph: ModuleGraph): string | null {
  const target = norm(path);
  let best: string | null = null;
  for (const m of graph.modules) {
    const mm = norm(m);
    if (target === mm || target.startsWith(`${mm}/`)) {
      if (best === null || mm.length > best.length) best = mm;
    }
  }
  return best;
}

/** The distinct modules touched by a set of paths (order: as first seen). */
export function modulesFor(paths: string[], graph: ModuleGraph): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    const m = moduleOf(p, graph);
    if (m && !seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

/** Unit targeting: just the changed modules, no fan-out. */
export function unitScope(changedPaths: string[], graph: ModuleGraph): string[] {
  return modulesFor(changedPaths, graph).map(withSlash);
}

/** Regression targeting: the changed modules plus their dependents. */
export function regressionScope(changedPaths: string[], graph: ModuleGraph): string[] {
  const direct = modulesFor(changedPaths, graph);
  const out = new Set<string>(direct);
  for (const m of direct) for (const d of graph.dependents[m] ?? []) out.add(d);
  return [...out].map(withSlash);
}

/** The scope to hand a fix developer: failing files + their modules + a base scope. */
export function fixScope(
  failingFiles: string[],
  baseScope: string[],
  graph: ModuleGraph,
): string[] {
  const modules = modulesFor(failingFiles, graph).map(withSlash);
  return [...new Set([...baseScope, ...modules, ...failingFiles])];
}
