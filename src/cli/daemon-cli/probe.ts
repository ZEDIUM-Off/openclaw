import { probeGateway } from "../../gateway/probe.js";
import { withProgress } from "../progress.js";

export async function probeGatewayStatus(opts: {
  url: string;
  token?: string;
  password?: string;
  timeoutMs: number;
  json?: boolean;
  configPath?: string;
}) {
  try {
    const result = await withProgress(
      {
        label: "Checking gateway status...",
        indeterminate: true,
        enabled: opts.json !== true,
      },
      async () =>
        await probeGateway({
          url: opts.url,
          auth: {
            token: opts.token,
            password: opts.password,
          },
          timeoutMs: opts.timeoutMs,
        }),
    );

    return {
      ok: result.ok,
      error: result.error ?? undefined,
      kgm: result.kgmStatus,
    } as const;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      kgm: null,
    } as const;
  }
}
