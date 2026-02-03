import type { OpenClawConfig } from "../../config/config.js";
import type { KgmActor, KgmProvider } from "../../kgm/provider.js";
import { createMemgraphProvider } from "../../kgm/memgraph-provider.js";
import { isScopeAllowed } from "../../kgm/rbac.js";

type KgmClientState = {
  provider: KgmProvider;
  fingerprint: string;
};

let clientState: KgmClientState | null = null;

function isScopeAllowedForActor(actor: KgmActor, scope: string): boolean {
  if (actor.role === "system") {
    return true;
  }
  return isScopeAllowed(actor, scope);
}

function wrapProvider(provider: KgmProvider): KgmProvider {
  return {
    id: provider.id,
    query: async (params) => {
      if (!isScopeAllowedForActor(params.actor, params.scope)) {
        throw new Error("scope not allowed");
      }
      return await provider.query(params);
    },
    ensureSchema: async (params) => {
      if (!isScopeAllowedForActor(params.actor, params.scope)) {
        throw new Error("scope not allowed");
      }
      return await provider.ensureSchema(params);
    },
    upsertNode: async (params) => {
      if (!isScopeAllowedForActor(params.actor, params.scope)) {
        throw new Error("scope not allowed");
      }
      return await provider.upsertNode(params);
    },
    upsertEdge: async (params) => {
      if (!isScopeAllowedForActor(params.actor, params.scope)) {
        throw new Error("scope not allowed");
      }
      return await provider.upsertEdge(params);
    },
    search: async (params) => {
      if (!isScopeAllowedForActor(params.actor, params.scope)) {
        throw new Error("scope not allowed");
      }
      return await provider.search(params);
    },
    touch: async (params) => {
      if (!isScopeAllowedForActor(params.actor, params.scope)) {
        throw new Error("scope not allowed");
      }
      return await provider.touch(params);
    },
    gc: async (params) => {
      if (!isScopeAllowedForActor(params.actor, params.scope)) {
        throw new Error("scope not allowed");
      }
      return await provider.gc(params);
    },
    describeSchema: async (params) => {
      if (!isScopeAllowedForActor(params.actor, params.scope)) {
        throw new Error("scope not allowed");
      }
      return await provider.describeSchema(params);
    },
  } as KgmProvider;
}

function buildFingerprint(cfg: OpenClawConfig): string {
  const memgraph = cfg.kgm?.memgraph;
  return JSON.stringify({
    enabled: cfg.kgm?.enabled,
    provider: cfg.kgm?.provider,
    url: memgraph?.url,
    user: memgraph?.user,
    database: memgraph?.database,
  });
}

export function resolveKgmProvider(cfg: OpenClawConfig): KgmProvider | null {
  if (cfg.kgm?.enabled !== true) {
    return null;
  }
  if (cfg.kgm?.provider && cfg.kgm.provider !== "memgraph") {
    return null;
  }
  const fingerprint = buildFingerprint(cfg);
  if (clientState && clientState.fingerprint === fingerprint) {
    return clientState.provider;
  }
  const provider = wrapProvider(createMemgraphProvider(cfg.kgm?.memgraph ?? {}));
  clientState = { provider, fingerprint };
  return provider;
}

export function requireKgmProvider(cfg: OpenClawConfig): KgmProvider {
  const provider = resolveKgmProvider(cfg);
  if (!provider) {
    throw new Error("KGM is disabled or not configured");
  }
  return provider;
}

export function buildOperatorActor(): KgmActor {
  return { role: "operator" };
}
