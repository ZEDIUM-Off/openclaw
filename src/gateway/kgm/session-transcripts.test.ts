import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import type { KgmProvider } from "../../kgm/provider.js";
import { ingestSessionTranscriptFile } from "./session-transcripts.js";

describe("kgm session transcript ingest", () => {
  let tempDir: string;
  let sessionsDir: string;
  let sessionFile: string;
  let storePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kgm-session-"));
    sessionsDir = path.join(tempDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    storePath = path.join(sessionsDir, "sessions.json");
    sessionFile = path.join(sessionsDir, "session-123.jsonl");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("ingests the latest transcript message into KGM", async () => {
    const sessionId = "session-123";
    const sessionKey = "agent:main:main";
    const header = {
      type: "session",
      id: sessionId,
      timestamp: new Date().toISOString(),
      cwd: "/tmp",
    };
    const messageLine = {
      type: "message",
      message: {
        role: "user",
        timestamp: 123,
        content: [{ type: "text", text: "Hello KGM" }],
      },
    };
    fs.writeFileSync(
      sessionFile,
      `${JSON.stringify(header)}\n${JSON.stringify(messageLine)}\n`,
      "utf-8",
    );

    const store = {
      [sessionKey]: {
        sessionId,
        sessionFile,
      },
    };
    fs.writeFileSync(storePath, JSON.stringify(store), "utf-8");

    const provider: KgmProvider = {
      id: "memgraph",
      query: vi.fn(async () => ({ rows: [] })),
      ensureSchema: vi.fn(async () => undefined),
      upsertNode: vi.fn(async (params) => ({ key: params.key, label: params.label })),
      upsertEdge: vi.fn(async (params) => ({ type: params.type })),
      search: vi.fn(async () => []),
      touch: vi.fn(async () => undefined),
      gc: vi.fn(async () => ({ removed: 0 })),
      describeSchema: vi.fn(async () => ({ observed: {} })),
    };
    const cfg = { kgm: { enabled: true } } as OpenClawConfig;

    await ingestSessionTranscriptFile({
      cfg,
      sessionFile,
      provider,
      storePath,
      log: { warn: vi.fn() },
    });

    expect(provider.upsertNode).toHaveBeenCalledTimes(2);
    expect(provider.upsertEdge).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "HAS_MESSAGE",
        from: { key: sessionKey, label: "Session" },
        to: expect.objectContaining({ label: "Message" }),
      }),
    );
  });
});
