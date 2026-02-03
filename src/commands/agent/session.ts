import crypto from "node:crypto";
import type { MsgContext } from "../../auto-reply/templating.js";
import type { OpenClawConfig } from "../../config/config.js";
import type { SessionsFindResult } from "../../gateway/session-utils.types.js";
import {
  normalizeThinkLevel,
  normalizeVerboseLevel,
  type ThinkLevel,
  type VerboseLevel,
} from "../../auto-reply/thinking.js";
import {
  evaluateSessionFreshness,
  loadSessionStore,
  resolveAgentIdFromSessionKey,
  resolveChannelResetConfig,
  resolveExplicitAgentSessionKey,
  resolveSessionResetPolicy,
  resolveSessionResetType,
  resolveSessionKey,
  resolveStorePath,
  type SessionEntry,
} from "../../config/sessions.js";
import { callGateway } from "../../gateway/call.js";
import { normalizeMainKey } from "../../routing/session-key.js";
import { parseSessionLabel } from "../../sessions/session-label.js";

export type SessionResolution = {
  sessionId: string;
  sessionKey?: string;
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  storePath: string;
  isNewSession: boolean;
  sessionRefError?: string;
  persistedThinking?: ThinkLevel;
  persistedVerbose?: VerboseLevel;
};

export type SessionRefResolution = { ok: true; key: string } | { ok: false; error: string };

type GatewayFindResult =
  | { ok: true; key: string }
  | { ok: false; error: string; kind: "not_found" | "multi" | "error" };

type SessionKeyResolution = {
  sessionKey?: string;
  sessionStore: Record<string, SessionEntry>;
  storePath: string;
  sessionRefError?: string;
};

export function resolveSessionKeyForRequest(opts: {
  cfg: OpenClawConfig;
  to?: string;
  sessionId?: string;
  sessionKey?: string;
  sessionRef?: string;
  agentId?: string;
}): SessionKeyResolution {
  const sessionCfg = opts.cfg.session;
  const scope = sessionCfg?.scope ?? "per-sender";
  const mainKey = normalizeMainKey(sessionCfg?.mainKey);
  const explicitSessionKey =
    opts.sessionKey?.trim() ||
    resolveExplicitAgentSessionKey({
      cfg: opts.cfg,
      agentId: opts.agentId,
    });
  const storeAgentId = resolveAgentIdFromSessionKey(explicitSessionKey);
  const storePath = resolveStorePath(sessionCfg?.store, {
    agentId: storeAgentId,
  });
  const sessionStore = loadSessionStore(storePath);

  const ctx: MsgContext | undefined = opts.to?.trim() ? { From: opts.to } : undefined;
  let sessionKey: string | undefined =
    explicitSessionKey ?? (ctx ? resolveSessionKey(scope, ctx, mainKey) : undefined);

  let sessionRefError: string | undefined;
  if (!explicitSessionKey && opts.sessionRef?.trim()) {
    const resolvedRef = resolveSessionKeyFromRef({
      store: sessionStore,
      ref: opts.sessionRef,
    });
    if (resolvedRef.ok) {
      sessionKey = resolvedRef.key;
    } else {
      sessionRefError = resolvedRef.error;
    }
  }

  // If a session id was provided, prefer to re-use its entry (by id) even when no key was derived.
  if (
    !explicitSessionKey &&
    opts.sessionId &&
    (!sessionKey || sessionStore[sessionKey]?.sessionId !== opts.sessionId)
  ) {
    const foundKey = Object.keys(sessionStore).find(
      (key) => sessionStore[key]?.sessionId === opts.sessionId,
    );
    if (foundKey) {
      sessionKey = foundKey;
    }
  }

  return { sessionKey, sessionStore, storePath, sessionRefError };
}

export function resolveSessionKeyFromRef(params: {
  store: Record<string, SessionEntry>;
  ref: string;
}): SessionRefResolution {
  const raw = params.ref.trim();
  if (!raw) {
    return { ok: false, error: "empty session ref" };
  }
  if (params.store[raw]) {
    return { ok: true, key: raw };
  }

  const bySessionId = Object.entries(params.store)
    .filter(([, entry]) => entry?.sessionId === raw)
    .map(([key]) => key);
  if (bySessionId.length === 1) {
    return { ok: true, key: bySessionId[0] };
  }
  if (bySessionId.length > 1) {
    return { ok: false, error: `multiple sessions found for sessionId: ${raw}` };
  }

  const parsedLabel = parseSessionLabel(raw);
  if (!parsedLabel.ok) {
    return { ok: false, error: parsedLabel.error };
  }
  const byLabel = Object.entries(params.store)
    .filter(([, entry]) => entry?.label === parsedLabel.label)
    .map(([key]) => key);
  if (byLabel.length === 1) {
    return { ok: true, key: byLabel[0] };
  }
  if (byLabel.length > 1) {
    return { ok: false, error: `multiple sessions found for label: ${parsedLabel.label}` };
  }
  return { ok: false, error: `no session found for ref: ${raw}` };
}

