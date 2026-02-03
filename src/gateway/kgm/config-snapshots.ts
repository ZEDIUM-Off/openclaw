import type { OpenClawConfig } from "../../config/config.js";
import type { KgmProvider } from "../../kgm/provider.js";
import { resolveConfigSnapshotHash } from "../../config/config.js";
import { resolveAdminScope } from "../../kgm/rbac.js";
import { resolveKgmProvider } from "./kgm-client.js";

export async function recordConfigSnapshot(params: {
  cfg: OpenClawConfig;
  raw: string;
  reason: string;
  sessionKey?: string;
  note?: string;
  provider?: KgmProvider;
  log?: { warn: (msg: string) => void };
}): Promise<void> {
  if (params.cfg.kgm?.enabled !== true) {
    return;
  }
  if (params.cfg.kgm?.mode === "fs-only") {
    return;
  }
  const provider = params.provider ?? resolveKgmProvider(params.cfg);
  if (!provider) {
    return;
  }
  const hash = resolveConfigSnapshotHash({ raw: params.raw });
  const ts = Date.now();
  const key = hash ? `config:${hash}` : `config:${ts}`;
  const auditKey = `audit:config:${ts}`;
  const scope = resolveAdminScope();
  const actor = { role: "system" as const };

  try {
    await provider.upsertNode({
      actor,
      scope,
      label: "ConfigSnapshot",
      key,
      properties: {
        id: key,
        ts,
        hash: hash ?? null,
        source: params.reason,
        author: params.sessionKey ?? null,
        note: params.note ?? null,
        size: params.raw.length,
      },
    });
    await provider.upsertNode({
      actor,
      scope,
      label: "AuditEvent",
      key: auditKey,
      properties: {
        id: auditKey,
        ts,
        actor: params.sessionKey ?? "system",
        action: params.reason,
        target: "config",
        ok: true,
        meta: {
          hash: hash ?? null,
          note: params.note ?? null,
        },
      },
    });
  } catch (err) {
    params.log?.warn(`kgm config snapshot failed: ${String(err)}`);
  }
}
