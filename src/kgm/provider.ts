export type KgmActorRole = "operator" | "agent" | "system";

export type KgmActor = {
  role: KgmActorRole;
  agentId?: string;
  sessionKey?: string;
};

export type KgmScope = string;

export type KgmQueryResult = {
  rows: Array<Record<string, unknown>>;
};

export type KgmNodeRef = {
  key: string;
  label: string;
};

export type KgmEdgeRef = {
  key?: string;
  type: string;
};

export type KgmSearchResult = {
  key: string;
  label: string;
  score?: number;
  properties?: Record<string, unknown>;
};

export type KgmSchemaSnapshot = {
  observed?: Record<string, unknown>;
  expected?: Record<string, unknown>;
};

export type KgmProvider = {
  id: "memgraph";
  query: (params: {
    actor: KgmActor;
    scope: KgmScope;
    cypher: string;
    params?: Record<string, unknown>;
    database?: string;
  }) => Promise<KgmQueryResult>;
  ensureSchema: (params: { actor: KgmActor; scope: KgmScope }) => Promise<void>;
  upsertNode: (params: {
    actor: KgmActor;
    scope: KgmScope;
    label: string;
    key: string;
    properties?: Record<string, unknown>;
  }) => Promise<KgmNodeRef>;
  upsertEdge: (params: {
    actor: KgmActor;
    scope: KgmScope;
    type: string;
    from: KgmNodeRef;
    to: KgmNodeRef;
    properties?: Record<string, unknown>;
  }) => Promise<KgmEdgeRef>;
  search: (params: {
    actor: KgmActor;
    scope: KgmScope;
    query: string;
    limit?: number;
  }) => Promise<KgmSearchResult[]>;
  touch: (params: {
    actor: KgmActor;
    scope: KgmScope;
    keys: string[];
    now?: number;
  }) => Promise<void>;
  gc: (params: {
    actor: KgmActor;
    scope: KgmScope;
    minWeight?: number;
    maxNodes?: number;
    now?: number;
  }) => Promise<{ removed: number }>;
  describeSchema: (params: { actor: KgmActor; scope: KgmScope }) => Promise<KgmSchemaSnapshot>;
};
