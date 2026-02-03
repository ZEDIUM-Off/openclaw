import type { RuntimeEnv } from "../runtime.js";
import { callGateway } from "../gateway/call.js";
import { theme } from "../terminal/theme.js";

type KgmStatusResult = {
  ok: boolean;
  enabled?: boolean;
  provider?: string;
};

export async function kgmStatusCommand(runtime: RuntimeEnv, opts?: { json?: boolean }) {
  const result = await callGateway<KgmStatusResult>({
    method: "kgm.admin.status",
    params: {},
    timeoutMs: 10_000,
  });
  if (opts?.json) {
    runtime.log(JSON.stringify(result ?? {}, null, 2));
    return;
  }
  const enabled = result?.enabled ? theme.good("enabled") : theme.muted("disabled");
  const provider = result?.provider ?? "none";
  runtime.log(`KGM: ${enabled} (${provider})`);
}

export async function kgmInitCommand(runtime: RuntimeEnv, opts?: { json?: boolean }) {
  const result = await callGateway<{ ok: boolean }>({
    method: "kgm.admin.init",
    params: {},
    timeoutMs: 30_000,
  });
  if (opts?.json) {
    runtime.log(JSON.stringify(result ?? {}, null, 2));
    return;
  }
  runtime.log(result?.ok ? theme.good("KGM admin schema ready") : theme.warn("KGM init failed"));
}

export async function kgmEnsureAgentCommand(
  runtime: RuntimeEnv,
  opts: { agentId: string; json?: boolean },
) {
  const result = await callGateway<{ ok: boolean; scope?: string }>({
    method: "kgm.admin.ensureAgent",
    params: { agentId: opts.agentId },
    timeoutMs: 30_000,
  });
  if (opts?.json) {
    runtime.log(JSON.stringify(result ?? {}, null, 2));
    return;
  }
  const scope = result?.scope ? ` (${result.scope})` : "";
  runtime.log(
    result?.ok ? theme.good(`KGM agent schema ready${scope}`) : theme.warn("KGM ensure failed"),
  );
}
