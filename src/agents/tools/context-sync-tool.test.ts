import { beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.fn();
vi.mock("../../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGatewayMock(opts),
}));

import { createContextSyncTool } from "./context-sync-tool.js";

describe("context_sync tool", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
    callGatewayMock.mockResolvedValue({ ok: true });
  });

  it("routes list to kgm.agent.context.get", async () => {
    const tool = createContextSyncTool({ agentSessionKey: "agent:main:main" });

    await tool.execute("call1", { action: "list", scope: "agent:main" });

    expect(callGatewayMock).toHaveBeenCalledWith({
      method: "kgm.agent.context.get",
      params: { scope: "agent:main", sessionKey: "agent:main:main" },
    });
  });

  it("routes addNode to context.patch with addNodes", async () => {
    const tool = createContextSyncTool({ agentSessionKey: "agent:main:main" });

    await tool.execute("call1", {
      action: "addNode",
      scope: "agent:main",
      nodeKey: "node:1",
      nodeKeys: ["node:2"],
    });

    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "kgm.agent.context.patch",
        params: expect.objectContaining({
          scope: "agent:main",
          addNodes: expect.arrayContaining(["node:1", "node:2"]),
          sessionKey: "agent:main:main",
        }),
      }),
    );
  });

  it("routes removeNode to context.patch with removeNodes", async () => {
    const tool = createContextSyncTool({ agentSessionKey: "agent:main:main" });

    await tool.execute("call1", {
      action: "removeNode",
      scope: "agent:main",
      nodeKeys: ["node:1", "node:2"],
    });

    expect(callGatewayMock).toHaveBeenCalledWith({
      method: "kgm.agent.context.patch",
      params: {
        scope: "agent:main",
        removeNodes: ["node:1", "node:2"],
        sessionKey: "agent:main:main",
      },
    });
  });

  it("routes addMessage to context.patch with addMessages", async () => {
    const tool = createContextSyncTool({ agentSessionKey: "agent:main:main" });

    await tool.execute("call1", {
      action: "addMessage",
      scope: "agent:main",
      messageKey: "session:1#entry:2",
    });

    expect(callGatewayMock).toHaveBeenCalledWith({
      method: "kgm.agent.context.patch",
      params: {
        scope: "agent:main",
        addMessages: ["session:1#entry:2"],
        sessionKey: "agent:main:main",
      },
    });
  });

  it("routes removeMessage to context.patch with removeMessages", async () => {
    const tool = createContextSyncTool({ agentSessionKey: "agent:main:main" });

    await tool.execute("call1", {
      action: "removeMessage",
      scope: "agent:main",
      messageKeys: ["session:1#entry:2"],
    });

    expect(callGatewayMock).toHaveBeenCalledWith({
      method: "kgm.agent.context.patch",
      params: {
        scope: "agent:main",
        removeMessages: ["session:1#entry:2"],
        sessionKey: "agent:main:main",
      },
    });
  });

  it("routes materialize to context.materialize", async () => {
    const tool = createContextSyncTool({ agentSessionKey: "agent:main:main" });

    await tool.execute("call1", {
      action: "materialize",
      scope: "agent:main",
      maxNodes: 10,
      maxMessages: 5,
    });

    expect(callGatewayMock).toHaveBeenCalledWith({
      method: "kgm.agent.context.materialize",
      params: { scope: "agent:main", maxNodes: 10, maxMessages: 5, sessionKey: "agent:main:main" },
    });
  });

  it("returns an error when addNode is missing keys", async () => {
    const tool = createContextSyncTool({ agentSessionKey: "agent:main:main" });

    const result = await tool.execute("call1", { action: "addNode", scope: "agent:main" });

    expect(callGatewayMock).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({ status: "error" });
  });
});
