import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import type { KgmProvider } from "../../kgm/provider.js";
import { recordConfigSnapshot } from "./config-snapshots.js";

describe("recordConfigSnapshot", () => {
  it("writes a ConfigSnapshot node when KGM is enabled", async () => {
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

    await recordConfigSnapshot({
      cfg,
      raw: "{ foo: 'bar' }",
      reason: "config.patch",
      sessionKey: "agent:main:main",
      note: "update",
      provider,
    });

    expect(provider.upsertNode).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "ConfigSnapshot",
        scope: "admin",
        properties: expect.objectContaining({
          source: "config.patch",
          author: "agent:main:main",
          note: "update",
        }),
      }),
    );
    expect(provider.upsertNode).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "AuditEvent",
        scope: "admin",
        properties: expect.objectContaining({
          action: "config.patch",
          target: "config",
          ok: true,
        }),
      }),
    );
  });

  it("skips snapshots when KGM is fs-only", async () => {
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
    const cfg = { kgm: { enabled: true, mode: "fs-only" } } as OpenClawConfig;

    await recordConfigSnapshot({
      cfg,
      raw: "{ foo: 'bar' }",
      reason: "config.patch",
      provider,
    });

    expect(provider.upsertNode).not.toHaveBeenCalled();
  });
});
