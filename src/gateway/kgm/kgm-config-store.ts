import type { OpenClawConfig } from "../../config/config.js";
import type { KgmProvider } from "../../kgm/provider.js";
import type { GatewayAgentRow } from "../session-utils.types.js";
import { resolveAdminScope, resolveAgentScope } from "../../kgm/rbac.js";
import { resolveKgmProvider } from "./kgm-client.js";

type KgmLogger = { warn: (msg: string) => void };

type NodeListEntry = {
  nodeId: string;
  displayName?: string;
  platform?: string;
  version?: string;
  coreVersion?: string;
  uiVersion?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  remoteIp?: string;
  caps?: string[];
  commands?: string[];
  pathEnv?: string;
  permissions?: string[];
  connectedAtMs?: number;
  paired?: boolean;
  connected?: boolean;
};

function resolveKgmMode(cfg: OpenClawConfig): "fs-only" | "fs+kgm" | "kgm-primary" {
  if (cfg.kgm?.enabled !== true) {
    return "fs-only";
  }
  return cfg.kgm?.mode ?? "fs+kgm";
}

function shouldMirrorToKgm(cfg: OpenClawConfig): boolean {
  return resolveKgmMode(cfg) !== "fs-only";
}

function shouldReadFromKgm(cfg: OpenClawConfig): boolean {
  return resolveKgmMode(cfg) === "kgm-primary";
}

function resolveProvider(cfg: OpenClawConfig, provider?: KgmProvider): KgmProvider | null {
  if (!shouldMirrorToKgm(cfg)) {
    return null;
  }
  return provider ?? resolveKgmProvider(cfg);
}

function resolveReadProvider(cfg: OpenClawConfig, provider?: KgmProvider): KgmProvider | null {
  if (!shouldReadFromKgm(cfg)) {
    return null;
  }
  return provider ?? resolveKgmProvider(cfg);
}

export async function readAgentsFromKgm(params: {
  cfg: OpenClawConfig;
  provider?: KgmProvider;
  log?: KgmLogger;
}): Promise<GatewayAgentRow[] | null> {
  const provider = resolveReadProvider(params.cfg, params.provider);
  if (!provider) {
    return null;
  }
  const scope = resolveAdminScope();
  const actor = { role: "system" as const };
  try {
    const result = await provider.query({
      actor,
      scope,
      cypher:
        "MATCH (a:Agent { scope: $scope }) " +
        "RETURN a.id AS id, a.name AS name, a.identity AS identity " +
        "ORDER BY a.id",
      params: { scope },
    });
    const agents: GatewayAgentRow[] = result.rows
      .map((row) => ({
        id: (typeof row.id === "string" ? row.id : JSON.stringify(row.id ?? "")).trim(),
        name: typeof row.name === "string" ? row.name : undefined,
        identity:
          row.identity && typeof row.identity === "object"
            ? (row.identity as GatewayAgentRow["identity"])
            : undefined,
      }))
      .filter((row) => row.id);
    return agents.length > 0 ? agents : null;
  } catch (err) {
    params.log?.warn(`kgm agents read failed: ${String(err)}`);
    return null;
  }
}

export async function readNodesFromKgm(params: {
  cfg: OpenClawConfig;
  provider?: KgmProvider;
  log?: KgmLogger;
}): Promise<NodeListEntry[] | null> {
  const provider = resolveReadProvider(params.cfg, params.provider);
  if (!provider) {
    return null;
  }
  const scope = resolveAdminScope();
  const actor = { role: "system" as const };
  try {
    const result = await provider.query({
      actor,
      scope,
      cypher:
        "MATCH (n:Node { scope: $scope }) " +
        "RETURN n.id AS nodeId, n.displayName AS displayName, n.platform AS platform, " +
        "n.version AS version, n.coreVersion AS coreVersion, n.uiVersion AS uiVersion, " +
        "n.deviceFamily AS deviceFamily, n.modelIdentifier AS modelIdentifier, " +
        "n.remoteIp AS remoteIp, n.caps AS caps, n.commands AS commands, " +
        "n.connectedAtMs AS connectedAtMs, n.paired AS paired, n.connected AS connected " +
        "ORDER BY n.id",
      params: { scope },
    });
    const nodes: NodeListEntry[] = result.rows
      .map((row) => ({
        nodeId: typeof row.nodeId === "string" ? row.nodeId : JSON.stringify(row.nodeId ?? ""),
        displayName: typeof row.displayName === "string" ? row.displayName : undefined,
        platform: typeof row.platform === "string" ? row.platform : undefined,
        version: typeof row.version === "string" ? row.version : undefined,
        coreVersion: typeof row.coreVersion === "string" ? row.coreVersion : undefined,
        uiVersion: typeof row.uiVersion === "string" ? row.uiVersion : undefined,
        deviceFamily: typeof row.deviceFamily === "string" ? row.deviceFamily : undefined,
        modelIdentifier: typeof row.modelIdentifier === "string" ? row.modelIdentifier : undefined,
        remoteIp: typeof row.remoteIp === "string" ? row.remoteIp : undefined,
        caps: Array.isArray(row.caps)
          ? row.caps.map((c) => (typeof c === "string" ? c : JSON.stringify(c)))
          : undefined,
        commands: Array.isArray(row.commands)
          ? row.commands.map((c) => (typeof c === "string" ? c : JSON.stringify(c)))
          : undefined,
        connectedAtMs: typeof row.connectedAtMs === "number" ? row.connectedAtMs : undefined,
        paired: typeof row.paired === "boolean" ? row.paired : undefined,
        connected: typeof row.connected === "boolean" ? row.connected : undefined,
      }))
      .filter((row) => row.nodeId);
    return nodes.length > 0 ? nodes : null;
  } catch (err) {
    params.log?.warn(`kgm nodes read failed: ${String(err)}`);
    return null;
  }
}

