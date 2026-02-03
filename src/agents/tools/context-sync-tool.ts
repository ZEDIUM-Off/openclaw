import { Type } from "@sinclair/typebox";
import { callGateway } from "../../gateway/call.js";
import { stringEnum } from "../schema/typebox.js";
import { jsonResult, readNumberParam, readStringParam, type AnyAgentTool } from "./common.js";

const CONTEXT_SYNC_ACTIONS = [
  "list",
  "addNode",
  "removeNode",
  "addMessage",
  "removeMessage",
  "materialize",
] as const;

const ContextSyncToolSchema = Type.Object({
  action: stringEnum(CONTEXT_SYNC_ACTIONS),
  scope: Type.Optional(Type.String()),
  nodeKey: Type.Optional(Type.String()),
  nodeKeys: Type.Optional(Type.Array(Type.String())),
  messageKey: Type.Optional(Type.String()),
  messageKeys: Type.Optional(Type.Array(Type.String())),
  maxNodes: Type.Optional(Type.Number({ minimum: 1 })),
  maxMessages: Type.Optional(Type.Number({ minimum: 1 })),
});

function readKeyList(params: Record<string, unknown>, listKey: string, itemKey: string) {
  const values = Array.isArray(params[listKey])
    ? (params[listKey] as unknown[])
        .filter((entry) => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
  const single = readStringParam(params, itemKey);
  if (single) {
    values.push(single);
  }
  return Array.from(new Set(values));
}

export function createContextSyncTool(opts?: { agentSessionKey?: string }): AnyAgentTool {
  const sessionKey =
    typeof opts?.agentSessionKey === "string" && opts.agentSessionKey.trim()
      ? opts.agentSessionKey.trim()
      : undefined;
  return {
    label: "Context Sync",
    name: "context_sync",
    description: "Curate KGM context set (nodes/messages) via the gateway.",
    parameters: ContextSyncToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const scope = readStringParam(params, "scope");

      switch (action) {
        case "list": {
          const result = await callGateway({
            method: "kgm.agent.context.get",
            params: { scope, ...(sessionKey ? { sessionKey } : {}) },
          });
          return jsonResult(result);
        }
        case "addNode": {
          const keys = readKeyList(params, "nodeKeys", "nodeKey");
          if (keys.length === 0) {
            return jsonResult({ status: "error", error: "nodeKey required" });
          }
          const result = await callGateway({
            method: "kgm.agent.context.patch",
            params: { scope, addNodes: keys, ...(sessionKey ? { sessionKey } : {}) },
          });
          return jsonResult(result);
        }
        case "removeNode": {
          const keys = readKeyList(params, "nodeKeys", "nodeKey");
          if (keys.length === 0) {
            return jsonResult({ status: "error", error: "nodeKey required" });
          }
          const result = await callGateway({
            method: "kgm.agent.context.patch",
            params: { scope, removeNodes: keys, ...(sessionKey ? { sessionKey } : {}) },
          });
          return jsonResult(result);
        }
        case "addMessage": {
          const keys = readKeyList(params, "messageKeys", "messageKey");
          if (keys.length === 0) {
            return jsonResult({ status: "error", error: "messageKey required" });
          }
          const result = await callGateway({
            method: "kgm.agent.context.patch",
            params: { scope, addMessages: keys, ...(sessionKey ? { sessionKey } : {}) },
          });
          return jsonResult(result);
        }
        case "removeMessage": {
          const keys = readKeyList(params, "messageKeys", "messageKey");
          if (keys.length === 0) {
            return jsonResult({ status: "error", error: "messageKey required" });
          }
          const result = await callGateway({
            method: "kgm.agent.context.patch",
            params: { scope, removeMessages: keys, ...(sessionKey ? { sessionKey } : {}) },
          });
          return jsonResult(result);
        }
        case "materialize": {
          const maxNodes = readNumberParam(params, "maxNodes", { integer: true });
          const maxMessages = readNumberParam(params, "maxMessages", { integer: true });
          const result = await callGateway({
            method: "kgm.agent.context.materialize",
            params: { scope, maxNodes, maxMessages, ...(sessionKey ? { sessionKey } : {}) },
          });
          return jsonResult(result);
        }
        default:
          return jsonResult({ status: "error", error: `Unknown action: ${action}` });
      }
    },
  };
}
