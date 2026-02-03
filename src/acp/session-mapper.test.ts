import { describe, expect, it, vi } from "vitest";
import type { GatewayClient } from "../gateway/client.js";
import { parseSessionMeta, resolveSessionKey } from "./session-mapper.js";

function createGateway(resolveLabelKey = "agent:main:label"): {
  gateway: GatewayClient;
  request: ReturnType<typeof vi.fn>;
} {
  const request = vi.fn(async (method: string, params: Record<string, unknown>) => {
    if (method === "sessions.find" && "label" in params) {
      return { matches: [{ key: resolveLabelKey }] };
    }
    if (method === "sessions.find" && "key" in params) {
      return { matches: [{ key: params.key as string }] };
    }
    return { ok: true };
  });

  return {
    gateway: { request } as unknown as GatewayClient,
    request,
  };
}

describe("acp session mapper", () => {
  it("prefers explicit sessionLabel over sessionKey", async () => {
    const { gateway, request } = createGateway();
    const meta = parseSessionMeta({ sessionLabel: "support", sessionKey: "agent:main:main" });

    const key = await resolveSessionKey({
      meta,
      fallbackKey: "acp:fallback",
      gateway,
      opts: {},
    });

    expect(key).toBe("agent:main:label");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("sessions.find", { label: "support", limit: 2 });
  });

  it("lets meta sessionKey override default label", async () => {
    const { gateway, request } = createGateway();
    const meta = parseSessionMeta({ sessionKey: "agent:main:override" });

    const key = await resolveSessionKey({
      meta,
      fallbackKey: "acp:fallback",
      gateway,
      opts: { defaultSessionLabel: "default-label" },
    });

    expect(key).toBe("agent:main:override");
    expect(request).not.toHaveBeenCalled();
  });
});
