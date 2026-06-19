/**
 * Targeting: changed paths → the minimal module scopes worth testing. Proves
 * unit stays narrow, regression fans out through dependents, and unknown paths
 * map to nothing (so the supervisor skips rather than re-scanning everything).
 */
import { describe, expect, it } from "vitest";
import {
  EXAMPLE_MODULE_GRAPH as G,
  fixScope,
  moduleOf,
  modulesFor,
  regressionScope,
  unitScope,
} from "../targeting";

describe("moduleOf", () => {
  it("maps a path to its module by longest matching prefix", () => {
    expect(moduleOf("apps/api/src/services/Foo.ts", G)).toBe("apps/api");
    expect(moduleOf("packages/shared/src/schemas/x.ts", G)).toBe("packages/shared");
    expect(moduleOf("agents/dev-team/types.ts", G)).toBe("agents");
  });

  it("returns null for paths outside any known module", () => {
    expect(moduleOf("docs/prd.md", G)).toBeNull();
    expect(moduleOf("README.md", G)).toBeNull();
  });
});

describe("modulesFor", () => {
  it("collapses many paths to their distinct modules", () => {
    const changed = [
      "apps/web/src/a.tsx",
      "apps/web/src/b.tsx",
      "packages/shared/src/c.ts",
    ];
    expect(modulesFor(changed, G)).toEqual(["apps/web", "packages/shared"]);
  });
});

describe("unitScope", () => {
  it("is just the changed modules — no fan-out", () => {
    expect(unitScope(["apps/web/src/x.tsx"], G)).toEqual(["apps/web/"]);
  });

  it("is empty when nothing maps to a module", () => {
    expect(unitScope(["docs/prd.md"], G)).toEqual([]);
  });
});

describe("regressionScope", () => {
  it("fans a shared change out to every dependent app", () => {
    const scope = regressionScope(["packages/shared/src/schemas/x.ts"], G);
    expect(scope).toContain("packages/shared/");
    expect(scope).toContain("apps/api/");
    expect(scope).toContain("apps/web/");
  });

  it("does not widen a change that has no dependents", () => {
    expect(regressionScope(["apps/web/src/x.tsx"], G)).toEqual(["apps/web/"]);
  });
});

describe("fixScope", () => {
  it("unions failing files, their modules, and the base scope", () => {
    const scope = fixScope(["apps/api/src/__tests__/foo.test.ts"], ["apps/api/"], G);
    expect(scope).toContain("apps/api/");
    expect(scope).toContain("apps/api/src/__tests__/foo.test.ts");
  });
});
