---
name: context-sync
description: Curate KGM context sets with the context_sync tool.
---

# Context Sync

Use `context_sync` to curate which nodes and messages are included in your KGM context set.

## When to use

- You want to pin specific nodes or messages for future runs.
- You need to remove stale or irrelevant context items.

## Examples

```text
context_sync action:list scope:agent:main
context_sync action:addNode scope:agent:main nodeKey:"session:abc"
context_sync action:addMessage scope:agent:main messageKey:"session:abc#entry:42"
context_sync action:removeNode scope:agent:main nodeKey:"session:old"
context_sync action:materialize scope:agent:main maxNodes:10 maxMessages:5
```

## Notes

- Keep selections small and relevant to avoid bloated prompts.
- Do not add secrets to context sets.
