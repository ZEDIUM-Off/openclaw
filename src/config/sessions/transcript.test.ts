import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KgmProvider } from "../../kgm/provider.js";
import {
  appendAssistantMessageToSessionTranscript,
  resolveMirroredTranscriptText,
} from "./transcript.js";

const mocks = vi.hoisted(() => ({
  resolveKgmProvider: vi.fn(),
  loadConfig: vi.fn(),
}));

vi.mock("../config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config.js")>();
  return {
    ...actual,
    loadConfig: () => mocks.loadConfig(),
  };
});

vi.mock("../../gateway/kgm/kgm-client.js", () => ({
  resolveKgmProvider: () => mocks.resolveKgmProvider(),
}));

describe("resolveMirroredTranscriptText", () => {
  it("prefers media filenames over text", () => {
    const result = resolveMirroredTranscriptText({
      text: "caption here",
      mediaUrls: ["https://example.com/files/report.pdf?sig=123"],
    });
    expect(result).toBe("report.pdf");
  });

  it("returns trimmed text when no media", () => {
    const result = resolveMirroredTranscriptText({ text: "  hello  " });
    expect(result).toBe("hello");
  });
});

describe("appendAssistantMessageToSessionTranscript", () => {
  let tempDir: string;
  let storePath: string;
  let sessionsDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "transcript-test-"));
    sessionsDir = path.join(tempDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    storePath = path.join(sessionsDir, "sessions.json");
    mocks.loadConfig.mockReturnValue({ kgm: { enabled: false } });
    mocks.resolveKgmProvider.mockReturnValue(null);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns error for missing sessionKey", async () => {
    const result = await appendAssistantMessageToSessionTranscript({
      sessionKey: "",
      text: "test",
      storePath,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("missing sessionKey");
    }
  });

  it("returns error for empty text", async () => {
    const result = await appendAssistantMessageToSessionTranscript({
      sessionKey: "test-session",
      text: "   ",
      storePath,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("empty text");
    }
  });

  it("returns error for unknown sessionKey", async () => {
    fs.writeFileSync(storePath, JSON.stringify({}), "utf-8");
    const result = await appendAssistantMessageToSessionTranscript({
      sessionKey: "nonexistent",
      text: "test message",
      storePath,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("unknown sessionKey");
    }
  });

  it("creates transcript file and appends message for valid session", async () => {
    const sessionId = "test-session-id";
    const sessionKey = "agent:main:main";
    const store = {
      [sessionKey]: {
        sessionId,
        chatType: "direct",
        channel: "discord",
      },
    };
    fs.writeFileSync(storePath, JSON.stringify(store), "utf-8");

    const result = await appendAssistantMessageToSessionTranscript({
      sessionKey,
      text: "Hello from delivery mirror!",
      storePath,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(fs.existsSync(result.sessionFile)).toBe(true);

      const lines = fs.readFileSync(result.sessionFile, "utf-8").trim().split("\n");
      expect(lines.length).toBe(2); // header + message

      const header = JSON.parse(lines[0]);
      expect(header.type).toBe("session");
      expect(header.id).toBe(sessionId);

      const messageLine = JSON.parse(lines[1]);
      expect(messageLine.type).toBe("message");
      expect(messageLine.message.role).toBe("assistant");
      expect(messageLine.message.content[0].type).toBe("text");
      expect(messageLine.message.content[0].text).toBe("Hello from delivery mirror!");
    }
  });

  it("ingests mirror message into KGM when enabled", async () => {
    const sessionId = "test-session-id";
    const sessionKey = "agent:main:main";
    const store = {
      [sessionKey]: {
        sessionId,
        chatType: "direct",
        channel: "discord",
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
    mocks.loadConfig.mockReturnValue({ kgm: { enabled: true } });
    mocks.resolveKgmProvider.mockReturnValue(provider);

    const result = await appendAssistantMessageToSessionTranscript({
      sessionKey,
      text: "Hello from delivery mirror!",
      storePath,
    });

    expect(result.ok).toBe(true);
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
