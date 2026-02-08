import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock must be defined before imports (hoisted by Vitest)
const mockFns = {
  run: vi.fn(),
  session: vi.fn(),
  driver: vi.fn(),
};

vi.mock("neo4j-driver", () => ({
  default: {
    driver: (...args: unknown[]) => {
      mockFns.driver(...args);
      return {
        session: () => {
          mockFns.session();
          return {
            run: mockFns.run,
            close: vi.fn(),
          };
        },
        close: vi.fn(),
      };
    },
    auth: { basic: vi.fn(() => "auth-token") },
    session: { WRITE: "write", READ: "read" },
    isInt: (value: unknown) =>
      value instanceof Object && value !== null && typeof value === "object" && "toNumber" in value,
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

import { MemgraphProvider } from "./memgraph-provider.js";

describe("MemgraphProvider", () => {
  const createProvider = () =>
    new MemgraphProvider({
      config: {
        url: "bolt://localhost:7687",
        user: "memgraph",
        password: "memgraph",
      },
    });

  const actor = { role: "system" as const };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("search", () => {
    it("should search with default limit of 20", async () => {
      const provider = createProvider();
      mockFns.run.mockResolvedValueOnce({
        records: [],
      });

      await provider.search({
        actor,
        scope: "agent:test",
        query: "test",
      });

      const call = mockFns.run.mock.calls[0];
      expect(call[0]).toContain("LIMIT 20");
      expect(call[0]).not.toContain("LIMIT $");
    });

    it("should use provided limit as integer literal", async () => {
      const provider = createProvider();
      mockFns.run.mockResolvedValueOnce({
        records: [],
      });

      await provider.search({
        actor,
        scope: "agent:test",
        query: "test",
        limit: 50,
      });

      const call = mockFns.run.mock.calls[0];
      expect(call[0]).toContain("LIMIT 50");
      expect(call[0]).not.toContain("LIMIT $");
    });

    it("should floor float limit to integer", async () => {
      const provider = createProvider();
      mockFns.run.mockResolvedValueOnce({
        records: [],
      });

      await provider.search({
        actor,
        scope: "agent:test",
        query: "test",
        limit: 10.7,
      });

      const call = mockFns.run.mock.calls[0];
      expect(call[0]).toContain("LIMIT 10");
      expect(call[0]).not.toContain("LIMIT $");
    });

    it("should ensure minimum limit of 1", async () => {
      const provider = createProvider();
      mockFns.run.mockResolvedValueOnce({
        records: [],
      });

      await provider.search({
        actor,
        scope: "agent:test",
        query: "test",
        limit: 0,
      });

      const call = mockFns.run.mock.calls[0];
      expect(call[0]).toContain("LIMIT 1");
    });

    it("should handle negative limit by using default", async () => {
      const provider = createProvider();
      mockFns.run.mockResolvedValueOnce({
        records: [],
      });

      await provider.search({
        actor,
        scope: "agent:test",
        query: "test",
        limit: -5,
      });

      const call = mockFns.run.mock.calls[0];
      expect(call[0]).toContain("LIMIT 1");
    });

    it("should pass scope and query as parameters", async () => {
      const provider = createProvider();
      mockFns.run.mockResolvedValueOnce({
        records: [],
      });

      await provider.search({
        actor,
        scope: "agent:main",
        query: "test-query",
        limit: 5,
      });

      const call = mockFns.run.mock.calls[0];
      expect(call[1]).toMatchObject({
        scope: "agent:main",
        query: "test-query",
      });
      expect(call[1]).not.toHaveProperty("limit");
    });

    it("should handle search results correctly", async () => {
      const provider = createProvider();
      mockFns.run.mockResolvedValueOnce({
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
      mockFns.run.mockResolvedValueOnce({
        records: [],
      });

      await provider.search({
        actor,
        scope: "agent:test",
        query: "test",
      });

      const cypher = mockFns.run.mock.calls[0][0];
      expect(cypher).toContain("n.label IS NOT NULL");
      expect(cypher).not.toContain("exists(n.label)");
    });
  });

  describe("query building", () => {
    it("should embed limit directly in cypher string, not as parameter", async () => {
      const provider = createProvider();
      mockFns.run.mockResolvedValueOnce({ records: [] });

      await provider.search({
        actor,
        scope: "agent:test",
        query: "test",
        limit: 42,
      });

      const cypher = mockFns.run.mock.calls[0][0];
      const params = mockFns.run.mock.calls[0][1];

      expect(cypher).toMatch(/LIMIT 42$/);
      expect(params).not.toHaveProperty("limit");
    });
  });
});
