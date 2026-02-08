import crypto from "node:crypto";
import type { KgmActor } from "../../kgm/provider.js";
import type { GatewayRequestHandlers, RespondFn } from "./types.js";
import { resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import {
  buildBootstrapContextFiles,
  resolveBootstrapMaxChars,
} from "../../agents/pi-embedded-helpers.js";
import {
  DEFAULT_MEMORY_ALT_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_USER_FILENAME,
  filterBootstrapFilesForSession,
  loadWorkspaceBootstrapFiles,
} from "../../agents/workspace.js";
import { loadConfig } from "../../config/config.js";
import { loadSessionStore, resolveStorePath, type SessionEntry } from "../../config/sessions.js";
import { DEFAULT_DECAY } from "../../kgm/decay.js";
import {
  isScopeAllowed,
  resolveActorScope,
  resolveAdminScope,
  resolveAgentScope,
} from "../../kgm/rbac.js";
import { ensureAdminSchema, ensureAgentSchema } from "../../kgm/schema.js";
import { resolveAgentIdFromSessionKey } from "../../routing/session-key.js";
import { requireKgmProvider, resolveKgmProvider, buildOperatorActor } from "../kgm/kgm-client.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateKgmAdminEnsureAgentParams,
  validateKgmAdminInitParams,
  validateKgmAdminStatusParams,
  validateKgmAgentContextGetParams,
  validateKgmAgentContextMaterializeParams,
  validateKgmAgentContextPatchParams,
  validateKgmAgentEnsureSchemaParams,
  validateKgmAgentGcParams,
  validateKgmAgentGetParams,
  validateKgmAgentLinkParams,
  validateKgmAgentPinParams,
  validateKgmAgentPutEdgeParams,
  validateKgmAgentPutNodeParams,
  validateKgmAgentSearchParams,
  validateKgmAgentTouchParams,
  validateKgmSchemaDescribeParams,
} from "../protocol/index.js";
import { readTranscriptMessageByEntryId } from "../session-utils.fs.js";
import { classifySessionKey, loadSessionEntry } from "../session-utils.js";

function resolveActor(params: { sessionKey?: unknown }): KgmActor {
  if (typeof params.sessionKey === "string" && params.sessionKey.trim()) {
    const sessionKey = params.sessionKey.trim();
    const agentId = resolveAgentIdFromSessionKey(sessionKey);
    return { role: "agent", agentId, sessionKey };
  }
  return buildOperatorActor();
}

function resolveScope(actor: KgmActor, params: { scope?: unknown }) {
  const rawScope = typeof params.scope === "string" ? params.scope.trim() : "";
  return resolveActorScope(actor, rawScope || undefined);
}

function ensureScopeAllowed(
  respond: RespondFn,
  params: {
    actor: KgmActor;
    scope?: string;
  },
) {
  if (!params.scope) {
    respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "scope required"));
    return false;
  }
  if (!isScopeAllowed(params.actor, params.scope)) {
    respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "scope not allowed"));
    return false;
  }
  return true;
}

function resolveContextSetKey(scope: string) {
  return `context:${scope}`;
}

function buildContextItemKeys(params: { kind: "node" | "message"; keys: string[] }) {
  return params.keys.map((key) => ({ key: `ctxitem:${params.kind}:${key}`, refKey: key }));
}

const MAX_MATERIALIZED_MESSAGE_CHARS = 1200;
const GROUP_DOC_DENYLIST = new Set([
  DEFAULT_USER_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_MEMORY_ALT_FILENAME,
]);

