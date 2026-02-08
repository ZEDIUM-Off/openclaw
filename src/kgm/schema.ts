import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { KgmActor, KgmProvider } from "./provider.js";
import { resolveAdminScope } from "./rbac.js";

type SchemaScript = {
  path: string;
  content: string;
};

/**
 * Resolve path relative to the source file location (works with pnpm link)
 */
function resolveRepoRelative(p: string): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // From src/kgm/schema.ts -> repo root
  return path.resolve(__dirname, "../../", p);
}

async function loadCypherScript(relPath: string): Promise<SchemaScript> {
  const absPath = resolveRepoRelative(relPath);
  const content = await fs.readFile(absPath, "utf-8");
  return { path: absPath, content };
}

function hashScript(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function splitStatements(script: string): string[] {
  return script
    .split(";")
    .map((stmt) => stmt.trim())
    .filter(Boolean);
}

async function execScript(params: {
  provider: KgmProvider;
  actor: KgmActor;
  scope: string;
  script: SchemaScript;
}) {
  const statements = splitStatements(params.script.content);
  for (const statement of statements) {
    try {
      await params.provider.query({
        actor: params.actor,
        scope: params.scope,
        cypher: statement,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Ignore errors for constraints/indexes/nodes that already exist
      if (
        message.includes("already exists") ||
        message.includes("Constraint already exists") ||
        message.includes("Index already exists") ||
        message.includes("unique constraint violation") ||
        message.includes("equivalent index already exists")
      ) {
        continue;
      }
      throw err;
    }
  }
}

export async function ensureAdminSchema(params: { provider: KgmProvider; actor: KgmActor }) {
  const script = await loadCypherScript("docker/memgraph/init/02-schema-admin.cypherl");
  await execScript({ provider: params.provider, actor: params.actor, scope: "admin", script });
  const adminScope = resolveAdminScope();
  const agentScript = await loadCypherScript("docker/memgraph/init/03-schema-agent.cypherl");
  const now = Date.now();

  await params.provider.upsertNode({
    actor: params.actor,
    scope: adminScope,
    label: "Scope",
    key: "scope:admin",
    properties: { id: "admin", kind: "admin", updatedAt: now },
  });
  await params.provider.upsertNode({
    actor: params.actor,
    scope: adminScope,
    label: "Scope",
    key: "scope:agent",
    properties: { id: "agent", kind: "agent", updatedAt: now },
  });

  await params.provider.upsertNode({
    actor: params.actor,
    scope: adminScope,
    label: "GraphSchema",
    key: "schema:admin",
    properties: {
      name: "kgm-admin",
      version: "v1",
      appliesToKind: "admin",
      hash: hashScript(script.content),
      path: script.path,
      updatedAt: now,
    },
  });
  await params.provider.upsertNode({
    actor: params.actor,
    scope: adminScope,
    label: "GraphSchema",
    key: "schema:agent",
    properties: {
      name: "kgm-agent",
      version: "v1",
      appliesToKind: "agent",
      hash: hashScript(agentScript.content),
      path: agentScript.path,
      updatedAt: now,
    },
  });

  await params.provider.upsertEdge({
    actor: params.actor,
    scope: adminScope,
    type: "APPLIES_TO",
    from: { key: "schema:admin", label: "GraphSchema" },
    to: { key: "scope:admin", label: "Scope" },
  });
  await params.provider.upsertEdge({
    actor: params.actor,
    scope: adminScope,
    type: "APPLIES_TO",
    from: { key: "schema:agent", label: "GraphSchema" },
    to: { key: "scope:agent", label: "Scope" },
  });
}

export async function ensureAgentSchema(params: {
  provider: KgmProvider;
  actor: KgmActor;
  agentId: string;
}) {
  const script = await loadCypherScript("docker/memgraph/init/03-schema-agent.cypherl");
  await execScript({
    provider: params.provider,
    actor: params.actor,
    scope: `agent:${params.agentId}`,
    script,
  });
}
