/**
 * Task — Collapsible task list for workflow progress (trigger + content, items).
 * Lit port of AI SDK Elements Task; uses daisyUI collapse.
 */

import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("agent-task")
export class AgentTask extends LitElement {
  @property({ type: Boolean }) defaultOpen = false;
  @property() class = "";

  @state() private _open: boolean = this.defaultOpen;

  render() {
    return html`
      <div class="collapse collapse-arrow bg-base-200 border border-base-300 rounded-lg ${this.class}">
        <input type="checkbox" ?checked=${this._open} @change=${() => (this._open = !this._open)} />
        <div class="collapse-title min-h-0 py-2">
          <slot name="trigger"></slot>
        </div>
        <div class="collapse-content">
          <slot></slot>
        </div>
      </div>
    `;
  }
}

@customElement("agent-task-trigger")
export class AgentTaskTrigger extends LitElement {
  @property() title = "";
  @property() class = "";

  render() {
    return html`
      <div class="font-medium text-base-content ${this.class}" slot="trigger">${this.title}</div>
    `;
  }
}

@customElement("agent-task-content")
export class AgentTaskContent extends LitElement {
  @property() class = "";

  render() {
    return html`<div class="flex flex-col gap-1 ${this.class}"><slot></slot></div>`;
  }
}

@customElement("agent-task-item")
export class AgentTaskItem extends LitElement {
  @property() class = "";

  render() {
    return html`<div class="text-sm text-base-content ${this.class}"><slot></slot></div>`;
  }
}

@customElement("agent-task-item-file")
export class AgentTaskItemFile extends LitElement {
  @property() class = "";

  render() {
    return html`<span class="inline-flex items-center gap-1 ${this.class}"><slot></slot></span>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "agent-task": AgentTask;
    "agent-task-trigger": AgentTaskTrigger;
    "agent-task-content": AgentTaskContent;
    "agent-task-item": AgentTaskItem;
    "agent-task-item-file": AgentTaskItemFile;
  }
}
