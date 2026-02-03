import type { OpenClawConfig } from "../../config/config.js";
import type { KgmProvider } from "../../kgm/provider.js";
import type { GatewayAgentRow } from "../session-utils.types.js";
import { resolveAdminScope } from "../../kgm/rbac.js";
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
        id: String(row.id ?? "").trim(),
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
      cypher: "MATCH (n:Node { scope: $scope }) RETURN n AS node",
      params: { scope },
    });
    const nodes: NodeListEntry[] = result.rows
      .map((row) => {
        const node = row.node as Record<string, unknown> | undefined;
        if (!node || typeof node !== "object") {
          return null;
        }
        const nodeId = typeof node.id === "string" ? node.id : String(node.key ?? "");
        if (!nodeId) {
          return null;
        }
        return {
          nodeId,
          displayName: typeof node.displayName === "string" ? node.displayName : undefined,
          platform: typeof node.platform === "string" ? node.platform : undefined,
          version: typeof node.version === "string" ? node.version : undefined,
          coreVersion: typeof node.coreVersion === "string" ? node.coreVersion : undefined,
          uiVersion: typeof node.uiVersion === "string" ? node.uiVersion : undefined,
          deviceFamily: typeof node.deviceFamily === "string" ? node.deviceFamily : undefined,
          modelIdentifier:
            typeof node.modelIdentifier === "string" ? node.modelIdentifier : undefined,
          remoteIp: typeof node.remoteIp === "string" ? node.remoteIp : undefined,
          caps: Array.isArray(node.caps) ? (node.caps as string[]) : [],
          commands: Array.isArray(node.commands) ? (node.commands as string[]) : [],
          pathEnv: typeof node.pathEnv === "string" ? node.pathEnv : undefined,
          permissions: Array.isArray(node.permissions) ? (node.permissions as string[]) : undefined,
          connectedAtMs: typeof node.connectedAtMs === "number" ? node.connectedAtMs : undefined,
          paired: typeof node.paired === "boolean" ? node.paired : undefined,
          connected: typeof node.connected === "boolean" ? node.connected : undefined,
        };
      })
      .filter((entry): entry is NodeListEntry => Boolean(entry && entry.nodeId));
    if (nodes.length === 0) {
      return null;
    }
    nodes.sort((a, b) => {
      if (a.connected !== b.connected) {
        return a.connected ? -1 : 1;
      }
      const an = (a.displayName ?? a.nodeId).toLowerCase();
      const bn = (b.displayName ?? b.nodeId).toLowerCase();
      if (an < bn) {
        return -1;
      }
      if (an > bn) {
        return 1;
      }
      return a.nodeId.localeCompare(b.nodeId);
    });
    return nodes;
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
