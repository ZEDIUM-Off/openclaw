/**
 * Message — Chat message wrapper with role-based alignment and styling.
 * Lit port of AI SDK Elements Message; uses daisyUI chat bubble.
 * MessageContent / MessageResponse are composition via slots or sub-elements.
 */

import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { toSanitizedMarkdownHtml } from "../../markdown.js";

export type MessageRole = "user" | "assistant" | "system";

@customElement("agent-message")
export class AgentMessage extends LitElement {
  /** Role: user (chat-end), assistant (chat-start), system (centered/muted). */
  @property({ type: String }) from: MessageRole = "assistant";

  @property() class = "";

  render() {
    const isUser = this.from === "user";
    const isSystem = this.from === "system";
    const chatPlacement = isUser ? "chat-end" : "chat-start";
    const bubbleColor = isUser ? "chat-bubble-primary" : "";

    if (isSystem) {
      return html`
        <div class="chat chat-start w-full ${this.class}" role="article" aria-label="System message">
          <div class="chat-bubble chat-bubble-neutral opacity-80 text-sm">
            <slot></slot>
          </div>
        </div>
      `;
    }

    return html`
      <div class="chat ${chatPlacement} w-full ${this.class}" role="article" aria-label="${this.from} message">
        <div class="chat-bubble ${bubbleColor} max-w-[85%] sm:max-w-[75%]">
          <slot></slot>
        </div>
      </div>
    `;
  }
}

@customElement("agent-message-content")
export class AgentMessageContent extends LitElement {
  @property() class = "";

  render() {
    return html`
      <div class="flex flex-col gap-2 text-sm text-base-content ${this.class}">
        <slot></slot>
      </div>
    `;
  }
}

@customElement("agent-message-response")
export class AgentMessageResponse extends LitElement {
  /** Markdown text to render (sanitized via toSanitizedMarkdownHtml). */
  @property() content = "";
  @property() class = "";

  render() {
    if (!this.content.trim()) {
      return html`<slot></slot>`;
    }
    const htmlContent = toSanitizedMarkdownHtml(this.content);
    return html`
      <div class="prose prose-sm max-w-none text-base-content ${this.class}" data-message-response>
        ${unsafeHTML(htmlContent)}
      </div>
    `;
  }
}

@customElement("agent-message-actions")
export class AgentMessageActions extends LitElement {
  @property() class = "";

  render() {
    return html`
      <div class="flex flex-wrap gap-1 mt-2 ${this.class}" role="group" aria-label="Message actions">
        <slot></slot>
      </div>
    `;
  }
}

@customElement("agent-message-action")
export class AgentMessageAction extends LitElement {
  @property() label = "";
  @property() tooltip = "";
  @property() class = "";

  render() {
    const title = this.tooltip || this.label;
    return html`
      <button
        type="button"
        class="btn btn-ghost btn-xs ${this.class}"
        aria-label="${this.label || "Action"}"
        title="${title}"
        @click=${this._onClick}
      >
        <slot></slot>
      </button>
    `;
  }

  private _onClick = () => {
    this.dispatchEvent(new CustomEvent("action", { bubbles: true, composed: true }));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "agent-message": AgentMessage;
    "agent-message-content": AgentMessageContent;
    "agent-message-response": AgentMessageResponse;
    "agent-message-actions": AgentMessageActions;
    "agent-message-action": AgentMessageAction;
  }
}
