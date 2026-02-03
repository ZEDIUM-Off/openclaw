# Agent UI Components (Lit + daisyUI)

Lit-based port of [AI SDK Elements](https://ai-sdk.dev/elements) for OpenClaw. Uses [daisyUI](https://daisyui.com/components/) and Tailwind CSS.

## Components

### Conversation

- **`<agent-conversation>`** — Scrollable container for messages; shows "Scroll to bottom" when not at bottom.
  - Slot: message list.
- **`<agent-conversation-empty>`** — Empty state when no messages.
  - Props: `title`, `description`.

### Message

- **`<agent-message>`** — Wrapper for one message. Props: `from` (`"user"` | `"assistant"` | `"system"`), `class`.
  - Uses daisyUI `chat`, `chat-start`/`chat-end`, `chat-bubble`, `chat-bubble-primary` for user.
- **`<agent-message-content>`** — Content wrapper (slot).
- **`<agent-message-response>`** — Renders markdown from `content` prop (sanitized via app markdown).
- **`<agent-message-actions>`** — Container for action buttons (slot).
- **`<agent-message-action>`** — Button. Props: `label`, `tooltip`, `class`. Fires `action` event on click. Slot: icon or text.

### PromptInput

- **`<agent-prompt-input>`** — Form with textarea + submit button.
  - Props: `placeholder`, `disabled`, `status` (`"ready"` | `"streaming"` | `"submitted"`), `class`.
  - Events: `submit` (detail: `{ text }`), `input-change` (detail: `{ value }`).

### Loader

- **`<agent-loader>`** — Spinner. Props: `size` (number, default 24). Uses daisyUI `loading loading-spinner`.

### CodeBlock

- **`<agent-code-block>`** — Code block with optional filename and copy button.
  - Props: `code`, `language`, `filename`, `showLineNumbers`, `class`.
  - Events: `copy`, `copy-error`. No syntax highlighting in minimal version (use app markdown/code for that).

### Shimmer

- **`<agent-shimmer>`** — Skeleton placeholder. Props: `lines` (number), `class`.

### Artifact

- **`<agent-artifact>`** — Container for generated content (code, docs). Slot: header + content.
- **`<agent-artifact-header>`** — Header row (slot: title + description + actions).
- **`<agent-artifact-title>`** — Title (slot).
- **`<agent-artifact-description>`** — Description (slot).
- **`<agent-artifact-actions>`** — Action buttons container (slot).
- **`<agent-artifact-action>`** — Action button. Props: `label`, `tooltip`, `class`. Fires `action` on click. Slot: icon.
- **`<agent-artifact-close>`** — Close button. Fires `close` on click. Slot: icon.
- **`<agent-artifact-content>`** — Content area (slot).

### Suggestion

- **`<agent-suggestions>`** — Horizontal row of suggestions (slot: suggestion items).
- **`<agent-suggestion>`** — One suggestion chip. Props: `suggestion` (string). Fires `suggestion-select` (detail: `{ suggestion }`) on click. Slot: optional custom content.

### Tool

- **`<agent-tool>`** — Collapsible tool block. Slot name `header` for header, default slot for content. Uses daisyUI collapse.
- **`<agent-tool-header>`** — Header with type/state badge. Props: `type`, `toolName`, `state` (ToolState), `title`, `class`.
- **`<agent-tool-content>`** — Content wrapper (slot).
- **`<agent-tool-input>`** — Displays tool input as JSON. Prop: `input` (unknown).
- **`<agent-tool-output>`** — Output area. Prop: `errorText` (shows error) or slot for content.

**ToolState**: `input-streaming` | `input-available` | `approval-requested` | `approval-responded` | `output-available` | `output-error` | `output-denied`.

### Task

- **`<agent-task>`** — Collapsible task. Slot name `trigger` for trigger, default slot for content. Props: `defaultOpen`, `class`.
- **`<agent-task-trigger>`** — Trigger row. Prop: `title`, `class`.
- **`<agent-task-content>`** — Content (slot).
- **`<agent-task-item>`** — One task item (slot).
- **`<agent-task-item-file>`** — File reference in task item (slot).

### Toolbar

- **`<agent-toolbar>`** — Container for action buttons (slot). Role `toolbar`.

## Usage example

```html
<agent-conversation>
  <agent-conversation-empty title="Start a conversation" description="Type below."></agent-conversation-empty>
  <agent-message from="user">
    <agent-message-content>
      <agent-message-response content="Hello!"></agent-message-response>
    </agent-message-content>
  </agent-message>
  <agent-message from="assistant">
    <agent-message-content>
      <agent-message-response content="Hi there."></agent-message-response>
    </agent-message-content>
    <agent-message-actions>
      <agent-message-action label="Copy" @action=${handleCopy}></agent-message-action>
    </agent-message-actions>
  </agent-message>
  <agent-loader size="24"></agent-loader>
</agent-conversation>
<agent-prompt-input placeholder="Say something..." status="ready" @submit=${onSubmit}></agent-prompt-input>
```

## Conversion notes (React/shadcn → Lit/daisyUI)

- **Children** — React `children` become Lit `<slot>` or props (e.g. `content` on MessageResponse).
- **Context/hooks** — No `useChat`; parent passes props and listens to events (`submit`, `action`, `copy`, `suggestion-select`, `close`).
- **shadcn → daisyUI** — Button → `btn`, Select → `select`/dropdown, Collapsible → daisyUI `collapse collapse-arrow`, Badge → `badge`, ScrollArea → flex + overflow-x-auto.
- **MessageResponse** — AI Elements use Streamdown; here we use app `toSanitizedMarkdownHtml` (marked + DOMPurify).
- **CodeBlock** — AI Elements use Shiki; here minimal version is pre/code + copy; syntax highlighting can be added via app markdown or Prism/Shiki later.
- **Artifact** — React subcomponents (ArtifactHeader, ArtifactTitle, etc.) become separate Lit elements; no LucideIcon prop — use slot for icon.
- **Suggestion** — `onClick(suggestion)` becomes `suggestion-select` event with `detail.suggestion`.
- **Tool** — ToolUIPart types from AI SDK are not used; we use generic `state: ToolState` and `input: unknown`; output is slot or errorText.
- **Task** — Collapsible structure same as Tool; TaskItemFile is a simple wrapper (slot for icon + name).
- **Accessibility** — ARIA labels and roles kept where applicable (toolbar, list, listitem, region).

## Remaining AI SDK Elements (same conversion pattern)

The following components can be added using the same approach: fetch the doc at `https://ai-sdk.dev/elements/components/<name>`, create a Lit file in this folder with slots/props/events, map shadcn to daisyUI, document props and conversion difficulties here.

- **Chatbot**: chain-of-thought, checkpoint, confirmation, connection, context, open-in-chat, reasoning.
- **Code/Utilities**: image, inline-citation, sources, web-preview.
- **Voice**: audio-player, mic-selector, model-selector, speech-input, transcription, voice-selector.
- **Workflow**: canvas, controls, edge, node, panel, persona, plan, queue.
