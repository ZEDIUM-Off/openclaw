import { describe, expect, test } from "vitest";
import { buildGcQuery, computeWeight } from "./decay.js";

describe("kgm decay", () => {
  test("computeWeight returns 0 without lastAccessAt", () => {
    expect(computeWeight({ accessCount: 3, lastAccessAt: 0, now: 1000 })).toBe(0);
  });

  test("computeWeight uses log1p(accessCount) at zero age", () => {
    const now = 1_700_000_000_000;
    const weight = computeWeight({ accessCount: 9, lastAccessAt: now, now, halfLifeMs: 10_000 });
    expect(weight).toBeCloseTo(Math.log1p(9));
  });

  test("buildGcQuery uses scope and limits", () => {
    const query = buildGcQuery({ scope: "agent:main", minWeight: 0.25, maxNodes: 10 });
    expect(query.cypher).toContain("MATCH (n { scope: $scope })");
    expect(query.params).toEqual({ scope: "agent:main", minWeight: 0.25, limit: 10 });
  });
});
