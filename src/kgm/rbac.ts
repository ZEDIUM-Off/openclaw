import type { KgmActor } from "./provider.js";
import { normalizeAgentId } from "../routing/session-key.js";

export type KgmRole = "self" | "team" | "operator";

export function resolveAgentScope(agentId: string): string {
  return `agent:${normalizeAgentId(agentId)}`;
}

export function resolveAdminScope(): string {
  return "admin";
}

export function resolveActorScope(actor: KgmActor, scope?: string): string | undefined {
  if (scope?.trim()) {
    return scope.trim();
  }
  if (actor.role === "operator") {
    return resolveAdminScope();
  }
  if (actor.agentId) {
    return resolveAgentScope(actor.agentId);
  }
  return undefined;
}

export function isScopeAllowed(actor: KgmActor, scope: string): boolean {
  if (actor.role === "operator") {
    return true;
  }
  if (!actor.agentId) {
    return false;
  }
  const allowed = resolveAgentScope(actor.agentId);
  return scope === allowed;
}
