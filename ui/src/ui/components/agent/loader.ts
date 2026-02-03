/**
 * Loader — Spinning loader for loading/streaming states.
 * Lit port of AI SDK Elements Loader; uses daisyUI loading component.
 */

import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("agent-loader")
export class AgentLoader extends LitElement {
  /** Size in pixels (e.g. 24). daisyUI loading has loading-sm, loading-md, loading-lg. */
  @property({ type: Number }) size = 24;

  render() {
    const sizeClass =
      this.size <= 16 ? "loading-sm" : this.size <= 24 ? "loading-md" : "loading-lg";
    return html`
      <div class="flex items-center justify-center p-4" role="status" aria-label="Loading">
        <span class="loading loading-spinner ${sizeClass} text-primary"></span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "agent-loader": AgentLoader;
  }
}
