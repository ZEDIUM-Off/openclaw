/**
 * Toolbar — Container for message or prompt action buttons.
 * Lit port of AI SDK Elements Toolbar; uses daisyUI for layout.
 */

import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("agent-toolbar")
export class AgentToolbar extends LitElement {
  @property() class = "";

  render() {
    return html`
      <div class="flex flex-wrap items-center gap-1 ${this.class}" role="toolbar">
        <slot></slot>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "agent-toolbar": AgentToolbar;
  }
}
