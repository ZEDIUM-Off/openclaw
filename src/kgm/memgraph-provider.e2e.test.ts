import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemgraphProvider } from "./memgraph-provider.js";

const memgraphUrl = process.env.MEMGRAPH_URL?.trim();
const memgraphUser = process.env.MEMGRAPH_USER?.trim();
const memgraphPassword = process.env.MEMGRAPH_PASSWORD?.trim();
const memgraphDatabase = process.env.MEMGRAPH_DATABASE?.trim();
const shouldRun = Boolean(memgraphUrl);

const describeIf = shouldRun ? describe : describe.skip;

describeIf("memgraph provider (e2e)", () => {
  it("writes and reads nodes via a live Memgraph instance", async () => {
    const provider = createMemgraphProvider({
      url: memgraphUrl,
      user: memgraphUser,
      password: memgraphPassword,
      database: memgraphDatabase,
    });
    const scope = `test:${crypto.randomUUID()}`;
    const actor = { role: "system" as const };
    let shouldCleanup = true;

    try {
      try {
        await provider.query({
          actor,
          scope,
          cypher: "RETURN 1 AS ok",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("not authorized") || message.includes("Invalid license key")) {
          shouldCleanup = false;
          return;
        }
        throw err;
      }

      const sessionKey = `session:${crypto.randomUUID()}`;
      const messageKey = `message:${crypto.randomUUID()}`;
      try {
        await provider.upsertNode({
          actor,
          scope,
          label: "Session",
          key: sessionKey,
          properties: { createdAt: Date.now() },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("not authorized") || message.includes("Invalid license key")) {
          shouldCleanup = false;
          return;
        }
        throw err;
      }
      await provider.upsertNode({
        actor,
        scope,
        label: "Message",
        key: messageKey,
        properties: { preview: "hello" },
      });
      await provider.upsertEdge({
        actor,
        scope,
        type: "HAS_MESSAGE",
        from: { key: sessionKey, label: "Session" },
        to: { key: messageKey, label: "Message" },
        properties: { weight: 1 },
      });

      const search = await provider.search({ actor, scope, query: "session", limit: 10 });
      expect(search.some((row) => row.key === sessionKey)).toBe(true);

      const result = await provider.query({
        actor,
        scope,
        cypher:
          "MATCH (s:Session { scope: $scope, key: $key })-[:HAS_MESSAGE]->(m:Message) " +
          "RETURN s.key AS sessionKey, m.key AS messageKey",
        params: { scope, key: sessionKey },
      });
      expect(result.rows.length).toBeGreaterThan(0);
    } finally {
      if (shouldCleanup) {
        try {
          await provider.query({
            actor,
            scope,
            cypher: "MATCH (n { scope: $scope }) DETACH DELETE n",
            params: { scope },
          });
        } catch {
          // ignore cleanup errors (auth/connection)
        }
      }
      await provider.close();
    }
  });
});
