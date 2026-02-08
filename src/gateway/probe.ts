import { randomUUID } from "node:crypto";
import type { SystemPresence } from "../infra/system-presence.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../utils/message-channel.js";
import { GatewayClient } from "./client.js";

export type GatewayProbeAuth = {
  token?: string;
  password?: string;
};

export type GatewayProbeClose = {
  code: number;
  reason: string;
  hint?: string;
};

export type GatewayProbeResult = {
  ok: boolean;
  url: string;
  connectLatencyMs: number | null;
  error: string | null;
  close: GatewayProbeClose | null;
  health: unknown;
  status: unknown;
  presence: SystemPresence[] | null;
  configSnapshot: unknown;
  kgmStatus?: {
    enabled?: boolean;
    provider?: string;
    mode?: string;
    connected?: boolean;
    error?: string;
  } | null;
};

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export async function probeGateway(opts: {
  url: string;
  auth?: GatewayProbeAuth;
  timeoutMs: number;
}): Promise<GatewayProbeResult> {
  const startedAt = Date.now();
  const instanceId = randomUUID();
  let connectLatencyMs: number | null = null;
  let connectError: string | null = null;
  let close: GatewayProbeClose | null = null;

  return await new Promise<GatewayProbeResult>((resolve) => {
    let settled = false;
    const settle = (result: Omit<GatewayProbeResult, "url">) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      client.stop();
      resolve({ url: opts.url, ...result });
    };

    const client = new GatewayClient({
      url: opts.url,
      token: opts.auth?.token,
      password: opts.auth?.password,
      clientName: GATEWAY_CLIENT_NAMES.CLI,
      clientVersion: "dev",
      mode: GATEWAY_CLIENT_MODES.PROBE,
      instanceId,
      onConnectError: (err) => {
        connectError = formatError(err);
      },
      onClose: (code, reason) => {
        close = { code, reason };
      },
      onHelloOk: async () => {
        connectLatencyMs = Date.now() - startedAt;
        try {
          const [health, status, presence, configSnapshot, kgmStatusRaw] = await Promise.allSettled(
            [
              client.request("health"),
              client.request("status"),
              client.request("system-presence"),
              client.request("config.get", {}),
              client.request("kgm.admin.status", {}).catch(() => null), // best-effort KGM status
            ],
          );
          const kgmStatus =
            kgmStatusRaw.status === "fulfilled" &&
            kgmStatusRaw.value &&
            typeof kgmStatusRaw.value === "object"
              ? {
                  enabled:
                    typeof kgmStatusRaw.value.enabled === "boolean"
                      ? kgmStatusRaw.value.enabled
                      : false,
                  provider:
                    typeof kgmStatusRaw.value.provider === "string"
                      ? kgmStatusRaw.value.provider
                      : undefined,
                  mode:
                    typeof kgmStatusRaw.value.mode === "string"
                      ? kgmStatusRaw.value.mode
                      : undefined,
                  connected:
                    typeof kgmStatusRaw.value.connected === "boolean"
                      ? kgmStatusRaw.value.connected
                      : undefined,
                  error:
                    typeof kgmStatusRaw.value.error === "string"
                      ? kgmStatusRaw.value.error
                      : undefined,
                }
              : null;
          settle({
            ok: true,
            connectLatencyMs,
            error: null,
            close,
            health: health.status === "fulfilled" ? health.value : null,
            status: status.status === "fulfilled" ? status.value : null,
            presence:
              presence.status === "fulfilled" && Array.isArray(presence.value)
                ? (presence.value as SystemPresence[])
                : null,
            configSnapshot: configSnapshot.status === "fulfilled" ? configSnapshot.value : null,
            kgmStatus,
          });
        } catch (err) {
          settle({
            ok: false,
            connectLatencyMs,
            error: formatError(err),
            close,
            health: null,
            status: null,
            presence: null,
            configSnapshot: null,
            kgmStatus: null,
          });
        }
      },
    });

    const timer = setTimeout(
      () => {
        settle({
          ok: false,
          connectLatencyMs,
          error: connectError ? `connect failed: ${connectError}` : "timeout",
          close,
          health: null,
          status: null,
          presence: null,
          configSnapshot: null,
        });
      },
      Math.max(250, opts.timeoutMs),
    );

    client.start();
  });
}
