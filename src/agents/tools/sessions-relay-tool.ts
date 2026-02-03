import { Type } from "@sinclair/typebox";
import crypto from "node:crypto";
import type { SessionsFindResult } from "../../gateway/session-utils.types.js";
import type { AnyAgentTool } from "./common.js";
import { loadConfig } from "../../config/config.js";
import { callGateway } from "../../gateway/call.js";
import {
  isSubagentSessionKey,
  normalizeAgentId,
  resolveAgentIdFromSessionKey,
} from "../../routing/session-key.js";
import { SESSION_LABEL_MAX_LENGTH } from "../../sessions/session-label.js";
import { truncateUtf16Safe } from "../../utils.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../../utils/message-channel.js";
import { AGENT_LANE_NESTED } from "../lanes.js";
import { readLatestAssistantReply, runAgentStep } from "./agent-step.js";
import { jsonResult, readStringParam } from "./common.js";
import {
  createAgentToAgentPolicy,
  resolveInternalSessionKey,
  resolveMainSessionAlias,
  resolveSessionReference,
  stripToolMessages,
} from "./sessions-helpers.js";

const SessionsRelayToolSchema = Type.Object({
  sessionKey: Type.Optional(Type.String()),
  label: Type.Optional(Type.String({ minLength: 1, maxLength: SESSION_LABEL_MAX_LENGTH })),
  agentId: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  message: Type.String(),
  timeoutSeconds: Type.Optional(Type.Number({ minimum: 0 })),
  maxContextMessages: Type.Optional(Type.Number({ minimum: 0 })),
});

type ChatMessage = {
  role?: unknown;
  content?: unknown;
};

const MAX_CONTEXT_MESSAGES = 12;
const MAX_CONTEXT_LINE = 240;
const MAX_CONTEXT_TOTAL = 1200;

function normalizeContextText(raw: string) {
  return raw.replace(/\s+/g, " ").trim();
}

function extractMessageText(message: ChatMessage): { role: string; text: string } | null {
  const role = typeof message.role === "string" ? message.role : "";
  if (role !== "user" && role !== "assistant") {
    return null;
  }
  const content = message.content;
  if (typeof content === "string") {
    const normalized = normalizeContextText(content);
    return normalized ? { role, text: normalized } : null;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  const chunks: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    if ((block as { type?: unknown }).type !== "text") {
      continue;
    }
    const text = (block as { text?: unknown }).text;
    if (typeof text === "string" && text.trim()) {
      chunks.push(text);
    }
  }
  const joined = normalizeContextText(chunks.join(" "));
  return joined ? { role, text: joined } : null;
}

function truncateText(text: string, maxLen: number) {
  if (text.length <= maxLen) {
    return text;
  }
  return `${truncateUtf16Safe(text, Math.max(0, maxLen - 3))}...`;
}

async function loadContextLines(params: {
  sessionKey?: string;
  maxMessages: number;
}): Promise<string[]> {
  if (!params.sessionKey || params.maxMessages <= 0) {
    return [];
  }
  try {
    const history = await callGateway<{ messages: Array<unknown> }>({
      method: "chat.history",
      params: { sessionKey: params.sessionKey, limit: params.maxMessages },
    });
    const rawMessages = Array.isArray(history?.messages) ? history.messages : [];
    const parsed = stripToolMessages(rawMessages)
      .map((msg) => extractMessageText(msg as ChatMessage))
      .filter((msg): msg is { role: string; text: string } => Boolean(msg));
    const recent = parsed.slice(-params.maxMessages);
    const lines: string[] = [];
    let total = 0;
    for (const entry of recent) {
      const label = entry.role === "user" ? "User" : "Assistant";
      const line = `- ${label}: ${truncateText(entry.text, MAX_CONTEXT_LINE)}`;
      total += line.length;
      if (total > MAX_CONTEXT_TOTAL) {
        break;
      }
      lines.push(line);
    }
    return lines;
  } catch {
    return [];
  }
}

function buildRelayPrompt(params: { targetSessionKey: string; contextLines: string[] }) {
  const lines = [
    "You are a relay bridge between sessions.",
    `Target session key: ${params.targetSessionKey}.`,
    "Rewrite the user request into a message for the target agent.",
    "Output ONLY the message to send (no analysis, no extra formatting).",
  ];
  if (params.contextLines.length > 0) {
    lines.push("", "Recent context:", ...params.contextLines);
  }
  return lines.join("\n");
}

