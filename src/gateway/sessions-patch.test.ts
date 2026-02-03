import { describe, expect, test } from "vitest";
import { vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { SessionEntry } from "../config/sessions.js";
import { applySessionsPatchToStore } from "./sessions-patch.js";

describe("gateway sessions patch", () => {
  test("persists elevatedLevel=off (does not clear)", async () => {
    const store: Record<string, SessionEntry> = {};
    const res = await applySessionsPatchToStore({
      cfg: {} as OpenClawConfig,
      store,
      storeKey: "agent:main:main",
      patch: { elevatedLevel: "off" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expect(res.entry.elevatedLevel).toBe("off");
  });

  test("persists elevatedLevel=on", async () => {
    const store: Record<string, SessionEntry> = {};
    const res = await applySessionsPatchToStore({
      cfg: {} as OpenClawConfig,
      store,
      storeKey: "agent:main:main",
      patch: { elevatedLevel: "on" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expect(res.entry.elevatedLevel).toBe("on");
  });

  test("clears elevatedLevel when patch sets null", async () => {
    const store: Record<string, SessionEntry> = {
      "agent:main:main": { elevatedLevel: "off" } as SessionEntry,
    };
    const res = await applySessionsPatchToStore({
      cfg: {} as OpenClawConfig,
      store,
      storeKey: "agent:main:main",
      patch: { elevatedLevel: null },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expect(res.entry.elevatedLevel).toBeUndefined();
  });

  test("rejects invalid elevatedLevel values", async () => {
    const store: Record<string, SessionEntry> = {};
    const res = await applySessionsPatchToStore({
      cfg: {} as OpenClawConfig,
      store,
      storeKey: "agent:main:main",
      patch: { elevatedLevel: "maybe" },
    });
    expect(res.ok).toBe(false);
    if (res.ok) {
      return;
    }
    expect(res.error.message).toContain("invalid elevatedLevel");
  });

  test("clears auth overrides when model patch changes", async () => {
    const store: Record<string, SessionEntry> = {
      "agent:main:main": {
        sessionId: "sess",
        updatedAt: 1,
        providerOverride: "anthropic",
        modelOverride: "claude-opus-4-5",
        authProfileOverride: "anthropic:default",
        authProfileOverrideSource: "user",
        authProfileOverrideCompactionCount: 3,
      } as SessionEntry,
    };
    const res = await applySessionsPatchToStore({
      cfg: {} as OpenClawConfig,
      store,
      storeKey: "agent:main:main",
      patch: { model: "openai/gpt-5.2" },
      loadGatewayModelCatalog: async () => [{ provider: "openai", id: "gpt-5.2" }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expect(res.entry.providerOverride).toBe("openai");
    expect(res.entry.modelOverride).toBe("gpt-5.2");
    expect(res.entry.authProfileOverride).toBeUndefined();
    expect(res.entry.authProfileOverrideSource).toBeUndefined();
    expect(res.entry.authProfileOverrideCompactionCount).toBeUndefined();
  });

  test("sets pinnedAt when pin=true", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-03T00:00:00Z"));
    const store: Record<string, SessionEntry> = {
      "agent:main:main": { sessionId: "sess", updatedAt: 1 } as SessionEntry,
    };
    const res = await applySessionsPatchToStore({
      cfg: {} as OpenClawConfig,
      store,
      storeKey: "agent:main:main",
      patch: { pin: true },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.entry.pinnedAt).toBe(Date.parse("2026-02-03T00:00:00Z"));
    }
    vi.useRealTimers();
  });

  test("clears pinnedAt when pin=false", async () => {
    const store: Record<string, SessionEntry> = {
      "agent:main:main": { pinnedAt: 123, sessionId: "sess", updatedAt: 1 } as SessionEntry,
    };
    const res = await applySessionsPatchToStore({
      cfg: {} as OpenClawConfig,
      store,
      storeKey: "agent:main:main",
      patch: { pin: false },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.entry.pinnedAt).toBeUndefined();
    }
  });

  test("trims and caps purpose", async () => {
    const store: Record<string, SessionEntry> = {
      "agent:main:main": { sessionId: "sess", updatedAt: 1 } as SessionEntry,
    };
    const long = `  ${"x".repeat(250)}  `;
    const res = await applySessionsPatchToStore({
      cfg: {} as OpenClawConfig,
      store,
      storeKey: "agent:main:main",
      patch: { purpose: long },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.entry.purpose?.length).toBe(200);
    }
  });
});
