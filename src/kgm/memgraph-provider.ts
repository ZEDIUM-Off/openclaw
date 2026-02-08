import neo4j, { type Driver, type Integer } from "neo4j-driver";
import type { KgmMemgraphConfig } from "../config/types.kgm.js";
import type { KgmActor, KgmProvider, KgmQueryResult, KgmSchemaSnapshot } from "./provider.js";

type MemgraphClientOptions = {
  config: KgmMemgraphConfig;
};

type MemgraphQueryParams = Record<string, unknown>;
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err: unknown): boolean {
  if (!err) {
    return false;
  }
  const message = err instanceof Error ? err.message : JSON.stringify(err);
  const lowered = message.toLowerCase();
  return (
    lowered.includes("connection") ||
    lowered.includes("service unavailable") ||
    lowered.includes("session expired") ||
    lowered.includes("terminated")
  );
}

function coerceInteger(value: Integer) {
  try {
    return value.toNumber();
  } catch {
    return value.toString();
  }
}

function normalizeValue(value: unknown): unknown {
  if (neo4j.isInt(value)) {
    return coerceInteger(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      next[key] = normalizeValue(entry);
    }
    return next;
  }
  return value;
}

function normalizeRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.map((row) => normalizeValue(row) as Record<string, unknown>);
}

export class MemgraphProvider implements KgmProvider {
  readonly id = "memgraph" as const;
  private driver: Driver;
  private database?: string;

