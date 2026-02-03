---
name: kgm-admin
description: Administer Knowledge Graph Memory (KGM) schemas and scopes.
---

# KGM Admin

Use this skill for operator actions like initializing KGM schemas and ensuring agent scopes.

## When to use

- You need to initialize or repair the KGM schema.
- You are onboarding a new agent scope.
- You need to inspect the schema for a scope.

## Commands

```bash
openclaw kgm status
openclaw kgm init
openclaw kgm ensure-agent --agent <agentId>
```

## Notes

- Admin actions require operator permissions.
- Do not store secrets in KGM.
- Keep KGM as a mirror unless explicitly switching to kgm-primary.

## Runbook: Memgraph Docker (dev)

Use this if KGM is enabled but Memgraph is not running.

```bash
docker compose -f docker/memgraph/docker-compose.yml up -d
docker compose -f docker/memgraph/docker-compose.yml ps
```

If health checks fail, inspect logs:

```bash
docker compose -f docker/memgraph/docker-compose.yml logs --tail=200 memgraph
```

To stop:

```bash
docker compose -f docker/memgraph/docker-compose.yml down
```
