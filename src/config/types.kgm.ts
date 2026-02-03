export type KgmMode = "fs-only" | "fs+kgm" | "kgm-primary";

export type KgmMemgraphConfig = {
  url?: string;
  user?: string;
  password?: string;
  database?: string;
  timeoutMs?: number;
  maxPoolSize?: number;
};

export type KgmDecayConfig = {
  halfLifeMs?: number;
  minWeight?: number;
  maxNodesPerScope?: number;
};

export type KgmConfig = {
  enabled?: boolean;
  provider?: "memgraph" | "none";
  mode?: KgmMode;
  memgraph?: KgmMemgraphConfig;
  decay?: KgmDecayConfig;
};
