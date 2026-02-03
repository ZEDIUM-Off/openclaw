/**
 * PromptInput — Form wrapper for chat input (textarea + submit).
 * Lit port of AI SDK Elements PromptInput; uses daisyUI input/textarea/btn.
 */

import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("agent-prompt-input")
export class AgentPromptInput extends LitElement {
  @property() placeholder = "Say something...";
  @property() disabled = false;
  @property() class = "";
  /** Submit button status: "ready" | "streaming" | "submitted". */
  @property() status: "ready" | "streaming" | "submitted" = "ready";

  @state() private _value = "";

  private _onSubmit = (e: Event) => {
    e.preventDefault();
    const v = this._value.trim();
    if (!v || this.disabled) return;
    this.dispatchEvent(
      new CustomEvent("submit", {
        detail: { text: v },
        bubbles: true,
        composed: true,
      })
    );
    this._value = "";
  };

  private _onInput = (e: Event) => {
    this._value = (e.target as HTMLTextAreaElement).value;
    this.dispatchEvent(
      new CustomEvent("input-change", {
        detail: { value: this._value },
        bubbles: true,
        composed: true,
      })
    );
  };

  render() {
    const canSubmit = this._value.trim().length > 0 && !this.disabled;
    const isStreaming = this.status === "streaming";

    return html`
      <form class="flex flex-col gap-2 ${this.class}" @submit=${this._onSubmit}>
        <div class="relative flex flex-col rounded-lg border border-base-300 bg-base-100">
          <textarea
            class="textarea textarea-ghost w-full min-h-[80px] max-h-[200px] resize-y p-4 pr-12"
            placeholder="${this.placeholder}"
            .value=${this._value}
            ?disabled=${this.disabled}
            @input=${this._onInput}
            rows="2"
          ></textarea>
          <div class="absolute bottom-2 right-2">
            <button
              type="submit"
              class="btn btn-primary btn-sm btn-circle"
              ?disabled=${!canSubmit}
              aria-label="${isStreaming ? "Streaming" : "Send"}"
            >
              ${isStreaming
                ? html`<span class="loading loading-spinner loading-sm"></span>`
                : html`
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      class="w-4 h-4"
                    >
                      <path
                        d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905h13.42a.75.75 0 01.704 1.02l-3 5.25a.75.75 0 01-1.273.09l-3.75-6.75a.75.75 0 00-1.273-.09l-3 5.25a.75.75 0 01-1.273-.09l-3.75-6.75z"
                      />
                    </svg>
                  `}
            </button>
          </div>
        </div>
      </form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "agent-prompt-input": AgentPromptInput;
  }
}
