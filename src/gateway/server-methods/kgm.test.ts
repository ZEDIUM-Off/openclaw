import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import type { KgmProvider } from "../../kgm/provider.js";
import type { GatewayRequestContext } from "./types.js";
import { kgmHandlers } from "./kgm.js";

const mocks = vi.hoisted(() => ({
  provider: null as KgmProvider | null,
}));

const configState: OpenClawConfig = {
  kgm: { enabled: true },
};

vi.mock("../../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => configState,
  };
});

vi.mock("../kgm/kgm-client.js", () => ({
  requireKgmProvider: () => mocks.provider,
  resolveKgmProvider: () => mocks.provider,
  buildOperatorActor: () => ({ role: "operator" }),
}));

const makeContext = (): GatewayRequestContext =>
  ({
    dedupe: new Map(),
    logGateway: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }) as unknown as GatewayRequestContext;

beforeEach(() => {
  configState.session = undefined;
  configState.agents = undefined;
  mocks.provider = null;
});

describe("kgm.agent.context.materialize", () => {
  it("includes message previews when available", async () => {
    const provider: KgmProvider = {
      id: "memgraph",
      query: vi.fn(async (params) => {
        if (params.cypher.includes("ContextItem { kind: 'node'")) {
          return { rows: [{ refKey: "node:1" }] };
        }
        if (params.cypher.includes("ContextItem { kind: 'message'")) {
          return { rows: [{ refKey: "msg-1" }] };
        }
        if (params.cypher.includes("MATCH (m:Message")) {
          return {
            rows: [
              {
                key: "msg-1",
                preview: "hello",
                role: "user",
                sessionKey: "agent:main:main",
              },
            ],
          };
        }
        return { rows: [] };
      }),
      ensureSchema: vi.fn(async () => undefined),
      upsertNode: vi.fn(async (params) => ({ key: params.key, label: params.label })),
      upsertEdge: vi.fn(async (params) => ({ type: params.type })),
      search: vi.fn(async () => []),
      touch: vi.fn(async () => undefined),
      gc: vi.fn(async () => ({ removed: 0 })),
      describeSchema: vi.fn(async () => ({ observed: {} })),
    };
    mocks.provider = provider;

    const respond = vi.fn();
    await kgmHandlers["kgm.agent.context.materialize"]({
      params: {
        scope: "agent:main",
        sessionKey: "agent:main:main",
        maxNodes: 5,
        maxMessages: 5,
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "1", method: "kgm.agent.context.materialize" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        content: expect.stringContaining("msg-1 (user) [agent:main:main]: hello"),
      }),
      undefined,
    );
  });

  it("rehydrates message text from transcript when available", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-kgm-materialize-"));
    const sessionId = "session-123";
    const entryId = "entry-1";
    const storePath = path.join(dir, "sessions.json");
    const transcriptPath = path.join(dir, `${sessionId}.jsonl`);

    fs.writeFileSync(
      storePath,
      JSON.stringify(
        {
          "agent:main:main": {
            sessionId,
            updatedAt: Date.now(),
            sessionFile: transcriptPath,
          },
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({ type: "session", id: sessionId, timestamp: new Date().toISOString() }),
        JSON.stringify({
          type: "message",
          id: entryId,
          timestamp: new Date().toISOString(),
          message: {
            id: entryId,
            role: "user",
            content: [{ type: "text", text: "full transcript message" }],
          },
        }),
      ].join("\n"),
      "utf-8",
    );

    configState.session = { store: storePath } as OpenClawConfig["session"];

    const provider: KgmProvider = {
      id: "memgraph",
      query: vi.fn(async (params) => {
        if (params.cypher.includes("ContextItem { kind: 'node'")) {
          return { rows: [] };
        }
        if (params.cypher.includes("ContextItem { kind: 'message'")) {
          return { rows: [{ refKey: entryId }] };
        }
        if (params.cypher.includes("MATCH (m:Message")) {
          return {
            rows: [
              {
                key: entryId,
                preview: "preview",
                role: "user",
                sessionKey: "agent:main:main",
                sessionId,
                entryId,
              },
            ],
          };
        }
        return { rows: [] };
      }),
      ensureSchema: vi.fn(async () => undefined),
      upsertNode: vi.fn(async (params) => ({ key: params.key, label: params.label })),
      upsertEdge: vi.fn(async (params) => ({ type: params.type })),
      search: vi.fn(async () => []),
      touch: vi.fn(async () => undefined),
      gc: vi.fn(async () => ({ removed: 0 })),
      describeSchema: vi.fn(async () => ({ observed: {} })),
    };
    mocks.provider = provider;

    const respond = vi.fn();
    await kgmHandlers["kgm.agent.context.materialize"]({
      params: {
        scope: "agent:main",
        sessionKey: "agent:main:main",
        maxNodes: 5,
        maxMessages: 5,
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "2", method: "kgm.agent.context.materialize" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        content: expect.stringContaining("full transcript message"),
      }),
      undefined,
    );

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns expected schema registry when available", async () => {
    const provider: KgmProvider = {
      id: "memgraph",
      query: vi.fn(async (params) => {
        if (params.cypher.includes("SHOW SCHEMA INFO")) {
          return { rows: [{ label: "Session" }] };
        }
        if (params.cypher.includes("GraphSchema") && params.cypher.includes("APPLIES_TO")) {
          return {
            rows: [
              {
                name: "kgm-agent",
                version: "v1",
                hash: "hash123",
                appliesToKind: "agent",
                path: "/tmp/schema.cypherl",
              },
            ],
          };
        }
        return { rows: [] };
      }),
      ensureSchema: vi.fn(async () => undefined),
      upsertNode: vi.fn(async (params) => ({ key: params.key, label: params.label })),
      upsertEdge: vi.fn(async (params) => ({ type: params.type })),
      search: vi.fn(async () => []),
      touch: vi.fn(async () => undefined),
      gc: vi.fn(async () => ({ removed: 0 })),
      describeSchema: vi.fn(async () => ({ observed: { rows: [{ label: "Session" }] } })),
    };
    mocks.provider = provider;

    const respond = vi.fn();
    await kgmHandlers["kgm.schema.describe"]({
      params: {
        scope: "agent:main",
        sessionKey: "agent:main:main",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "3", method: "kgm.schema.describe" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        expectedSchema: expect.objectContaining({
          registry: expect.objectContaining({
            name: "kgm-agent",
            version: "v1",
            hash: "hash123",
            appliesToKind: "agent",
            path: "/tmp/schema.cypherl",
          }),
        }),
      }),
      undefined,
    );
  });

  it("omits USER and MEMORY docs for group sessions", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-kgm-docs-"));
    const agentsPath = path.join(dir, "AGENTS.md");
    const userPath = path.join(dir, "USER.md");
    const memoryPath = path.join(dir, "MEMORY.md");
    fs.writeFileSync(agentsPath, "# Agents\nkeep", "utf-8");
    fs.writeFileSync(userPath, "# User\nsecret", "utf-8");
    fs.writeFileSync(memoryPath, "# Memory\nsecret", "utf-8");

    configState.agents = { defaults: { workspace: dir } } as OpenClawConfig["agents"];

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
    mocks.provider = provider;

    const respond = vi.fn();
    await kgmHandlers["kgm.agent.context.materialize"]({
      params: {
        scope: "agent:main",
        sessionKey: "discord:group:dev",
        maxNodes: 5,
        maxMessages: 5,
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "4", method: "kgm.agent.context.materialize" },
      client: null,
      isWebchatConnect: () => false,
    });

    const payload = respond.mock.calls[0]?.[1] as { content?: string } | undefined;
    expect(payload?.content).toContain("AGENTS.md");
    expect(payload?.content).not.toContain("USER.md");
    expect(payload?.content).not.toContain("MEMORY.md");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("rejects agent writes to other scopes", async () => {
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
    mocks.provider = provider;

    const respond = vi.fn();
    await kgmHandlers["kgm.agent.putNode"]({
      params: {
        scope: "agent:other",
        key: "node:1",
        label: "Session",
        properties: { ok: true },
        sessionKey: "agent:main:main",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "5", method: "kgm.agent.putNode" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "scope not allowed" }),
    );
    expect(provider.upsertNode).not.toHaveBeenCalled();
  });
});