export function createSessionsRelayTool(opts?: {
  agentSessionKey?: string;
  sandboxed?: boolean;
}): AnyAgentTool {
  return {
    label: "Session Relay",
    name: "sessions_relay",
    description:
      "Relay a message to another session via an isolated bridge, returning only the final reply.",
    parameters: SessionsRelayToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const message = readStringParam(params, "message", { required: true });
      const cfg = loadConfig();
      const { mainKey, alias } = resolveMainSessionAlias(cfg);
      const visibility = cfg.agents?.defaults?.sandbox?.sessionToolsVisibility ?? "spawned";
      const requesterInternalKey =
        typeof opts?.agentSessionKey === "string" && opts.agentSessionKey.trim()
          ? resolveInternalSessionKey({
              key: opts.agentSessionKey,
              alias,
              mainKey,
            })
          : undefined;
      const restrictToSpawned =
        opts?.sandboxed === true &&
        visibility === "spawned" &&
        !!requesterInternalKey &&
        !isSubagentSessionKey(requesterInternalKey);

      const a2aPolicy = createAgentToAgentPolicy(cfg);

      const sessionKeyParam = readStringParam(params, "sessionKey");
      const labelParam = readStringParam(params, "label")?.trim() || undefined;
      const labelAgentIdParam = readStringParam(params, "agentId")?.trim() || undefined;
      if (sessionKeyParam && labelParam) {
        return jsonResult({
          runId: crypto.randomUUID(),
          status: "error",
          error: "Provide either sessionKey or label (not both).",
        });
      }

      const listSessions = async (listParams: Record<string, unknown>) => {
        const result = await callGateway<{ sessions: Array<{ key: string }> }>({
          method: "sessions.list",
          params: listParams,
          timeoutMs: 10_000,
        });
        return Array.isArray(result?.sessions) ? result.sessions : [];
      };

      let sessionKey = sessionKeyParam;
      if (!sessionKey && labelParam) {
        const requesterAgentId = requesterInternalKey
          ? resolveAgentIdFromSessionKey(requesterInternalKey)
          : undefined;
        const requestedAgentId = labelAgentIdParam
          ? normalizeAgentId(labelAgentIdParam)
          : undefined;

        if (
          restrictToSpawned &&
          requestedAgentId &&
          requesterAgentId &&
          requestedAgentId !== requesterAgentId
        ) {
          return jsonResult({
            runId: crypto.randomUUID(),
            status: "forbidden",
            error: "Sandboxed sessions_relay label lookup is limited to this agent",
          });
        }

        if (requesterAgentId && requestedAgentId && requestedAgentId !== requesterAgentId) {
          if (!a2aPolicy.enabled) {
            return jsonResult({
              runId: crypto.randomUUID(),
              status: "forbidden",
              error:
                "Agent-to-agent messaging is disabled. Set tools.agentToAgent.enabled=true to allow cross-agent sends.",
            });
          }
          if (!a2aPolicy.isAllowed(requesterAgentId, requestedAgentId)) {
            return jsonResult({
              runId: crypto.randomUUID(),
              status: "forbidden",
              error: "Agent-to-agent messaging denied by tools.agentToAgent.allow.",
            });
          }
        }

        const resolveParams: Record<string, unknown> = {
          label: labelParam,
          ...(requestedAgentId ? { agentId: requestedAgentId } : {}),
          ...(restrictToSpawned ? { spawnedBy: requesterInternalKey } : {}),
          limit: 2,
        };
        let resolvedKey = "";
        try {
          const resolved = await callGateway<SessionsFindResult>({
            method: "sessions.find",
            params: resolveParams,
            timeoutMs: 10_000,
          });
          const matches = Array.isArray(resolved?.matches) ? resolved.matches : [];
          if (matches.length === 1 && matches[0]?.key) {
            resolvedKey = matches[0].key.trim();
          } else if (matches.length > 1) {
            return jsonResult({
              runId: crypto.randomUUID(),
              status: "error",
              error: `Multiple sessions found for label: ${labelParam}`,
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (restrictToSpawned) {
            return jsonResult({
              runId: crypto.randomUUID(),
              status: "forbidden",
              error: "Session not visible from this sandboxed agent session.",
            });
          }
          return jsonResult({
            runId: crypto.randomUUID(),
            status: "error",
            error: msg || `No session found with label: ${labelParam}`,
          });
        }

        if (!resolvedKey) {
          if (restrictToSpawned) {
            return jsonResult({
              runId: crypto.randomUUID(),
              status: "forbidden",
              error: "Session not visible from this sandboxed agent session.",
            });
          }
          return jsonResult({
            runId: crypto.randomUUID(),
            status: "error",
            error: `No session found with label: ${labelParam}`,
          });
        }
        sessionKey = resolvedKey;
      }

      if (!sessionKey) {
        return jsonResult({
          runId: crypto.randomUUID(),
          status: "error",
          error: "Either sessionKey or label is required",
        });
      }

      const resolvedSession = await resolveSessionReference({
        sessionKey,
        alias,
        mainKey,
        requesterInternalKey,
        restrictToSpawned,
      });
      if (!resolvedSession.ok) {
        return jsonResult({
          runId: crypto.randomUUID(),
          status: resolvedSession.status,
          error: resolvedSession.error,
        });
      }
      const resolvedKey = resolvedSession.key;
      const displayKey = resolvedSession.displayKey;
      const resolvedViaSessionId = resolvedSession.resolvedViaSessionId;

      if (restrictToSpawned && !resolvedViaSessionId) {
        const sessions = await listSessions({
          includeGlobal: false,
          includeUnknown: false,
          limit: 500,
          spawnedBy: requesterInternalKey,
        });
        const ok = sessions.some((entry) => entry?.key === resolvedKey);
        if (!ok) {
          return jsonResult({
            runId: crypto.randomUUID(),
            status: "forbidden",
            error: `Session not visible from this sandboxed agent session: ${sessionKey}`,
            sessionKey: displayKey,
          });
        }
      }

      const requesterAgentId = resolveAgentIdFromSessionKey(requesterInternalKey);
      const targetAgentId = resolveAgentIdFromSessionKey(resolvedKey);
      const isCrossAgent = requesterAgentId !== targetAgentId;
      if (isCrossAgent) {
        if (!a2aPolicy.enabled) {
          return jsonResult({
            runId: crypto.randomUUID(),
            status: "forbidden",
            error:
              "Agent-to-agent messaging is disabled. Set tools.agentToAgent.enabled=true to allow cross-agent sends.",
            sessionKey: displayKey,
          });
        }
        if (!a2aPolicy.isAllowed(requesterAgentId, targetAgentId)) {
          return jsonResult({
            runId: crypto.randomUUID(),
            status: "forbidden",
            error: "Agent-to-agent messaging denied by tools.agentToAgent.allow.",
            sessionKey: displayKey,
          });
        }
      }

      const timeoutSeconds =
        typeof params.timeoutSeconds === "number" && Number.isFinite(params.timeoutSeconds)
          ? Math.max(0, Math.floor(params.timeoutSeconds))
          : 30;
      const timeoutMs = timeoutSeconds * 1000;

      const maxContextMessages =
        typeof params.maxContextMessages === "number" && Number.isFinite(params.maxContextMessages)
          ? Math.min(MAX_CONTEXT_MESSAGES, Math.max(0, Math.floor(params.maxContextMessages)))
          : 0;
      const contextLines = await loadContextLines({
        sessionKey: requesterInternalKey,
        maxMessages: maxContextMessages,
      });

      const bridgeSessionKey = `agent:${targetAgentId}:bridge:${crypto.randomUUID()}`;
      const relayPrompt = buildRelayPrompt({
        targetSessionKey: displayKey,
        contextLines,
      });
      const relayMessage = await runAgentStep({
        sessionKey: bridgeSessionKey,
        message,
        extraSystemPrompt: relayPrompt,
        timeoutMs: timeoutMs || 30_000,
        lane: AGENT_LANE_NESTED,
      });
      if (!relayMessage) {
        return jsonResult({
          runId: crypto.randomUUID(),
          status: "error",
          error: "Relay bridge did not return a message",
          sessionKey: displayKey,
        });
      }

      const idempotencyKey = crypto.randomUUID();
      let runId = idempotencyKey;
      try {
        const response = await callGateway<{ runId?: string }>({
          method: "agent",
          params: {
            message: relayMessage,
            sessionKey: resolvedKey,
            idempotencyKey,
            deliver: false,
            channel: INTERNAL_MESSAGE_CHANNEL,
            lane: AGENT_LANE_NESTED,
          },
          timeoutMs: 10_000,
        });
        if (typeof response?.runId === "string" && response.runId) {
          runId = response.runId;
        }
      } catch (err) {
        const messageText =
          err instanceof Error ? err.message : typeof err === "string" ? err : "error";
        return jsonResult({
          runId,
          status: "error",
          error: messageText,
          sessionKey: displayKey,
        });
      }

      let waitStatus: string | undefined;
      let waitError: string | undefined;
      try {
        const wait = await callGateway<{ status?: string; error?: string }>({
          method: "agent.wait",
          params: {
            runId,
            timeoutMs,
          },
          timeoutMs: timeoutMs + 2000,
        });
        waitStatus = typeof wait?.status === "string" ? wait.status : undefined;
        waitError = typeof wait?.error === "string" ? wait.error : undefined;
      } catch (err) {
        const messageText =
          err instanceof Error ? err.message : typeof err === "string" ? err : "error";
        return jsonResult({
          runId,
          status: messageText.includes("gateway timeout") ? "timeout" : "error",
          error: messageText,
          sessionKey: displayKey,
        });
      }

      if (waitStatus === "timeout") {
        return jsonResult({
          runId,
          status: "timeout",
          error: waitError,
          sessionKey: displayKey,
        });
      }
      if (waitStatus === "error") {
        return jsonResult({
          runId,
          status: "error",
          error: waitError ?? "agent error",
          sessionKey: displayKey,
        });
      }

      const reply = await readLatestAssistantReply({ sessionKey: resolvedKey });
      return jsonResult({
        runId,
        status: "ok",
        reply,
        sessionKey: displayKey,
        relayMessage,
      });
    },
  };
}