  constructor(opts: MemgraphClientOptions) {
    const url = opts.config.url?.trim() || "bolt://127.0.0.1:7687";
    const user = opts.config.user?.trim() || "";
    const password = opts.config.password?.trim() || "";
    const auth = user ? neo4j.auth.basic(user, password) : undefined;
    this.driver = neo4j.driver(url, auth, {
      maxConnectionPoolSize: opts.config.maxPoolSize ?? 20,
      connectionTimeout: opts.config.timeoutMs ?? 10_000,
    });
    this.database = opts.config.database?.trim() || undefined;
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  private async runQuery(params: {
    cypher: string;
    params?: MemgraphQueryParams;
    database?: string;
  }): Promise<KgmQueryResult> {
    const retry = { attempts: 3, baseDelayMs: 150 };
    let lastError: unknown;
    for (let attempt = 1; attempt <= retry.attempts; attempt += 1) {
      const session = this.driver.session({
        database: params.database || this.database,
        defaultAccessMode: neo4j.session.WRITE,
      });
      try {
        const result = await session.run(params.cypher, params.params ?? {});
        const rows = result.records.map((record) => record.toObject());
        return { rows: normalizeRows(rows) };
      } catch (err) {
        lastError = err;
        if (!isRetryableError(err) || attempt === retry.attempts) {
          throw err;
        }
        await sleep(retry.baseDelayMs * attempt);
      } finally {
        await session.close();
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async query(params: {
    actor: KgmActor;
    scope: string;
    cypher: string;
    params?: Record<string, unknown>;
    database?: string;
  }): Promise<KgmQueryResult> {
    return await this.runQuery({
      cypher: params.cypher,
      params: params.params,
      database: params.database,
    });
  }

  async ensureSchema(_params?: { actor: KgmActor; scope: string }): Promise<void> {
    return;
  }

  async upsertNode(params: {
    actor: KgmActor;
    scope: string;
    label: string;
    key: string;
    properties?: Record<string, unknown>;
  }) {
    const now = Date.now();
    const cypher =
      `MERGE (n:${params.label} { key: $key, scope: $scope }) ` +
      `SET n += $props, n.updatedAt = $now ` +
      `RETURN n.key AS key`;
    await this.runQuery({
      cypher,
      params: {
        key: params.key,
        scope: params.scope,
        props: params.properties ?? {},
        now,
      },
    });
    return { key: params.key, label: params.label };
  }

  async upsertEdge(params: {
    actor: KgmActor;
    scope: string;
    type: string;
    from: { key: string; label: string };
    to: { key: string; label: string };
    properties?: Record<string, unknown>;
  }) {
    const now = Date.now();
    const cypher =
      `MATCH (a:${params.from.label} { key: $fromKey, scope: $scope }) ` +
      `MATCH (b:${params.to.label} { key: $toKey, scope: $scope }) ` +
      `MERGE (a)-[r:${params.type} { scope: $scope }]->(b) ` +
      `SET r += $props, r.updatedAt = $now ` +
      `RETURN type(r) AS type`;
    await this.runQuery({
      cypher,
      params: {
        fromKey: params.from.key,
        toKey: params.to.key,
        scope: params.scope,
        props: params.properties ?? {},
        now,
      },
    });
    return { type: params.type };
  }

  async search(params: { actor: KgmActor; scope: string; query: string; limit?: number }) {
    // Ensure limit is a valid integer (Memgraph requires integer type explicitly)
    const limit = Math.max(1, Math.floor(params.limit ?? 20));
    // Memgraph-compatible: use IS NOT NULL instead of exists()
    // Note: Memgraph requires LIMIT to be an integer literal, not a parameter
    const cypher =
      "MATCH (n { scope: $scope }) " +
      "WHERE (n.key CONTAINS $query) OR (n.label IS NOT NULL AND n.label CONTAINS $query) " +
      "RETURN n.key AS key, labels(n)[0] AS label, n AS properties " +
      `LIMIT ${limit}`; // Embed limit as integer literal, not parameter
    const result = await this.runQuery({
      cypher,
      params: { scope: params.scope, query: params.query }, // Don't pass limit as param
    });
    return result.rows.map((row) => ({
      key: typeof row.key === "string" ? row.key : JSON.stringify(row.key ?? ""),
      label: typeof row.label === "string" ? row.label : JSON.stringify(row.label ?? ""),
      properties:
        typeof row.properties === "object" && row.properties !== null
          ? (row.properties as Record<string, unknown>)
          : undefined,
    }));
  }

  async touch(params: { actor: KgmActor; scope: string; keys: string[]; now?: number }) {
    const now = params.now ?? Date.now();
    const keys = params.keys.filter((key) => key.trim());
    if (keys.length === 0) {
      return;
    }
    const cypher =
      "MATCH (n { scope: $scope }) WHERE n.key IN $keys " +
      "SET n.lastAccessAt = $now, n.accessCount = coalesce(n.accessCount, 0) + 1";
    await this.runQuery({
      cypher,
      params: { scope: params.scope, keys, now },
    });
  }

  async gc(params: {
    actor: KgmActor;
    scope: string;
    minWeight?: number;
    maxNodes?: number;
    now?: number;
  }) {
    const minWeight = params.minWeight ?? 0.01;
    const maxNodes = Math.max(1, params.maxNodes ?? 5000);
    const cypher =
      "MATCH (n { scope: $scope }) " +
      "WHERE coalesce(n.weight, 0) < $minWeight AND coalesce(n.pinnedAt, 0) = 0 " +
      "WITH n LIMIT $limit DETACH DELETE n " +
      "RETURN count(*) AS removed";
    const result = await this.runQuery({
      cypher,
      params: { scope: params.scope, minWeight, limit: maxNodes },
    });
    const removed = Number(result.rows[0]?.removed ?? 0);
    return { removed: Number.isFinite(removed) ? removed : 0 };
  }

  async describeSchema(_params: { actor: KgmActor; scope: string }): Promise<KgmSchemaSnapshot> {
    try {
      const result = await this.runQuery({ cypher: "SHOW SCHEMA INFO" });
      return { observed: { rows: result.rows } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { observed: { error: message } };
    }
  }
}

export function createMemgraphProvider(config: KgmMemgraphConfig): MemgraphProvider {
  return new MemgraphProvider({ config });
}
