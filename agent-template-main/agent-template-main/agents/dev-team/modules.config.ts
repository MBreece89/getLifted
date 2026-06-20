/**
 * Per-project module graph — EDIT THIS for your repo.
 *
 * The verifier uses it to test only what changed (and its dependents) instead of
 * re-scanning the whole app. Until you fill it in, the graph is empty: targeting
 * maps nothing to a module, so verification is *skipped* rather than running the
 * entire suite. That's the safe default for a brand-new project.
 *
 * To enable targeted verification, list your module roots (repo-relative dir
 * prefixes) and, for each, the modules that consume it. See
 * `EXAMPLE_MODULE_GRAPH` in `targeting.ts` for a worked pnpm-monorepo example.
 *
 * Example (uncomment + adapt):
 *
 *   export const PROJECT_MODULES: ModuleGraph = {
 *     modules: ["packages/shared", "apps/api", "apps/web"],
 *     dependents: {
 *       "packages/shared": ["apps/api", "apps/web"],
 *       "apps/api": [],
 *       "apps/web": [],
 *     },
 *   };
 */
import type { ModuleGraph } from "./targeting";

export const PROJECT_MODULES: ModuleGraph = {
  modules: [],
  dependents: {},
};
