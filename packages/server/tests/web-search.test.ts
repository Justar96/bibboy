import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExecutionResult } from "@bibboy/shared";
import { createWebSearchTool } from "../src/tools/web-search";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getResultPayload(result: ToolExecutionResult): JsonRecord {
  if (!isRecord(result.details)) {
    throw new Error("Expected jsonResult payload in result.details");
  }
  return result.details;
}

describe("web_search tool", () => {
  const originalBraveKey = process.env.BRAVE_API_KEY;
  const originalPerplexityKey = process.env.PERPLEXITY_API_KEY;

  beforeEach(() => {
    delete process.env.BRAVE_API_KEY;
    delete process.env.PERPLEXITY_API_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();

    if (originalBraveKey === undefined) {
      delete process.env.BRAVE_API_KEY;
    } else {
      process.env.BRAVE_API_KEY = originalBraveKey;
    }

    if (originalPerplexityKey === undefined) {
      delete process.env.PERPLEXITY_API_KEY;
    } else {
      process.env.PERPLEXITY_API_KEY = originalPerplexityKey;
    }
  });

  it("returns disabled payload when no providers are configured", async () => {
    const tool = createWebSearchTool();
    const result = await tool.execute("tc_1", { query: "status check" });

    const payload = getResultPayload(result);
    expect(payload.disabled).toBe(true);
    expect(payload.provider).toBe("brave");
    expect(payload.error).toBe(
      "Web search requires BRAVE_API_KEY or PERPLEXITY_API_KEY environment variable.",
    );
  });

  it("falls back to default provider when provider arg is invalid", async () => {
    process.env.BRAVE_API_KEY = "brave-test-key";

    const mockFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: "Result title",
                  url: "https://example.com/article",
                  description: "Snippet",
                  age: "2d",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const tool = createWebSearchTool();
    const result = await tool.execute("tc_2", {
      query: "fallback provider query",
      provider: "not-a-provider",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const payload = getResultPayload(result);
    expect(payload.provider).toBe("brave");
    expect(payload.count).toBe(1);
    expect(Array.isArray(payload.results)).toBe(true);
  });

  it("reports the actual provider when perplexity is requested but unavailable", async () => {
    process.env.BRAVE_API_KEY = "brave-test-key";
    delete process.env.PERPLEXITY_API_KEY;

    const mockFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: "Fallback result",
                  url: "https://example.com/fallback",
                  description: "Fallback snippet",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const tool = createWebSearchTool();
    const result = await tool.execute("tc_fallback_provider", {
      query: "provider fallback query",
      provider: "perplexity",
    });

    const payload = getResultPayload(result);
    expect(payload.provider).toBe("brave");
    expect(payload.count).toBe(1);
  });

  it("ignores invalid freshness value instead of sending it upstream", async () => {
    process.env.BRAVE_API_KEY = "brave-test-key";

    const mockFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ web: { results: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const tool = createWebSearchTool();
    await tool.execute("tc_3", {
      query: "freshness parsing query",
      provider: "brave",
      freshness: "invalid-freshness",
    });

    const [requestedUrl] = mockFetch.mock.calls[0] as [string];
    const parsedUrl = new URL(requestedUrl);
    expect(parsedUrl.searchParams.has("freshness")).toBe(false);
  });

  it("returns graceful error when Perplexity response shape is invalid", async () => {
    process.env.PERPLEXITY_API_KEY = "perplexity-test-key";

    const mockFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ citations: "not-an-array" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const tool = createWebSearchTool();
    const result = await tool.execute("tc_4", {
      query: "perplexity invalid payload query",
      provider: "perplexity",
    });

    const payload = getResultPayload(result);
    expect(payload.disabled).toBe(true);
    expect(payload.error).toBe("Unexpected Perplexity API response shape");
    expect(payload.provider).toBe("perplexity");
  });
});
