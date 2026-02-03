/**
 * Tool — Collapsible tool invocation display (header + content with input/output).
 * Lit port of AI SDK Elements Tool; uses daisyUI collapse/badge.
 */

import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export type ToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

function stateLabel(s: ToolState): string {
  const map: Record<ToolState, string> = {
    "input-streaming": "Pending",
    "input-available": "Running",
    "approval-requested": "Awaiting Approval",
    "approval-responded": "Responded",
    "output-available": "Completed",
    "output-error": "Error",
    "output-denied": "Denied",
  };
  return map[s] ?? s;
}

@customElement("agent-tool")
export class AgentTool extends LitElement {
  @property({ type: Boolean }) defaultOpen = false;
  @property() class = "";

  @state() private _open: boolean = this.defaultOpen;

  render() {
    return html`
      <div class="collapse collapse-arrow bg-base-200 border border-base-300 rounded-lg ${this.class}">
        <input type="checkbox" ?checked=${this._open} @change=${() => (this._open = !this._open)} />
        <div class="collapse-title min-h-0 py-2">
          <slot name="header"></slot>
        </div>
        <div class="collapse-content">
          <slot></slot>
        </div>
      </div>
    `;
  }
}

@customElement("agent-tool-header")
export class AgentToolHeader extends LitElement {
  @property() type = "";
  @property() toolName = "";
  @property() state: ToolState = "input-streaming";
  @property() title = "";
  @property() class = "";

  render() {
    const label = stateLabel(this.state);
    const badgeClass =
      this.state === "output-error" || this.state === "output-denied"
        ? "badge-error"
        : this.state === "output-available"
          ? "badge-success"
          : "badge-ghost";
    return html`
      <div class="flex items-center gap-2 w-full ${this.class}">
        <span class="font-mono text-sm truncate">${this.toolName || this.type || this.title}</span>
        <span class="badge badge-sm ${badgeClass}">${label}</span>
      </div>
    `;
  }
}

@customElement("agent-tool-content")
export class AgentToolContent extends LitElement {
  @property() class = "";

  render() {
    return html`<div class="flex flex-col gap-2 ${this.class}"><slot></slot></div>`;
  }
}

@customElement("agent-tool-input")
export class AgentToolInput extends LitElement {
  /** JSON-serializable input (will be shown as formatted JSON). */
  @property() input: unknown = undefined;
  @property() class = "";

  render() {
    if (this.input === undefined) return nothing;
    const str = typeof this.input === "string" ? this.input : JSON.stringify(this.input, null, 2);
    return html`
      <div class="${this.class}">
        <div class="text-xs font-semibold text-base-content/70 mb-1">Parameters</div>
        <pre class="bg-base-300 p-2 rounded text-xs overflow-auto font-mono">${str}</pre>
      </div>
    `;
  }
}

@customElement("agent-tool-output")
export class AgentToolOutput extends LitElement {
  @property() errorText = "";
  @property() class = "";

  render() {
    if (this.errorText) {
      return html`
        <div class="text-error text-sm ${this.class}">${this.errorText}</div>
      `;
    }
    return html`<div class="${this.class}"><slot></slot></div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "agent-tool": AgentTool;
    "agent-tool-header": AgentToolHeader;
    "agent-tool-content": AgentToolContent;
    "agent-tool-input": AgentToolInput;
    "agent-tool-output": AgentToolOutput;
  }
}
