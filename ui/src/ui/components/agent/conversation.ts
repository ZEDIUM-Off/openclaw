/**
 * Conversation — Wraps messages with auto-scroll and optional scroll-to-bottom button.
 * Lit port of AI SDK Elements Conversation (React/shadcn).
 * Uses daisyUI for layout; no shadow DOM so global Tailwind/daisyUI applies.
 */

import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ref } from "lit/directives/ref.js";

@customElement("agent-conversation")
export class AgentConversation extends LitElement {
  @property() class = "";

  private _contentRef: HTMLElement | null = null;
  @state() private _showScrollButton = false;
  @state() private _atBottom = true;

  private _scrollCheck = () => {
    const el = this._contentRef;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const atBottom = scrollHeight - scrollTop - clientHeight < 80;
    if (this._atBottom !== atBottom) {
      this._atBottom = atBottom;
      this._showScrollButton = !atBottom;
    }
  };

  private _scrollToBottom = () => {
    this._contentRef?.scrollTo({ top: this._contentRef.scrollHeight, behavior: "smooth" });
  };

  render() {
    return html`
      <div class="flex flex-col h-full min-h-0 ${this.class}" role="region" aria-label="Conversation">
        <div
          ${ref((el: unknown) => {
            this._contentRef = (el as HTMLElement) ?? null;
          })}
          class="flex-1 overflow-y-auto overflow-x-hidden p-4 flex flex-col gap-4"
          @scroll=${this._scrollCheck}
        >
          <slot></slot>
        </div>
        ${this._showScrollButton
          ? html`
              <div class="flex justify-center p-2">
                <button
                  type="button"
                  class="btn btn-sm btn-ghost"
                  aria-label="Scroll to bottom"
                  @click=${this._scrollToBottom}
                >
                  Scroll to bottom
                </button>
              </div>
            `
          : nothing}
      </div>
    `;
  }
}

@customElement("agent-conversation-empty")
export class AgentConversationEmpty extends LitElement {
  @property() title = "Start a conversation";
  @property() description = "Type a message below to begin.";

  render() {
    return html`
      <div class="flex flex-col items-center justify-center flex-1 gap-4 text-base-content/70">
        <div class="text-5xl opacity-50" aria-hidden="true">💬</div>
        <h2 class="text-lg font-semibold text-base-content">${this.title}</h2>
        <p class="text-sm">${this.description}</p>
        <slot></slot>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "agent-conversation": AgentConversation;
    "agent-conversation-empty": AgentConversationEmpty;
  }
}
