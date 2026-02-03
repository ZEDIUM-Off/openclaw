/**
 * Shimmer — Skeleton / loading placeholder for streaming content.
 * Lit port of AI SDK Elements Shimmer; uses daisyUI skeleton.
 */

import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("agent-shimmer")
export class AgentShimmer extends LitElement {
  @property() class = "";
  /** Number of skeleton lines to show. */
  @property({ type: Number }) lines = 3;

  render() {
    return html`
      <div class="flex flex-col gap-2 ${this.class}" aria-hidden="true">
        ${Array.from({ length: this.lines }, (_, i) => {
          const w = i === this.lines - 1 && this.lines > 1 ? "w-2/3" : "w-full";
          return html` <div class="skeleton h-4 ${w} rounded"></div> `;
        })}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "agent-shimmer": AgentShimmer;
  }
}
