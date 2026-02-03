/**
 * CodeBlock — Code block with optional filename and copy button.
 * Lit port of AI SDK Elements CodeBlock; uses daisyUI mockup-code + btn.
 * No Shiki/Prism in this minimal version; use pre/code with syntax classes if needed.
 */

import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("agent-code-block")
export class AgentCodeBlock extends LitElement {
  @property() code = "";
  @property() language = "text";
  @property() filename = "";
  @property({ type: Boolean }) showLineNumbers = false;
  @property() class = "";

  @state() private _copied = false;

  private _copy = async () => {
    if (!this.code) return;
    try {
      await navigator.clipboard.writeText(this.code);
      this._copied = true;
      this.dispatchEvent(new CustomEvent("copy", { bubbles: true, composed: true }));
      setTimeout(() => (this._copied = false), 2000);
    } catch (e) {
      this.dispatchEvent(
        new CustomEvent("copy-error", { detail: e, bubbles: true, composed: true })
      );
    }
  };

  render() {
    const lines = this.code ? this.code.split("\n") : [];
    return html`
      <figure class="mockup-code rounded-lg bg-base-300 text-base-content ${this.class}">
        ${this.filename
          ? html`
              <div class="flex items-center justify-between px-4 py-2 border-b border-base-content/10">
                <span class="font-mono text-sm">${this.filename}</span>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs"
                  aria-label="Copy code"
                  @click=${this._copy}
                >
                  ${this._copied ? "Copied!" : "Copy"}
                </button>
              </div>
            `
          : html`
              <div class="absolute right-2 top-2">
                <button
                  type="button"
                  class="btn btn-ghost btn-xs"
                  aria-label="Copy code"
                  @click=${this._copy}
                >
                  ${this._copied ? "Copied!" : "Copy"}
                </button>
              </div>
            `}
        <pre class="p-4 overflow-x-auto" data-prefix="${this.showLineNumbers ? "1" : ""}"><code>${this
          .code}</code></pre>
      </figure>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "agent-code-block": AgentCodeBlock;
  }
}
