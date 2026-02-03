export type KgmDecaySettings = {
  halfLifeMs: number;
  minWeight: number;
  maxNodesPerScope: number;
};

export const DEFAULT_DECAY: KgmDecaySettings = {
  halfLifeMs: 14 * 24 * 60 * 60 * 1000,
  minWeight: 0.01,
  maxNodesPerScope: 50_000,
};

export function computeWeight(params: {
  accessCount: number;
  lastAccessAt: number;
  now?: number;
  halfLifeMs?: number;
}): number {
  const now = params.now ?? Date.now();
  const halfLifeMs = params.halfLifeMs ?? DEFAULT_DECAY.halfLifeMs;
  const accessCount = Math.max(0, params.accessCount || 0);
  const lastAccessAt = Math.max(0, params.lastAccessAt || 0);
  if (!lastAccessAt || !halfLifeMs) {
    return 0;
  }
  const age = Math.max(0, now - lastAccessAt);
  const freq = Math.log1p(accessCount);
  const decay = Math.exp(-age / halfLifeMs);
  return freq * decay;
}

export function buildGcQuery(params: { scope: string; minWeight: number; maxNodes: number }) {
  return {
    cypher:
      "MATCH (n { scope: $scope }) " +
      "WHERE coalesce(n.weight, 0) < $minWeight AND coalesce(n.pinnedAt, 0) = 0 " +
      "WITH n LIMIT $limit DETACH DELETE n RETURN count(*) AS removed",
    params: {
      scope: params.scope,
      minWeight: params.minWeight,
      limit: params.maxNodes,
    },
  };
}
