import fs from "node:fs";
import type { OpenClawConfig } from "../../config/config.js";
import type { KgmProvider } from "../../kgm/provider.js";
import { resolveDefaultSessionStorePath } from "../../config/sessions/paths.js";
import { loadSessionStore, type SessionEntry } from "../../config/sessions/store.js";
import { resolveAgentScope } from "../../kgm/rbac.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { onSessionTranscriptUpdate } from "../../sessions/transcript-events.js";
import { resolveKgmProvider } from "./kgm-client.js";

type TranscriptMessage = {
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
  timestamp?: number | string;
  id?: string;
};

type TranscriptLine = {
  type?: string;
  id?: string;
  timestamp?: number | string;
  message?: TranscriptMessage;
};

const LAST_MSG_MAX_BYTES = 16384;
const LAST_MSG_MAX_LINES = 20;

function extractAgentIdFromSessionFile(sessionFile: string): string | undefined {
  const match = sessionFile.match(/[\\/]agents[\\/]([^\\/]+)[\\/]sessions[\\/]/i);
  if (!match?.[1]) {
    return undefined;
  }
  return normalizeAgentId(match[1]);
}

function readFirstJsonLine(filePath: string): TranscriptLine | null {
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(4096);
      const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
      if (bytesRead <= 0) {
        return null;
      }
      const chunk = buf.toString("utf-8", 0, bytesRead);
      const lines = chunk.split(/\r?\n/).filter((line) => line.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed && typeof parsed === "object") {
            return parsed as TranscriptLine;
          }
        } catch {
          continue;
        }
      }
      return null;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

function extractTextFromContent(content: TranscriptMessage["content"]): string | null {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed ? trimmed : null;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  for (const part of content) {
    if (!part || typeof part.text !== "string") {
      continue;
    }
    const type = typeof part.type === "string" ? part.type : "";
    if (type === "text" || type === "output_text" || type === "input_text" || !type) {
      const trimmed = part.text.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return null;
}

function coerceTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function readLastMessageLine(filePath: string): TranscriptLine | null {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const stat = fs.fstatSync(fd);
    const size = stat.size;
    if (size === 0) {
      return null;
    }
    const readStart = Math.max(0, size - LAST_MSG_MAX_BYTES);
    const readLen = Math.min(size, LAST_MSG_MAX_BYTES);
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, readLen, readStart);
    const chunk = buf.toString("utf-8");
    const lines = chunk.split(/\r?\n/).filter((line) => line.trim());
    const tailLines = lines.slice(-LAST_MSG_MAX_LINES);
    for (let i = tailLines.length - 1; i >= 0; i -= 1) {
      const line = tailLines[i];
      try {
        const parsed = JSON.parse(line) as TranscriptLine;
        if (parsed?.message) {
          return parsed;
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
}

function resolveEntryId(params: {
  sessionId: string;
  line: TranscriptLine;
  timestamp: number;
}): string {
  const messageId = params.line.message?.id ?? params.line.id;
  if (typeof messageId === "string" && messageId.trim()) {
    return messageId.trim();
  }
  return `${params.sessionId}:${params.timestamp}`;
}

function resolveSessionEntryForFile(params: {
  agentId: string;
  sessionFile: string;
  sessionId?: string;
  storePath?: string;
}): { key: string; entry: SessionEntry; storePath: string } | null {
  const storePath = params.storePath ?? resolveDefaultSessionStorePath(params.agentId);
  const store = loadSessionStore(storePath, { skipCache: true });
  for (const [key, entry] of Object.entries(store)) {
    if (!entry) {
      continue;
    }
    if (entry.sessionFile && entry.sessionFile === params.sessionFile) {
      return { key, entry, storePath };
    }
    if (params.sessionId && entry.sessionId === params.sessionId) {
      return { key, entry, storePath };
    }
  }
  return null;
}

export async function ingestSessionTranscriptFile(params: {
  cfg: OpenClawConfig;
  sessionFile: string;
  provider?: KgmProvider;
  storePath?: string;
  log?: { warn: (msg: string) => void };
}) {
  if (params.cfg.kgm?.enabled !== true) {
    return;
  }
  const provider = params.provider ?? resolveKgmProvider(params.cfg);
  if (!provider) {
    return;
  }
  const agentId = extractAgentIdFromSessionFile(params.sessionFile);
  if (!agentId) {
    return;
  }
  const header = readFirstJsonLine(params.sessionFile);
  const sessionId =
    typeof header?.id === "string" && header.id.trim() ? header.id.trim() : undefined;
  if (!sessionId) {
    return;
  }
  const resolved = resolveSessionEntryForFile({
    agentId,
    sessionFile: params.sessionFile,
    sessionId,
    storePath: params.storePath,
  });
  if (!resolved) {
    return;
  }
  const line = readLastMessageLine(params.sessionFile);
  if (!line?.message) {
    return;
  }
  const contentText = extractTextFromContent(line.message.content) ?? "message";
  const timestamp =
    coerceTimestamp(line.message.timestamp) ?? coerceTimestamp(line.timestamp) ?? Date.now();
  const entryId = resolveEntryId({ sessionId, line, timestamp });
  const scope = resolveAgentScope(agentId);
  const actor = { role: "system" as const, agentId, sessionKey: resolved.key };

  try {
    await provider.upsertNode({
      actor,
      scope,
      label: "Session",
      key: resolved.key,
      properties: {
        sessionId,
        agentId,
        sessionKey: resolved.key,
        updatedAt: timestamp,
      },
    });
    await provider.upsertNode({
      actor,
      scope,
      label: "Message",
      key: entryId,
      properties: {
        entryId,
        sessionId,
        sessionKey: resolved.key,
        role: line.message.role ?? "unknown",
        ts: timestamp,
        preview: contentText.slice(0, 200),
      },
    });
    await provider.upsertEdge({
      actor,
      scope,
      type: "HAS_MESSAGE",
      from: { key: resolved.key, label: "Session" },
      to: { key: entryId, label: "Message" },
    });
  } catch (err) {
    params.log?.warn(`kgm transcript ingest failed: ${String(err)}`);
  }
}

export function startKgmSessionTranscriptIngestor(params: {
  cfg: OpenClawConfig;
  log?: { warn: (msg: string) => void };
}) {
  if (params.cfg.kgm?.enabled !== true) {
    return () => {};
  }
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const schedule = (sessionFile: string) => {
    const existing = timers.get(sessionFile);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      timers.delete(sessionFile);
      void ingestSessionTranscriptFile({
        cfg: params.cfg,
        sessionFile,
        log: params.log,
      });
    }, 250);
    timers.set(sessionFile, timer);
  };
  const unsubscribe = onSessionTranscriptUpdate((update) => {
    const sessionFile = update.sessionFile?.trim();
    if (!sessionFile) {
      return;
    }
    schedule(sessionFile);
  });
  return () => {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
    unsubscribe();
  };
}
