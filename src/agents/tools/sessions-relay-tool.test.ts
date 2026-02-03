import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";

const callGatewayMock = vi.fn();
vi.mock("../../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGatewayMock(opts),
}));

const configState = {
  session: { scope: "per-sender", mainKey: "main" },
  tools: { agentToAgent: { enabled: false, allow: ["*"] } },
} as OpenClawConfig;

vi.mock("../../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => configState,
  };
});

const runAgentStepMock = vi.fn();
const readLatestAssistantReplyMock = vi.fn();
vi.mock("./agent-step.js", () => ({
  runAgentStep: (params: unknown) => runAgentStepMock(params),
  readLatestAssistantReply: (params: unknown) => readLatestAssistantReplyMock(params),
}));

import { createSessionsRelayTool } from "./sessions-relay-tool.js";

describe("sessions_relay", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
    runAgentStepMock.mockReset();
    readLatestAssistantReplyMock.mockReset();
    configState.tools = { agentToAgent: { enabled: false, allow: ["*"] } };
  });

  it("blocks cross-agent relay when tools.agentToAgent.enabled is false", async () => {
    const tool = createSessionsRelayTool({ agentSessionKey: "agent:main:main" });

    const result = await tool.execute("call1", {
      sessionKey: "agent:other:main",
      message: "hi",
      timeoutSeconds: 0,
    });

    expect(callGatewayMock).not.toHaveBeenCalled();
    expect(runAgentStepMock).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({ status: "forbidden" });
  });

  it("relays via bridge and returns final reply", async () => {
    configState.tools = { agentToAgent: { enabled: true, allow: ["*"] } };
    runAgentStepMock.mockResolvedValue("relay message");
    readLatestAssistantReplyMock.mockResolvedValue("final reply");
    callGatewayMock.mockImplementation(async (request) => {
      if (request?.method === "agent") {
        return { runId: "run-1" };
      }
      if (request?.method === "agent.wait") {
        return { status: "ok" };
      }
      throw new Error("unexpected callGateway");
    });

    const tool = createSessionsRelayTool({ agentSessionKey: "agent:main:main" });
    const result = await tool.execute("call1", {
      sessionKey: "agent:main:main",
      message: "hi",
      timeoutSeconds: 0,
    });

    expect(runAgentStepMock).toHaveBeenCalled();
    expect(callGatewayMock).toHaveBeenCalledWith(expect.objectContaining({ method: "agent" }));
    expect(callGatewayMock).toHaveBeenCalledWith(expect.objectContaining({ method: "agent.wait" }));
    expect(result.details).toMatchObject({
      status: "ok",
      relayMessage: "relay message",
      reply: "final reply",
    });
  });
});