function isLikelySessionKey(ref: string): boolean {
  const trimmed = ref.trim();
  return trimmed === "global" || trimmed === "unknown" || trimmed.startsWith("agent:");
}

async function findSessionViaGateway(params: {
  agentId?: string;
  key?: string;
  sessionId?: string;
  label?: string;
}): Promise<GatewayFindResult> {
  try {
    const result = await callGateway<SessionsFindResult>({
      method: "sessions.find",
      params: {
        key: params.key,
        sessionId: params.sessionId,
        label: params.label,
        agentId: params.agentId,
        limit: 2,
      },
      timeoutMs: 10_000,
    });
    const matches = result?.matches ?? [];
    if (matches.length === 0) {
      return { ok: false, error: "no session found", kind: "not_found" };
    }
    if (matches.length > 1) {
      const keys = matches.map((match) => match.key).join(", ");
      return {
        ok: false,
        error: `multiple sessions found (${keys})`,
        kind: "multi",
      };
    }
    return { ok: true, key: matches[0]?.key ?? "" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, kind: "error" };
  }
}

export async function resolveSessionKeyFromGateway(params: {
  ref: string;
  agentId?: string;
}): Promise<SessionRefResolution> {
  const raw = params.ref.trim();
  if (!raw) {
    return { ok: false, error: "empty session ref" };
  }

  if (isLikelySessionKey(raw)) {
    const result = await findSessionViaGateway({ key: raw, agentId: params.agentId });
    if (result.ok) {
      return result;
    }
    return { ok: false, error: result.error };
  }

  const bySessionId = await findSessionViaGateway({ sessionId: raw, agentId: params.agentId });
  if (bySessionId.ok) {
    return bySessionId;
  }
  if (bySessionId.kind === "multi" || bySessionId.kind === "error") {
    return { ok: false, error: bySessionId.error };
  }

  const parsedLabel = parseSessionLabel(raw);
  if (!parsedLabel.ok) {
    return { ok: false, error: parsedLabel.error };
  }

  const byLabel = await findSessionViaGateway({
    label: parsedLabel.label,
    agentId: params.agentId,
  });
  if (byLabel.ok) {
    return byLabel;
  }
  if (byLabel.kind === "multi" || byLabel.kind === "error") {
    return { ok: false, error: byLabel.error };
  }
  return { ok: false, error: `no session found for ref: ${raw}` };
}

export function resolveSession(opts: {
  cfg: OpenClawConfig;
  to?: string;
  sessionId?: string;
  sessionKey?: string;
  sessionRef?: string;
  agentId?: string;
}): SessionResolution {
  const sessionCfg = opts.cfg.session;
  const { sessionKey, sessionStore, storePath, sessionRefError } = resolveSessionKeyForRequest({
    cfg: opts.cfg,
    to: opts.to,
    sessionId: opts.sessionId,
    sessionKey: opts.sessionKey,
    sessionRef: opts.sessionRef,
    agentId: opts.agentId,
  });
  const now = Date.now();

  const sessionEntry = sessionKey ? sessionStore[sessionKey] : undefined;

  const resetType = resolveSessionResetType({ sessionKey });
  const channelReset = resolveChannelResetConfig({
    sessionCfg,
    channel: sessionEntry?.lastChannel ?? sessionEntry?.channel,
  });
  const resetPolicy = resolveSessionResetPolicy({
    sessionCfg,
    resetType,
    resetOverride: channelReset,
  });
  const fresh = sessionEntry
    ? evaluateSessionFreshness({ updatedAt: sessionEntry.updatedAt, now, policy: resetPolicy })
        .fresh
    : false;
  const sessionId =
    opts.sessionId?.trim() || (fresh ? sessionEntry?.sessionId : undefined) || crypto.randomUUID();
  const isNewSession = !fresh && !opts.sessionId;

  const persistedThinking =
    fresh && sessionEntry?.thinkingLevel
      ? normalizeThinkLevel(sessionEntry.thinkingLevel)
      : undefined;
  const persistedVerbose =
    fresh && sessionEntry?.verboseLevel
      ? normalizeVerboseLevel(sessionEntry.verboseLevel)
      : undefined;

  return {
    sessionId,
    sessionKey,
    sessionEntry,
    sessionStore,
    storePath,
    sessionRefError,
    isNewSession,
    persistedThinking,
    persistedVerbose,
  };
}