export const kgmHandlers: GatewayRequestHandlers = {
  "kgm.admin.status": async ({ params, respond }) => {
    if (!validateKgmAdminStatusParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid kgm.admin.status params: ${formatValidationErrors(validateKgmAdminStatusParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const provider = resolveKgmProvider(cfg);
    const enabled = cfg.kgm?.enabled === true;
    const mode = cfg.kgm?.mode ?? "fs+kgm";

    // Test connection if provider exists
    let connected = false;
    let error: string | undefined;
    if (provider) {
      try {
        // Simple ping query to test connection
        await provider.query({
          actor: buildOperatorActor(),
          scope: resolveAdminScope(),
          cypher: "RETURN 1 as ping",
          params: {},
        });
        connected = true;
      } catch (err) {
        connected = false;
        error = err instanceof Error ? err.message : String(err);
      }
    }

    respond(
      true,
      {
        ok: true,
        enabled,
        mode,
        provider: provider?.id ?? "none",
        connected,
        ...(error ? { error } : {}),
      },
      undefined,
    );
  },
  "kgm.admin.init": async ({ params, respond }) => {
    if (!validateKgmAdminInitParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid kgm.admin.init params: ${formatValidationErrors(validateKgmAdminInitParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const provider = requireKgmProvider(cfg);
    await ensureAdminSchema({ provider, actor: buildOperatorActor() });
    respond(true, { ok: true }, undefined);
  },
  "kgm.admin.ensureAgent": async ({ params, respond }) => {
    if (!validateKgmAdminEnsureAgentParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid kgm.admin.ensureAgent params: ${formatValidationErrors(validateKgmAdminEnsureAgentParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const provider = requireKgmProvider(cfg);
    const agentId = params.agentId.trim();
    await ensureAgentSchema({ provider, actor: buildOperatorActor(), agentId });
    respond(true, { ok: true, scope: resolveAgentScope(agentId) }, undefined);
  },
  "kgm.schema.describe": async ({ params, respond }) => {
    if (!validateKgmSchemaDescribeParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid kgm.schema.describe params: ${formatValidationErrors(validateKgmSchemaDescribeParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const provider = requireKgmProvider(cfg);
    const actor = resolveActor(params);
    const scope = resolveScope(actor, params);
    if (!ensureScopeAllowed(respond, { actor, scope })) {
      return;
    }
    if (!scope) {
      return;
    }
    const safeScope = scope;
    const observed = await provider.describeSchema({ actor, scope: safeScope });
    const expectedScript = safeScope.startsWith("agent:")
      ? "docker/memgraph/init/03-schema-agent.cypherl"
      : "docker/memgraph/init/02-schema-admin.cypherl";
    let registry: Record<string, unknown> | undefined;
    try {
      const adminScope = resolveAdminScope();
      const registryQuery = await provider.query({
        actor: buildOperatorActor(),
        scope: adminScope,
        cypher:
          "MATCH (g:GraphSchema { scope: $adminScope })-[:APPLIES_TO { scope: $adminScope }]->" +
          "(s:Scope { id: $scopeId, scope: $adminScope }) " +
          "RETURN g.name AS name, g.version AS version, g.hash AS hash, g.appliesToKind AS appliesToKind, g.path AS path",
        params: { adminScope, scopeId: safeScope.startsWith("agent:") ? "agent" : "admin" },
      });
      const row = registryQuery.rows[0];
      if (row) {
        registry = {
          name: row.name,
          version: row.version,
          hash: row.hash,
          appliesToKind: row.appliesToKind,
          path: row.path,
        };
      }
    } catch {
      registry = undefined;
    }
    respond(
      true,
      {
        ok: true,
        expectedSchema: {
          script: expectedScript,
          registry,
        },
        observedSchema: observed.observed ?? {},
      },
      undefined,
    );
  },
  "kgm.agent.search": async ({ params, respond }) => {
    if (!validateKgmAgentSearchParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid kgm.agent.search params: ${formatValidationErrors(validateKgmAgentSearchParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const provider = requireKgmProvider(cfg);
    const actor = resolveActor(params);
    const scope = resolveScope(actor, params);
    if (!ensureScopeAllowed(respond, { actor, scope })) {
      return;
    }
    if (!scope) {
      return;
    }
    const safeScope = scope;
    const results = await provider.search({
      actor,
      scope: safeScope,
      query: params.query,
      limit: params.limit,
    });
    respond(true, { ok: true, results }, undefined);
  },
  "kgm.agent.get": async ({ params, respond }) => {
    if (!validateKgmAgentGetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid kgm.agent.get params: ${formatValidationErrors(validateKgmAgentGetParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const provider = requireKgmProvider(cfg);
    const actor = resolveActor(params);
    const scope = resolveScope(actor, params);
    if (!ensureScopeAllowed(respond, { actor, scope })) {
      return;
    }
    if (!scope) {
      return;
    }
    const safeScope = scope;
    const result = await provider.query({
      actor,
      scope: safeScope,
      cypher:
        "MATCH (n { scope: $scope, key: $key }) RETURN labels(n)[0] AS label, n AS node LIMIT 1",
      params: { scope: safeScope, key: params.key },
    });
    const row = result.rows[0];
    if (!row) {
      respond(true, { ok: true, found: false }, undefined);
      return;
    }
    respond(true, { ok: true, found: true, label: row.label, node: row.node }, undefined);
  },
  "kgm.agent.putNode": async ({ params, respond }) => {
    if (!validateKgmAgentPutNodeParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid kgm.agent.putNode params: ${formatValidationErrors(validateKgmAgentPutNodeParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const provider = requireKgmProvider(cfg);
    const actor = resolveActor(params);
    const scope = resolveScope(actor, params);
    if (!ensureScopeAllowed(respond, { actor, scope })) {
      return;
    }
    if (!scope) {
      return;
    }
    const safeScope = scope;
    const node = await provider.upsertNode({
      actor,
      scope: safeScope,
      label: params.label,
      key: params.key,
      properties: params.properties as Record<string, unknown> | undefined,
    });
    respond(true, { ok: true, node }, undefined);
  },
  "kgm.agent.putEdge": async ({ params, respond }) => {
    if (!validateKgmAgentPutEdgeParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid kgm.agent.putEdge params: ${formatValidationErrors(validateKgmAgentPutEdgeParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const provider = requireKgmProvider(cfg);
    const actor = resolveActor(params);
    const scope = resolveScope(actor, params);
    if (!ensureScopeAllowed(respond, { actor, scope })) {
      return;
    }
    if (!scope) {
      return;
    }
    const safeScope = scope;
    const edge = await provider.upsertEdge({
      actor,
      scope: safeScope,
      type: params.type,
      from: { key: params.fromKey, label: params.fromLabel },
      to: { key: params.toKey, label: params.toLabel },
      properties: params.properties as Record<string, unknown> | undefined,
    });
    respond(true, { ok: true, edge }, undefined);
  },
  "kgm.agent.link": async ({ params, respond }) => {
    if (!validateKgmAgentLinkParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid kgm.agent.link params: ${formatValidationErrors(validateKgmAgentLinkParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const provider = requireKgmProvider(cfg);
    const actor = resolveActor(params);
    const scope = resolveScope(actor, params);
    if (!ensureScopeAllowed(respond, { actor, scope })) {
      return;
    }
    if (!scope) {
      return;
    }
    const safeScope = scope;
    const edge = await provider.upsertEdge({
      actor,
      scope: safeScope,
      type: params.type,
      from: { key: params.fromKey, label: params.fromLabel },
      to: { key: params.toKey, label: params.toLabel },
      properties: params.properties as Record<string, unknown> | undefined,
    });
    respond(true, { ok: true, edge }, undefined);
  },
  "kgm.agent.pin": async ({ params, respond }) => {
    if (!validateKgmAgentPinParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid kgm.agent.pin params: ${formatValidationErrors(validateKgmAgentPinParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const provider = requireKgmProvider(cfg);
    const actor = resolveActor(params);
    const scope = resolveScope(actor, params);
    if (!ensureScopeAllowed(respond, { actor, scope })) {
      return;
    }
    if (!scope) {
      return;
    }
    const safeScope = scope;
    const pinned = params.pinned !== false;
    await provider.query({
      actor,
      scope: safeScope,
      cypher:
        "MATCH (n { scope: $scope, key: $key }) " +
        "SET n.pinnedAt = $pinnedAt RETURN n.key AS key",
      params: { scope: safeScope, key: params.key, pinnedAt: pinned ? Date.now() : null },
    });
    respond(true, { ok: true }, undefined);
  },
  "kgm.agent.touch": async ({ params, respond }) => {
    if (!validateKgmAgentTouchParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid kgm.agent.touch params: ${formatValidationErrors(validateKgmAgentTouchParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const provider = requireKgmProvider(cfg);
    const actor = resolveActor(params);
    const scope = resolveScope(actor, params);
    if (!ensureScopeAllowed(respond, { actor, scope })) {
      return;
    }
    if (!scope) {
      return;
    }
    const safeScope = scope;
    await provider.touch({ actor, scope: safeScope, keys: params.keys });
    respond(true, { ok: true }, undefined);
  },
  "kgm.agent.gc": async ({ params, respond }) => {
    if (!validateKgmAgentGcParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid kgm.agent.gc params: ${formatValidationErrors(validateKgmAgentGcParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const provider = requireKgmProvider(cfg);
    const actor = resolveActor(params);
    const scope = resolveScope(actor, params);
    if (!ensureScopeAllowed(respond, { actor, scope })) {
      return;
    }
    if (!scope) {
      return;
    }
    const safeScope = scope;
    const minWeight = params.minWeight ?? cfg.kgm?.decay?.minWeight ?? DEFAULT_DECAY.minWeight;
    const maxNodes =
      params.maxNodes ?? cfg.kgm?.decay?.maxNodesPerScope ?? DEFAULT_DECAY.maxNodesPerScope;
    const result = await provider.gc({ actor, scope: safeScope, minWeight, maxNodes });
    respond(true, { ok: true, removed: result.removed }, undefined);
  },
  "kgm.agent.ensureSchema": async ({ params, respond }) => {
    if (!validateKgmAgentEnsureSchemaParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid kgm.agent.ensureSchema params: ${formatValidationErrors(validateKgmAgentEnsureSchemaParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const provider = requireKgmProvider(cfg);
    const actor = resolveActor(params);
    const scope = resolveScope(actor, params);
    if (!scope || !scope.startsWith("agent:")) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agent scope required"));
      return;
    }
    if (!isScopeAllowed(actor, scope)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "scope not allowed"));
      return;
    }
    const agentId = scope.split(":")[1] ?? "";
    await ensureAgentSchema({ provider, actor: buildOperatorActor(), agentId });
    respond(true, { ok: true, scope }, undefined);
  },
  "kgm.agent.context.get": async ({ params, respond }) => {
    if (!validateKgmAgentContextGetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid kgm.agent.context.get params: ${formatValidationErrors(validateKgmAgentContextGetParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const provider = requireKgmProvider(cfg);
    const actor = resolveActor(params);
    const scope = resolveScope(actor, params);
    if (!ensureScopeAllowed(respond, { actor, scope })) {
      return;
    }
    if (!scope) {
      return;
    }
    const safeScope = scope;
    const contextKey = resolveContextSetKey(safeScope);
    const result = await provider.query({
      actor,
      scope: safeScope,
      cypher:
        "MATCH (cs:ContextSet { key: $contextKey, scope: $scope })-[:INCLUDES]->(ci:ContextItem) " +
        "RETURN ci.key AS key, ci.kind AS kind, ci.refType AS refType, ci.refKey AS refKey, ci.createdAt AS createdAt " +
        "ORDER BY ci.createdAt DESC",
      params: { scope: safeScope, contextKey },
    });
    respond(true, { ok: true, items: result.rows }, undefined);
  },
  "kgm.agent.context.patch": async ({ params, respond }) => {
    if (!validateKgmAgentContextPatchParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid kgm.agent.context.patch params: ${formatValidationErrors(validateKgmAgentContextPatchParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const provider = requireKgmProvider(cfg);
    const actor = resolveActor(params);
    const scope = resolveScope(actor, params);
    if (!ensureScopeAllowed(respond, { actor, scope })) {
      return;
    }
    if (!scope) {
      return;
    }
    const safeScope = scope;
    const contextKey = resolveContextSetKey(safeScope);
    const now = Date.now();
    await provider.query({
      actor,
      scope: safeScope,
      cypher:
        "MERGE (cs:ContextSet { key: $contextKey, scope: $scope }) " +
        "SET cs.updatedAt = $now, cs.agentId = $agentId",
      params: { scope: safeScope, contextKey, now, agentId: actor.agentId ?? null },
    });

    const addNodes = Array.isArray(params.addNodes)
      ? params.addNodes.filter((key) => typeof key === "string" && key.trim())
      : [];
    const addMessages = Array.isArray(params.addMessages)
      ? params.addMessages.filter((key) => typeof key === "string" && key.trim())
      : [];
    const removeNodes = Array.isArray(params.removeNodes)
      ? params.removeNodes.filter((key) => typeof key === "string" && key.trim())
      : [];
    const removeMessages = Array.isArray(params.removeMessages)
      ? params.removeMessages.filter((key) => typeof key === "string" && key.trim())
      : [];

    if (addNodes.length > 0) {
      const items = buildContextItemKeys({ kind: "node", keys: addNodes });
      await provider.query({
        actor,
        scope: safeScope,
        cypher:
          "UNWIND $items AS item " +
          "MERGE (ci:ContextItem { key: item.key, scope: $scope }) " +
          "SET ci.kind = 'node', ci.refType = 'node', ci.refKey = item.refKey, " +
          "ci.createdAt = coalesce(ci.createdAt, $now), ci.updatedAt = $now " +
          "WITH ci " +
          "MATCH (cs:ContextSet { key: $contextKey, scope: $scope }) " +
          "MERGE (cs)-[:INCLUDES { scope: $scope }]->(ci)",
        params: { scope: safeScope, contextKey, items, now },
      });
    }
    if (addMessages.length > 0) {
      const items = buildContextItemKeys({ kind: "message", keys: addMessages });
      await provider.query({
        actor,
        scope: safeScope,
        cypher:
          "UNWIND $items AS item " +
          "MERGE (ci:ContextItem { key: item.key, scope: $scope }) " +
          "SET ci.kind = 'message', ci.refType = 'message', ci.refKey = item.refKey, " +
          "ci.createdAt = coalesce(ci.createdAt, $now), ci.updatedAt = $now " +
          "WITH ci " +
          "MATCH (cs:ContextSet { key: $contextKey, scope: $scope }) " +
          "MERGE (cs)-[:INCLUDES { scope: $scope }]->(ci)",
        params: { scope: safeScope, contextKey, items, now },
      });
    }
    if (removeNodes.length > 0) {
      const items = buildContextItemKeys({ kind: "node", keys: removeNodes }).map(
        (item) => item.key,
      );
      await provider.query({
        actor,
        scope: safeScope,
        cypher:
          "UNWIND $keys AS key " +
          "MATCH (ci:ContextItem { key: key, scope: $scope }) DETACH DELETE ci",
        params: { scope: safeScope, keys: items },
      });
    }
    if (removeMessages.length > 0) {
      const items = buildContextItemKeys({ kind: "message", keys: removeMessages }).map(
        (item) => item.key,
      );
      await provider.query({
        actor,
        scope: safeScope,
        cypher:
          "UNWIND $keys AS key " +
          "MATCH (ci:ContextItem { key: key, scope: $scope }) DETACH DELETE ci",
        params: { scope: safeScope, keys: items },
      });
    }
    respond(true, { ok: true }, undefined);
  },
  "kgm.agent.context.materialize": async ({ params, respond }) => {
    if (!validateKgmAgentContextMaterializeParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid kgm.agent.context.materialize params: ${formatValidationErrors(validateKgmAgentContextMaterializeParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const provider = requireKgmProvider(cfg);
    const actor = resolveActor(params);
    const scope = resolveScope(actor, params);
    if (!ensureScopeAllowed(respond, { actor, scope })) {
      return;
    }
    if (!scope) {
      return;
    }
    const safeScope = scope;
    const maxNodes =
      typeof params.maxNodes === "number" && Number.isFinite(params.maxNodes)
        ? Math.max(1, Math.floor(params.maxNodes))
        : 20;
    const maxMessages =
      typeof params.maxMessages === "number" && Number.isFinite(params.maxMessages)
        ? Math.max(1, Math.floor(params.maxMessages))
        : 10;
    const contextKey = resolveContextSetKey(safeScope);
    const nodes = await provider.query({
      actor,
      scope: safeScope,
      cypher:
        "MATCH (cs:ContextSet { key: $contextKey, scope: $scope })-[:INCLUDES]->(ci:ContextItem { kind: 'node' }) " +
        "RETURN ci.refKey AS refKey, ci.createdAt AS createdAt " +
        "ORDER BY ci.createdAt DESC LIMIT $limit",
      params: { scope: safeScope, contextKey, limit: maxNodes },
    });
    const messages = await provider.query({
      actor,
      scope: safeScope,
      cypher:
        "MATCH (cs:ContextSet { key: $contextKey, scope: $scope })-[:INCLUDES]->(ci:ContextItem { kind: 'message' }) " +
        "RETURN ci.refKey AS refKey, ci.createdAt AS createdAt " +
        "ORDER BY ci.createdAt DESC LIMIT $limit",
      params: { scope: safeScope, contextKey, limit: maxMessages },
    });

    const messageKeys = messages.rows.map((row) => String(row.refKey ?? "")).filter(Boolean);
    const messageDetails =
      messageKeys.length > 0
        ? await provider.query({
            actor,
            scope: safeScope,
            cypher:
              "MATCH (m:Message { scope: $scope }) " +
              "WHERE m.key IN $keys " +
              "RETURN m.key AS key, m.preview AS preview, m.role AS role, m.sessionKey AS sessionKey, " +
              "m.sessionId AS sessionId, m.entryId AS entryId",
            params: { scope: safeScope, keys: messageKeys },
          })
        : { rows: [] };

    const lines = ["## KGM Context"];
    const nodeKeys = nodes.rows.map((row) => String(row.refKey ?? "")).filter(Boolean);
    const sessionStoreCache = new Map<string, Record<string, SessionEntry>>();
    const messageMap = new Map<
      string,
      {
        preview?: string;
        role?: string;
        sessionKey?: string;
        sessionId?: string;
        entryId?: string;
        text?: string;
      }
    >();
    for (const row of messageDetails.rows) {
      const key = String(row.key ?? "");
      if (!key) {
        continue;
      }
      const sessionKey = typeof row.sessionKey === "string" ? row.sessionKey : undefined;
      const sessionId = typeof row.sessionId === "string" ? row.sessionId : undefined;
      const entryId = typeof row.entryId === "string" ? row.entryId : undefined;
      let text: string | undefined;
      if (sessionKey && sessionId) {
        const agentId = resolveAgentIdFromSessionKey(sessionKey);
        const storePath = resolveStorePath(cfg.session?.store, { agentId });
        let store = sessionStoreCache.get(storePath);
        if (!store) {
          store = loadSessionStore(storePath, { skipCache: true });
          sessionStoreCache.set(storePath, store);
        }
        const sessionEntry = store[sessionKey];
        const transcript = readTranscriptMessageByEntryId({
          sessionId,
          storePath,
          entryId: entryId ?? key,
          sessionFile: sessionEntry?.sessionFile,
          agentId,
        });
        if (transcript?.text) {
          text = transcript.text;
        }
      }
      messageMap.set(key, {
        preview: typeof row.preview === "string" ? row.preview : undefined,
        role: typeof row.role === "string" ? row.role : undefined,
        sessionKey,
        sessionId,
        entryId,
        text,
      });
    }
    if (nodeKeys.length > 0) {
      lines.push("", "### Nodes", ...nodeKeys.map((key) => `- ${key}`));
    }
    if (messageKeys.length > 0) {
      lines.push(
        "",
        "### Messages",
        ...messageKeys.map((key) => {
          const detail = messageMap.get(key);
          const rawText = detail?.text ?? detail?.preview;
          if (!rawText) {
            return `- ${key}`;
          }
          const text =
            rawText.length > MAX_MATERIALIZED_MESSAGE_CHARS
              ? `${rawText.slice(0, MAX_MATERIALIZED_MESSAGE_CHARS - 3)}...`
              : rawText;
          const role = detail?.role ? ` (${detail.role})` : "";
          const scopeHint = detail?.sessionKey ? ` [${detail.sessionKey}]` : "";
          return `- ${key}${role}${scopeHint}: ${text}`;
        }),
      );
    }
    let docsSectionIncluded = false;
    const sessionKey = params.sessionKey ?? actor.sessionKey;
    const agentId = safeScope.split(":")[1] ?? actor.agentId;
    if (agentId) {
      try {
        const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
        let bootstrapFiles = await loadWorkspaceBootstrapFiles(workspaceDir);
        bootstrapFiles = filterBootstrapFilesForSession(bootstrapFiles, sessionKey);

        if (sessionKey) {
          const { entry } = loadSessionEntry(sessionKey);
          if (classifySessionKey(sessionKey, entry) === "group") {
            bootstrapFiles = bootstrapFiles.filter((file) => !GROUP_DOC_DENYLIST.has(file.name));
          }
        }

        const contextDocs = buildBootstrapContextFiles(bootstrapFiles, {
          maxChars: resolveBootstrapMaxChars(cfg),
        });

        if (contextDocs.length > 0) {
          docsSectionIncluded = true;
          lines.push(
            "",
            "### Agent Docs",
            ...contextDocs.flatMap((doc) => [`#### ${doc.path}`, doc.content]),
          );
        }

        const now = Date.now();
        for (const file of bootstrapFiles) {
          if (file.missing || !file.content) {
            continue;
          }
          const hash = crypto.createHash("sha256").update(file.content).digest("hex");
          const raw =
            contextDocs.find((doc) => doc.path === file.name)?.content ?? file.content.trim();
          await provider.upsertNode({
            actor,
            scope: safeScope,
            label: "AgentDoc",
            key: `agentdoc:${file.name}`,
            properties: {
              agentId,
              docType: file.name,
              hash,
              updatedAt: now,
              sourcePath: file.path,
              size: file.content.length,
              raw,
            },
          });
        }
      } catch {
        // best-effort docs ingestion
      }
    }

    const content =
      nodeKeys.length || messageKeys.length || docsSectionIncluded ? lines.join("\n") : "";
    respond(true, { ok: true, content }, undefined);
  },
};
