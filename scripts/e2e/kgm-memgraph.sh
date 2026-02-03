#!/usr/bin/env bash
set -euo pipefail

MEMGRAPH_URL=${MEMGRAPH_URL:-"bolt://127.0.0.1:7687"}
MEMGRAPH_USER=${MEMGRAPH_USER:-"openclaw"}
MEMGRAPH_PASSWORD=${MEMGRAPH_PASSWORD:-"openclaw"}

export MEMGRAPH_URL
export MEMGRAPH_USER
export MEMGRAPH_PASSWORD

pnpm vitest run --config vitest.kgm.e2e.config.ts
