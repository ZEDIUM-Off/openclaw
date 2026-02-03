---
name: kgm-agent
description: Query and update Knowledge Graph Memory (KGM) via the kgm tool.
---

# KGM Agent

Use the `kgm` tool to query and update the Knowledge Graph Memory via the gateway.

## When to use

- You need to search or retrieve nodes by key.
- You need to add or link nodes in your allowed scope.
- You want to pin or touch nodes to affect decay.

## Examples

```text
kgm action:search scope:agent:main query:"session context" limit:5
kgm action:get scope:agent:main key:"session:abc"
kgm action:putNode scope:agent:main key:"session:abc" label:"Session" properties:{"purpose":"triage"}
kgm action:link scope:agent:main fromKey:"session:abc" fromLabel:"Session" toKey:"message:1" toLabel:"Message" type:"HAS_MESSAGE"
kgm action:pin scope:agent:main key:"session:abc" pinned:true
```

## Notes

- Always stay within your allowed scope.
- Use `kgm action:describeSchema` if unsure about labels or edge types.
