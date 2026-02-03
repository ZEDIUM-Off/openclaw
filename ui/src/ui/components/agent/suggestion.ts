/**
 * Suggestion / Suggestions — Horizontal row of clickable suggestion chips.
 * Lit port of AI SDK Elements Suggestion; uses daisyUI buttons.
 */

import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("agent-suggestions")
export class AgentSuggestions extends LitElement {
  @property() class = "";

  render() {
    return html`
      <div class="flex flex-wrap gap-2 overflow-x-auto py-2 ${this.class}" role="list">
        <slot></slot>
      </div>
    `;
  }
}

@customElement("agent-suggestion")
export class AgentSuggestion extends LitElement {
  @property() suggestion = "";
  @property() class = "";

  render() {
    return html`
      <button type="button" class="btn btn-sm btn-outline ${this.class}" role="listitem" @click=${this._onClick}>
        ${this.suggestion || html`<slot></slot>`}
      </button>
    `;
  }

  private _onClick = () => {
    this.dispatchEvent(
      new CustomEvent("suggestion-select", { detail: { suggestion: this.suggestion }, bubbles: true, composed: true })
    );
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "agent-suggestions": AgentSuggestions;
    "agent-suggestion": AgentSuggestion;
  }
}
