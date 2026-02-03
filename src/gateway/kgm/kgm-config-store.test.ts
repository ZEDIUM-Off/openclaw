import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import type { KgmProvider } from "../../kgm/provider.js";
import {
  mirrorAgentsToKgm,
  mirrorNodesToKgm,
  mirrorSkillsToKgm,
  readAgentsFromKgm,
  readNodesFromKgm,
} from "./kgm-config-store.js";

function createProvider(): KgmProvider {
  return {
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
}

describe("kgm-config-store", () => {
  const cfg = { kgm: { enabled: true } } as OpenClawConfig;
  const cfgFsOnly = { kgm: { enabled: true, mode: "fs-only" } } as OpenClawConfig;
  const cfgPrimary = { kgm: { enabled: true, mode: "kgm-primary" } } as OpenClawConfig;

  it("mirrors agents to KGM", async () => {
    const provider = createProvider();
    await mirrorAgentsToKgm({
      cfg,
      provider,
      agents: [{ id: "main", name: "Main" }],
    });

    expect(provider.upsertNode).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Agent",
        key: "agent:main",
        scope: "admin",
      }),
    );
  });

  it("skips mirroring when KGM is fs-only", async () => {
    const provider = createProvider();
    await mirrorAgentsToKgm({
      cfg: cfgFsOnly,
      provider,
      agents: [{ id: "main", name: "Main" }],
    });

    expect(provider.upsertNode).not.toHaveBeenCalled();
  });

  it("mirrors skills to KGM", async () => {
    const provider = createProvider();
    await mirrorSkillsToKgm({
      cfg,
      provider,
      agentId: "main",
      skills: [{ name: "kgm", skillKey: "kgm", source: "skills" }],
    });

    expect(provider.upsertNode).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Skill",
        key: "skill:kgm",
        scope: "admin",
      }),
    );
  });

  it("mirrors nodes to KGM", async () => {
    const provider = createProvider();
    await mirrorNodesToKgm({
      cfg,
      provider,
      nodes: [{ nodeId: "node-1", displayName: "Node" }],
    });

    expect(provider.upsertNode).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Node",
        key: "node:node-1",
        scope: "admin",
      }),
    );
  });

  it("reads agents from KGM when primary", async () => {
    const provider = createProvider();
    vi.mocked(provider.query).mockResolvedValue({
      rows: [{ id: "main", name: "Main", identity: { name: "Main" } }],
    });

    const agents = await readAgentsFromKgm({ cfg: cfgPrimary, provider });

    expect(agents).toEqual([
      {
        id: "main",
        name: "Main",
        identity: { name: "Main" },
      },
    ]);
  });

  it("skips reading agents when not primary", async () => {
    const provider = createProvider();
    const agents = await readAgentsFromKgm({ cfg, provider });

    expect(agents).toBeNull();
  });

  it("reads nodes from KGM when primary", async () => {
    const provider = createProvider();
    vi.mocked(provider.query).mockResolvedValue({
      rows: [
        {
          node: {
            id: "node-1",
            displayName: "Node",
            platform: "linux",
            connected: true,
            caps: ["a"],
            commands: ["b"],
          },
        },
      ],
    });

    const nodes = await readNodesFromKgm({ cfg: cfgPrimary, provider });

    expect(nodes).toEqual([
      {
        nodeId: "node-1",
        displayName: "Node",
        platform: "linux",
        version: undefined,
        coreVersion: undefined,
        uiVersion: undefined,
        deviceFamily: undefined,
        modelIdentifier: undefined,
        remoteIp: undefined,
        caps: ["a"],
        commands: ["b"],
        pathEnv: undefined,
        permissions: undefined,
        connectedAtMs: undefined,
        paired: undefined,
        connected: true,
      },
    ]);
  });
});