export async function mirrorAgentsToKgm(params: {
  cfg: OpenClawConfig;
  agents: Array<{ id: string; name?: string; identity?: Record<string, unknown> }>;
  provider?: KgmProvider;
  log?: KgmLogger;
}) {
  const provider = resolveProvider(params.cfg, params.provider);
  if (!provider) {
    return;
  }
  const scope = resolveAdminScope();
  const actor = { role: "system" as const };
  const now = Date.now();
  try {
    for (const agent of params.agents) {
      const id = agent.id.trim();
      if (!id) {
        continue;
      }
      await provider.upsertNode({
        actor,
        scope,
        label: "Agent",
        key: `agent:${id}`,
        properties: {
          id,
          name: agent.name ?? null,
          identity: agent.identity ?? null,
          updatedAt: now,
        },
      });
    }
  } catch (err) {
    params.log?.warn(`kgm agents mirror failed: ${String(err)}`);
  }
}

export async function mirrorSkillsToKgm(params: {
  cfg: OpenClawConfig;
  agentId: string;
  skills: Array<{
    name: string;
    skillKey: string;
    source?: string;
    primaryEnv?: string;
    emoji?: string;
    homepage?: string;
    disabled?: boolean;
    eligible?: boolean;
  }>;
  provider?: KgmProvider;
  log?: KgmLogger;
}) {
  const provider = resolveProvider(params.cfg, params.provider);
  if (!provider) {
    return;
  }
  const scope = resolveAdminScope();
  const actor = { role: "system" as const };
  const now = Date.now();
  try {
    for (const skill of params.skills) {
      const key = skill.skillKey?.trim() || skill.name.trim();
      if (!key) {
        continue;
      }
      await provider.upsertNode({
        actor,
        scope,
        label: "Skill",
        key: `skill:${key}`,
        properties: {
          id: key,
          name: skill.name,
          skillKey: skill.skillKey,
          source: skill.source ?? null,
          agentId: params.agentId,
          primaryEnv: skill.primaryEnv ?? null,
          emoji: skill.emoji ?? null,
          homepage: skill.homepage ?? null,
          disabled: skill.disabled ?? null,
          eligible: skill.eligible ?? null,
          updatedAt: now,
        },
      });
    }
  } catch (err) {
    params.log?.warn(`kgm skills mirror failed: ${String(err)}`);
  }
}

export async function mirrorNodesToKgm(params: {
  cfg: OpenClawConfig;
  nodes: Array<{
    nodeId: string;
    displayName?: string;
    platform?: string;
    version?: string;
    coreVersion?: string;
    uiVersion?: string;
    deviceFamily?: string;
    modelIdentifier?: string;
    remoteIp?: string;
    caps?: string[];
    commands?: string[];
    connectedAtMs?: number;
    paired?: boolean;
    connected?: boolean;
  }>;
  provider?: KgmProvider;
  log?: KgmLogger;
}) {
  const provider = resolveProvider(params.cfg, params.provider);
  if (!provider) {
    return;
  }
  const scope = resolveAdminScope();
  const actor = { role: "system" as const };
  const now = Date.now();
  try {
    for (const node of params.nodes) {
      const nodeId = node.nodeId.trim();
      if (!nodeId) {
        continue;
      }
      await provider.upsertNode({
        actor,
        scope,
        label: "Node",
        key: `node:${nodeId}`,
        properties: {
          id: nodeId,
          displayName: node.displayName ?? null,
          platform: node.platform ?? null,
          version: node.version ?? null,
          coreVersion: node.coreVersion ?? null,
          uiVersion: node.uiVersion ?? null,
          deviceFamily: node.deviceFamily ?? null,
          modelIdentifier: node.modelIdentifier ?? null,
          remoteIp: node.remoteIp ?? null,
          caps: node.caps ?? [],
          commands: node.commands ?? [],
          connectedAtMs: node.connectedAtMs ?? null,
          paired: node.paired ?? null,
          connected: node.connected ?? null,
          lastSeenAt: now,
          updatedAt: now,
        },
      });
    }
  } catch (err) {
    params.log?.warn(`kgm nodes mirror failed: ${String(err)}`);
  }
}

