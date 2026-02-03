/**
 * Artifact — Container for generated content (code, docs) with header and actions.
 * Lit port of AI SDK Elements Artifact; uses daisyUI card/buttons.
 */

import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("agent-artifact")
export class AgentArtifact extends LitElement {
  @property() class = "";

  render() {
    return html`
      <div class="card bg-base-200 shadow-sm border border-base-300 overflow-hidden ${this.class}" role="region" aria-label="Artifact">
        <slot></slot>
      </div>
    `;
  }
}

@customElement("agent-artifact-header")
export class AgentArtifactHeader extends LitElement {
  @property() class = "";

  render() {
    return html`
      <div class="card-body py-3 px-4 flex flex-row items-center justify-between gap-2 border-b border-base-300 ${this.class}">
        <slot></slot>
      </div>
    `;
  }
}

@customElement("agent-artifact-title")
export class AgentArtifactTitle extends LitElement {
  @property() class = "";

  render() {
    return html`<p class="font-semibold text-base-content m-0 ${this.class}"><slot></slot></p>`;
  }
}

@customElement("agent-artifact-description")
export class AgentArtifactDescription extends LitElement {
  @property() class = "";

  render() {
    return html`<p class="text-sm text-base-content/70 m-0 ${this.class}"><slot></slot></p>`;
  }
}

@customElement("agent-artifact-actions")
export class AgentArtifactActions extends LitElement {
  @property() class = "";

  render() {
    return html`<div class="flex flex-wrap gap-1 ${this.class}" role="group"><slot></slot></div>`;
  }
}

@customElement("agent-artifact-action")
export class AgentArtifactAction extends LitElement {
  @property() label = "";
  @property() tooltip = "";
  @property() class = "";

  render() {
    const title = this.tooltip || this.label;
    return html`
      <button type="button" class="btn btn-ghost btn-sm ${this.class}" aria-label="${this.label || "Action"}" title="${title}" @click=${this._onClick}>
        <slot></slot>
      </button>
    `;
  }

  private _onClick = () => {
    this.dispatchEvent(new CustomEvent("action", { bubbles: true, composed: true }));
  };
}

@customElement("agent-artifact-close")
export class AgentArtifactClose extends LitElement {
  @property() class = "";

  render() {
    return html`
      <button type="button" class="btn btn-ghost btn-sm btn-square ${this.class}" aria-label="Close" @click=${this._onClick}>
        <slot></slot>
      </button>
    `;
  }

  private _onClick = () => {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  };
}

@customElement("agent-artifact-content")
export class AgentArtifactContent extends LitElement {
  @property() class = "";

  render() {
    return html`<div class="p-4 overflow-auto ${this.class}"><slot></slot></div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "agent-artifact": AgentArtifact;
    "agent-artifact-header": AgentArtifactHeader;
    "agent-artifact-title": AgentArtifactTitle;
    "agent-artifact-description": AgentArtifactDescription;
    "agent-artifact-actions": AgentArtifactActions;
    "agent-artifact-action": AgentArtifactAction;
    "agent-artifact-close": AgentArtifactClose;
    "agent-artifact-content": AgentArtifactContent;
  }
}
