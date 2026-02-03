/**
 * Sessions sidebar for chat layout: list of sessions grouped by agent,
 * "New chat" button, and shortcuts to Control, Agent, Settings.
 * Uses daisyUI menu/list; sub-sessions shown under parent when applicable.
 */

import { html } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { GatewaySessionRow, SessionsListResult } from "../types";
import { pathForTab, type Tab } from "../navigation";
import { parseAgentSessionKey, resolveThreadParentSessionKey } from "../../../../src/routing/session-key.js";

export type SessionsSidebarProps = {
  currentSessionKey: string;
  sessionsResult: SessionsListResult | null;
  basePath: string;
  connected: boolean;
  onSelectSession: (key: string) => void;
  onNewChat: () => void;
};

type GroupedSession = {
  key: string;
  row?: GatewaySessionRow;
  isSub: boolean;
  parentKey?: string;
};

function groupSessionsByAgent(
  currentSessionKey: string,
  sessions: GatewaySessionRow[] | undefined,
): Map<string, GroupedSession[]> {
  const byAgent = new Map<string, GroupedSession[]>();
  const seen = new Set<string>();

  function ensureAgent(agentId: string) {
    if (!byAgent.has(agentId)) byAgent.set(agentId, []);
  }

  function addSession(key: string, row?: GatewaySessionRow) {
    if (seen.has(key)) return;
    seen.add(key);
    const parsed = parseAgentSessionKey(key);
    const agentId = parsed?.agentId ?? "main";
    ensureAgent(agentId);
    const parentKey = resolveThreadParentSessionKey(key) ?? undefined;
    const isSub = Boolean(parentKey && (key === currentSessionKey || sessions?.some((s) => s.key === key)));
    byAgent.get(agentId)!.push({ key, row, isSub, parentKey });
  }

  addSession(currentSessionKey);

  if (sessions) {
    for (const row of sessions) {
      addSession(row.key, row);
    }
  }

  // Sort: parents first, then children under parent
  for (const [agentId, list] of byAgent) {
    const withParent = list.map((s) => ({
      ...s,
      parentKey: resolveThreadParentSessionKey(s.key) ?? undefined,
    }));
    const parentKeys = new Set(withParent.map((s) => s.key));
    const parents = withParent.filter((s) => !s.parentKey || !parentKeys.has(s.parentKey));
    const children = withParent.filter((s) => s.parentKey && parentKeys.has(s.parentKey));
    const sorted: GroupedSession[] = [];
    for (const p of parents) {
      sorted.push({ ...p, isSub: false });
      const kids = children.filter((c) => c.parentKey === p.key);
      for (const k of kids) {
        sorted.push({ ...k, isSub: true });
      }
    }
    byAgent.set(agentId, sorted);
  }

  return byAgent;
}

export function renderSessionsSidebar(props: SessionsSidebarProps) {
  const sessions = props.sessionsResult?.sessions ?? [];
  const grouped = groupSessionsByAgent(props.currentSessionKey, sessions);
  const agentIds = Array.from(grouped.keys()).sort();

  return html`
    <aside class="nav flex flex-col w-64 min-w-64 bg-base-200 border-r border-base-300" aria-label="Sessions" style="grid-area: nav;">
      <div class="p-2 border-b border-base-300">
        <button
          type="button"
          class="btn btn-primary btn-sm w-full"
          ?disabled=${!props.connected}
          @click=${props.onNewChat}
        >
          New chat
        </button>
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        <ul class="menu menu-sm bg-base-200 gap-1">
          ${agentIds.map(
            (agentId) => html`
              <li class="menu-title text-xs opacity-80 pt-2">${agentId}</li>
              ${repeat(
                grouped.get(agentId)!,
                (s) => s.key,
                (s) => html`
                  <li class="${s.isSub ? "pl-4" : ""}">
                    <button
                      type="button"
                      class="${props.currentSessionKey === s.key ? "active" : ""}"
                      @click=${() => props.onSelectSession(s.key)}
                    >
                      ${s.row?.label?.trim() || s.row?.displayName?.trim() || s.key}
                    </button>
                  </li>
                `,
              )}
            `,
          )}
        </ul>
      </div>
      <div class="p-2 border-t border-base-300 flex flex-col gap-1">
        <a href="${pathForTab("overview", props.basePath)}" class="link link-hover text-sm">Control</a>
        <a href="${pathForTab("skills", props.basePath)}" class="link link-hover text-sm">Agent</a>
        <a href="${pathForTab("config", props.basePath)}" class="link link-hover text-sm">Settings</a>
      </div>
    </aside>
  `;
}
