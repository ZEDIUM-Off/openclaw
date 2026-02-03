import { describe, expect, test } from "vitest";
import { isScopeAllowed, resolveActorScope, resolveAgentScope, resolveAdminScope } from "./rbac.js";

describe("kgm rbac", () => {
  test("resolveAgentScope normalizes agent id", () => {
    expect(resolveAgentScope("Main")).toBe("agent:main");
  });

  test("resolveActorScope uses admin scope for operator", () => {
    expect(resolveActorScope({ role: "operator" }, undefined)).toBe(resolveAdminScope());
  });

  test("isScopeAllowed restricts agent scope", () => {
    const actor = { role: "agent", agentId: "main" };
    expect(isScopeAllowed(actor, "agent:main")).toBe(true);
    expect(isScopeAllowed(actor, "agent:other")).toBe(false);
  });
});
