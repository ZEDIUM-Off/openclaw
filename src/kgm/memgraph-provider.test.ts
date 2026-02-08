import { describe, expect, it, vi } from "vitest";
import { MemgraphProvider } from "./memgraph-provider.js";

// Mock neo4j driver
const mockRun = vi.fn();
const mockSession = vi.fn(() => ({ run: mockRun, close: vi.fn() }));
const mockDriver = vi.fn(() => ({ session: mockSession, close: vi.fn() }));

vi.mock("neo4j-driver", () => ({
  default: {
    driver: mockDriver,
    auth: { basic: vi.fn(() => "auth-token") },
    types: {
      Record: class Record {
        constructor(private data: Record<string, unknown>) {}
        get(key: string) {
          return this.data[key];
        }
        toObject() {
          return this.data;
        }
      },
    },
  },
}));

describe("MemgraphProvider", () => {
  const createProvider = () =>
    new MemgraphProvider({
      url: "bolt://localhost:7687",
      user: "memgraph",
      password: "memgraph",
    });

  const actor = { role: "system" as const };

  describe("search", () => {
    it("should search with default limit of 20", async () => {
      const provider = createProvider();
      mockRun.mockResolvedValueOnce({
        records: [],
      });

      await provider.search({
        actor,
        scope: "agent:test",
        query: "test",
      });

      const call = mockRun.mock.calls[0];
      expect(call[0]).toContain("LIMIT 20");
      expect(call[0]).not.toContain("LIMIT $");
    });

    it("should use provided limit as integer literal", async () => {
      const provider = createProvider();
      mockRun.mockResolvedValueOnce({
        records: [],
      });

      await provider.search({
        actor,
        scope: "agent:test",
        query: "test",
        limit: 50,
      });

      const call = mockRun.mock.calls[0];
      expect(call[0]).toContain("LIMIT 50");
      expect(call[0]).not.toContain("LIMIT $");
    });

    it("should floor float limit to integer", async () => {
      const provider = createProvider();
      mockRun.mockResolvedValueOnce({
        records: [],
      });

      await provider.search({
        actor,
        scope: "agent:test",
        query: "test",
        limit: 10.7, // Float value
      });

      const call = mockRun.mock.calls[0];
      expect(call[0]).toContain("LIMIT 10"); // Should be floored
      expect(call[0]).not.toContain("LIMIT $");
    });

    it("should ensure minimum limit of 1", async () => {
      const provider = createProvider();
      mockRun.mockResolvedValueOnce({
        records: [],
      });

      await provider.search({
        actor,
        scope: "agent:test",
        query: "test",
        limit: 0, // Below minimum
      });

      const call = mockRun.mock.calls[0];
      expect(call[0]).toContain("LIMIT 1");
    });

    it("should handle negative limit by using default", async () => {
      const provider = createProvider();
      mockRun.mockResolvedValueOnce({
        records: [],
      });

      await provider.search({
        actor,
        scope: "agent:test",
        query: "test",
        limit: -5,
      });

      const call = mockRun.mock.calls[0];
      expect(call[0]).toContain("LIMIT 1"); // Math.max(1, ...) ensures minimum
    });

    it("should pass scope and query as parameters", async () => {
      const provider = createProvider();
      mockRun.mockResolvedValueOnce({
        records: [],
      });

      await provider.search({
        actor,
        scope: "agent:main",
        query: "test-query",
        limit: 5,
      });

      const call = mockRun.mock.calls[0];
      expect(call[1]).toMatchObject({
        scope: "agent:main",
        query: "test-query",
      });
      // Limit should NOT be in parameters
      expect(call[1]).not.toHaveProperty("limit");
    });

    it("should handle search results correctly", async () => {
      const provider = createProvider();
      mockRun.mockResolvedValueOnce({
        records: [
          {
            get: (key: string) => {
              const data: Record<string, unknown> = {
                key: "node:1",
                label: "Node",
                properties: { name: "Test Node", scope: "agent:test" },
              };
              return data[key];
            },
            toObject: () => ({
              key: "node:1",
              label: "Node",
              properties: { name: "Test Node", scope: "agent:test" },
            }),
          },
        ],
      });

      const results = await provider.search({
        actor,
        scope: "agent:test",
        query: "node",
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        key: "node:1",
        label: "Node",
      });
    });

    it("should use IS NOT NULL instead of exists() for Memgraph compatibility", async () => {
      const provider = createProvider();
      mockRun.mockResolvedValueOnce({
        records: [],
      });

      await provider.search({
        actor,
        scope: "agent:test",
        query: "test",
      });

      const cypher = mockRun.mock.calls[0][0];
      expect(cypher).toContain("n.label IS NOT NULL");
      expect(cypher).not.toContain("exists(n.label)");
    });
  });

  describe("query building", () => {
    it("should embed limit directly in cypher string, not as parameter", async () => {
      const provider = createProvider();
      mockRun.mockResolvedValueOnce({ records: [] });

      await provider.search({
        actor,
        scope: "agent:test",
        query: "test",
        limit: 42,
      });

      const cypher = mockRun.mock.calls[0][0];
      const params = mockRun.mock.calls[0][1];

      // LIMIT should be embedded in the query string
      expect(cypher).toMatch(/LIMIT 42$/);
      // And NOT be in parameters
      expect(params).not.toHaveProperty("limit");
    });
  });
});
