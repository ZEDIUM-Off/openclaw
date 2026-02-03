import { beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.fn();
vi.mock("../../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGatewayMock(opts),
}));

import { createKgmTool } from "./kgm-tool.js";

describe("kgm tool", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
    callGatewayMock.mockResolvedValue({ ok: true });
  });

  it("routes search to kgm.agent.search", async () => {
    const tool = createKgmTool({ agentSessionKey: "agent:main:main" });
    callGatewayMock.mockResolvedValue({ ok: true, results: [] });

    const result = await tool.execute("call1", {
      action: "search",
      scope: "agent:main",
      query: "hello",
      limit: 3,
    });

    expect(callGatewayMock).toHaveBeenCalledWith({
      method: "kgm.agent.search",
      params: { query: "hello", scope: "agent:main", limit: 3, sessionKey: "agent:main:main" },
    });
    expect(result.details).toMatchObject({ ok: true, results: [] });
  });

  it("routes get to kgm.agent.get", async () => {
    const tool = createKgmTool({ agentSessionKey: "agent:main:main" });

    await tool.execute("call1", { action: "get", scope: "agent:main", key: "node:1" });

    expect(callGatewayMock).toHaveBeenCalledWith({
      method: "kgm.agent.get",
      params: { key: "node:1", scope: "agent:main", sessionKey: "agent:main:main" },
    });
  });

  it("routes putNode to kgm.agent.putNode", async () => {
    const tool = createKgmTool({ agentSessionKey: "agent:main:main" });

    await tool.execute("call1", {
      action: "putNode",
      scope: "agent:main",
      key: "node:1",
      label: "Session",
      properties: { purpose: "triage" },
    });

    expect(callGatewayMock).toHaveBeenCalledWith({
      method: "kgm.agent.putNode",
      params: {
        key: "node:1",
        label: "Session",
        scope: "agent:main",
        properties: { purpose: "triage" },
        sessionKey: "agent:main:main",
      },
    });
  });

  it("routes putEdge to kgm.agent.putEdge", async () => {
    const tool = createKgmTool({ agentSessionKey: "agent:main:main" });

    await tool.execute("call1", {
      action: "putEdge",
      scope: "agent:main",
      fromKey: "node:1",
      fromLabel: "Session",
      toKey: "node:2",
      toLabel: "Message",
      type: "HAS_MESSAGE",
      properties: { weight: 1 },
    });

    expect(callGatewayMock).toHaveBeenCalledWith({
      method: "kgm.agent.putEdge",
      params: {
        fromKey: "node:1",
        fromLabel: "Session",
        toKey: "node:2",
        toLabel: "Message",
        type: "HAS_MESSAGE",
        scope: "agent:main",
        properties: { weight: 1 },
        sessionKey: "agent:main:main",
      },
    });
  });

  it("routes link to kgm.agent.link", async () => {
    const tool = createKgmTool({ agentSessionKey: "agent:main:main" });

    await tool.execute("call1", {
      action: "link",
      scope: "agent:main",
      fromKey: "node:1",
      fromLabel: "Session",
      toKey: "node:2",
      toLabel: "Message",
      type: "HAS_MESSAGE",
    });

    expect(callGatewayMock).toHaveBeenCalledWith({
      method: "kgm.agent.link",
      params: {
        fromKey: "node:1",
        fromLabel: "Session",
        toKey: "node:2",
        toLabel: "Message",
        type: "HAS_MESSAGE",
        scope: "agent:main",
        properties: undefined,
        sessionKey: "agent:main:main",
      },
    });
  });

  it("routes pin to kgm.agent.pin", async () => {
    const tool = createKgmTool({ agentSessionKey: "agent:main:main" });

    await tool.execute("call1", {
      action: "pin",
      scope: "agent:main",
      key: "node:1",
      pinned: false,
    });

    expect(callGatewayMock).toHaveBeenCalledWith({
      method: "kgm.agent.pin",
      params: { key: "node:1", scope: "agent:main", pinned: false, sessionKey: "agent:main:main" },
    });
  });

  it("routes touch to kgm.agent.touch", async () => {
    const tool = createKgmTool({ agentSessionKey: "agent:main:main" });

    await tool.execute("call1", {
      action: "touch",
      scope: "agent:main",
      keys: ["node:1", "node:2"],
    });

    expect(callGatewayMock).toHaveBeenCalledWith({
      method: "kgm.agent.touch",
      params: { keys: ["node:1", "node:2"], scope: "agent:main", sessionKey: "agent:main:main" },
    });
  });

  it("routes gc to kgm.agent.gc", async () => {
    const tool = createKgmTool({ agentSessionKey: "agent:main:main" });

    await tool.execute("call1", {
      action: "gc",
      scope: "agent:main",
      minWeight: 0.5,
      maxNodes: 250,
    });

    expect(callGatewayMock).toHaveBeenCalledWith({
      method: "kgm.agent.gc",
      params: { scope: "agent:main", minWeight: 0.5, maxNodes: 250, sessionKey: "agent:main:main" },
    });
  });

  it("routes ensureSchema to kgm.agent.ensureSchema", async () => {
    const tool = createKgmTool({ agentSessionKey: "agent:main:main" });

    await tool.execute("call1", { action: "ensureSchema", scope: "agent:main" });

    expect(callGatewayMock).toHaveBeenCalledWith({
      method: "kgm.agent.ensureSchema",
      params: { scope: "agent:main", sessionKey: "agent:main:main" },
    });
  });

  it("routes describeSchema to kgm.schema.describe", async () => {
    const tool = createKgmTool({ agentSessionKey: "agent:main:main" });

    await tool.execute("call1", { action: "describeSchema", scope: "agent:main" });

    expect(callGatewayMock).toHaveBeenCalledWith({
      method: "kgm.schema.describe",
      params: { scope: "agent:main", sessionKey: "agent:main:main" },
    });
  });
});