// Types for agent file reading from KGM
export type AgentDocEntry = {
  docType: string;
  hash: string;
  updatedAt: number;
  sourcePath?: string;
  size?: number;
  raw?: string;
};

export type AgentFileEntry = {
  name: string;
  path: string;
  missing: boolean;
  size?: number;
  updatedAtMs?: number;
  content?: string;
};

/**
 * Read agent docs from KGM (for kgm-primary mode)
 * Returns null if KGM is not in kgm-primary mode or on error
 */
export async function readAgentDocsFromKgm(params: {
  cfg: OpenClawConfig;
  agentId: string;
  provider?: KgmProvider;
  log?: KgmLogger;
}): Promise<AgentDocEntry[] | null> {
  const provider = resolveReadProvider(params.cfg, params.provider);
  if (!provider) {
    return null;
  }

  const scope = resolveAgentScope(params.agentId);
  const actor = { role: "system" as const, agentId: params.agentId };

  try {
    const result = await provider.query({
      actor,
      scope,
      cypher:
        "MATCH (d:AgentDoc { scope: $scope }) " +
        "RETURN d.docType AS docType, d.hash AS hash, d.updatedAt AS updatedAt, " +
        "d.sourcePath AS sourcePath, d.size AS size, d.raw AS raw " +
        "ORDER BY d.docType",
      params: { scope },
    });

    const docs: AgentDocEntry[] = result.rows
      .map((row) => ({
        docType: typeof row.docType === "string" ? row.docType : JSON.stringify(row.docType ?? ""),
        hash: typeof row.hash === "string" ? row.hash : JSON.stringify(row.hash ?? ""),
        updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : Number(row.updatedAt ?? 0),
        sourcePath: typeof row.sourcePath === "string" ? row.sourcePath : undefined,
        size: typeof row.size === "number" ? row.size : undefined,
        raw: typeof row.raw === "string" ? row.raw : undefined,
      }))
      .filter((doc) => doc.docType && doc.hash);

    return docs.length > 0 ? docs : null;
  } catch (err) {
    params.log?.warn(`kgm agent docs read failed: ${String(err)}`);
    return null;
  }
}

/**
 * Read agent files list from KGM (for kgm-primary mode)
 * This reconstructs the file list from AgentDoc nodes
 */
export async function readAgentFilesFromKgm(params: {
  cfg: OpenClawConfig;
  agentId: string;
  workspaceDir: string;
  provider?: KgmProvider;
  log?: KgmLogger;
}): Promise<AgentFileEntry[] | null> {
  const provider = resolveReadProvider(params.cfg, params.provider);
  if (!provider) {
    return null;
  }

  const docs = await readAgentDocsFromKgm({
    cfg: params.cfg,
    agentId: params.agentId,
    provider,
    log: params.log,
  });

  if (!docs || docs.length === 0) {
    return null;
  }

  // Convert AgentDoc entries to AgentFileEntry format
  return docs.map((doc) => ({
    name: doc.docType,
    path: doc.sourcePath || `${params.workspaceDir}/${doc.docType}`,
    missing: false,
    size: doc.size ?? 0,
    updatedAtMs: doc.updatedAt,
    content: doc.raw,
  }));
}

/**
 * Read a specific agent file from KGM (for kgm-primary mode)
 */
export async function readAgentFileFromKgm(params: {
  cfg: OpenClawConfig;
  agentId: string;
  fileName: string;
  provider?: KgmProvider;
  log?: KgmLogger;
}): Promise<{ content: string; updatedAtMs: number } | null> {
  const provider = resolveReadProvider(params.cfg, params.provider);
  if (!provider) {
    return null;
  }

  const scope = resolveAgentScope(params.agentId);
  const actor = { role: "system" as const, agentId: params.agentId };

  try {
    const result = await provider.query({
      actor,
      scope,
      cypher:
        "MATCH (d:AgentDoc { scope: $scope, docType: $docType }) " +
        "RETURN d.raw AS raw, d.updatedAt AS updatedAt, d.size AS size",
      params: { scope, docType: params.fileName },
    });

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const raw = typeof row.raw === "string" ? row.raw : "";
    const updatedAt =
      typeof row.updatedAt === "number" ? row.updatedAt : Number(row.updatedAt ?? 0);

    if (!raw) {
      return null;
    }

    return {
      content: raw,
      updatedAtMs: updatedAt,
    };
  } catch (err) {
    params.log?.warn(`kgm agent file read failed: ${String(err)}`);
    return null;
  }
}
