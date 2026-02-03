import { Type } from "@sinclair/typebox";
import { stringEnum } from "../../agents/schema/typebox.js";
import { jsonResult, readStringParam, type AnyAgentTool } from "../../agents/tools/common.js";
import { callGateway } from "../../gateway/call.js";

const KGM_ACTIONS = [
  "search",
  "get",
  "putNode",
  "putEdge",
  "link",
  "pin",
  "touch",
  "gc",
  "ensureSchema",
  "describeSchema",
] as const;

const KgmToolSchema = Type.Object({
  action: stringEnum(KGM_ACTIONS),
  scope: Type.Optional(Type.String()),
  query: Type.Optional(Type.String()),
  key: Type.Optional(Type.String()),
  label: Type.Optional(Type.String()),
  fromKey: Type.Optional(Type.String()),
  fromLabel: Type.Optional(Type.String()),
  toKey: Type.Optional(Type.String()),
  toLabel: Type.Optional(Type.String()),
  type: Type.Optional(Type.String()),
  properties: Type.Optional(Type.Object({}, { additionalProperties: true })),
  keys: Type.Optional(Type.Array(Type.String())),
  limit: Type.Optional(Type.Number({ minimum: 1 })),
  minWeight: Type.Optional(Type.Number({ minimum: 0 })),
  maxNodes: Type.Optional(Type.Number({ minimum: 1 })),
  pinned: Type.Optional(Type.Boolean()),
});

export function createKgmTool(opts?: { agentSessionKey?: string }): AnyAgentTool {
  const sessionKey =
    typeof opts?.agentSessionKey === "string" && opts.agentSessionKey.trim()
      ? opts.agentSessionKey.trim()
      : undefined;
  return {
    label: "KGM",
    name: "kgm",
    description: "Query and update Knowledge Graph Memory via the gateway.",
    parameters: KgmToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const scope = readStringParam(params, "scope");

      switch (action) {
        case "search": {
          const query = readStringParam(params, "query", { required: true });
          const result = await callGateway({
            method: "kgm.agent.search",
            params: { query, scope, limit: params.limit, ...(sessionKey ? { sessionKey } : {}) },
          });
          return jsonResult(result);
        }
        case "get": {
          const key = readStringParam(params, "key", { required: true });
          const result = await callGateway({
            method: "kgm.agent.get",
            params: { key, scope, ...(sessionKey ? { sessionKey } : {}) },
          });
          return jsonResult(result);
        }
        case "putNode": {
          const key = readStringParam(params, "key", { required: true });
          const label = readStringParam(params, "label", { required: true });
          const result = await callGateway({
            method: "kgm.agent.putNode",
            params: {
              key,
              label,
              scope,
              properties: params.properties,
              ...(sessionKey ? { sessionKey } : {}),
            },
          });
          return jsonResult(result);
        }
        case "putEdge": {
          const fromKey = readStringParam(params, "fromKey", { required: true });
          const fromLabel = readStringParam(params, "fromLabel", { required: true });
          const toKey = readStringParam(params, "toKey", { required: true });
          const toLabel = readStringParam(params, "toLabel", { required: true });
          const type = readStringParam(params, "type", { required: true });
          const result = await callGateway({
            method: "kgm.agent.putEdge",
            params: {
              fromKey,
              fromLabel,
              toKey,
              toLabel,
              type,
              scope,
              properties: params.properties,
              ...(sessionKey ? { sessionKey } : {}),
            },
          });
          return jsonResult(result);
        }
        case "link": {
          const fromKey = readStringParam(params, "fromKey", { required: true });
          const fromLabel = readStringParam(params, "fromLabel", { required: true });
          const toKey = readStringParam(params, "toKey", { required: true });
          const toLabel = readStringParam(params, "toLabel", { required: true });
          const type = readStringParam(params, "type", { required: true });
          const result = await callGateway({
            method: "kgm.agent.link",
            params: {
              fromKey,
              fromLabel,
              toKey,
              toLabel,
              type,
              scope,
              properties: params.properties,
              ...(sessionKey ? { sessionKey } : {}),
            },
          });
          return jsonResult(result);
        }
        case "pin": {
          const key = readStringParam(params, "key", { required: true });
          const result = await callGateway({
            method: "kgm.agent.pin",
            params: { key, scope, pinned: params.pinned, ...(sessionKey ? { sessionKey } : {}) },
          });
          return jsonResult(result);
        }
        case "touch": {
          const keys = Array.isArray(params.keys) ? params.keys : [];
          const result = await callGateway({
            method: "kgm.agent.touch",
            params: { keys, scope, ...(sessionKey ? { sessionKey } : {}) },
          });
          return jsonResult(result);
        }
        case "gc": {
          const result = await callGateway({
            method: "kgm.agent.gc",
            params: {
              scope,
              minWeight: params.minWeight,
              maxNodes: params.maxNodes,
              ...(sessionKey ? { sessionKey } : {}),
            },
          });
          return jsonResult(result);
        }
        case "ensureSchema": {
          const result = await callGateway({
            method: "kgm.agent.ensureSchema",
            params: { scope, ...(sessionKey ? { sessionKey } : {}) },
          });
          return jsonResult(result);
        }
        case "describeSchema": {
          const result = await callGateway({
            method: "kgm.schema.describe",
            params: { scope, ...(sessionKey ? { sessionKey } : {}) },
          });
          return jsonResult(result);
        }
        default:
          return jsonResult({ status: "error", error: `Unknown action: ${action}` });
      }
    },
  };
}
