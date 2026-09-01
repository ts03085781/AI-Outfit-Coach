// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { createTrendsHandler } from "@/features/trends/trends-route";

const copy = {
  "zh-TW": { name: "薄透風衣", description: "適合台灣換季。" },
  en: { name: "Sheer jacket", description: "For changing weather." },
  ja: { name: "シアージャケット", description: "季節の変わり目に。" },
  ko: { name: "시어 재킷", description: "환절기에 어울립니다." },
};

const manifest = {
  schemaVersion: 1 as const,
  runId: "run-current",
  generatedAt: "2026-08-26T22:00:00.000Z",
  market: "TW" as const,
  items: Array.from({ length: 5 }, (_, index) => ({
    id: `trend-${index + 1}`,
    imageUrl: `https://store.public.blob.vercel-storage.com/trend-${index + 1}.png`,
    translations: copy,
    sources: [{ title: "Source", url: `https://example.com/${index + 1}` }],
  })),
};

describe("trends route", () => {
  it("returns a cached trend manifest", async () => {
    const readManifest = vi.fn().mockResolvedValue(manifest);
    const response = await createTrendsHandler({
      isConfigured: () => true,
      readManifest,
      logError: vi.fn(),
    })();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ manifest });
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=86400",
    );
  });

  it.each([false, true])("returns a short-cached null manifest for empty state", async (configured) => {
    const readManifest = vi.fn().mockResolvedValue(null);
    const response = await createTrendsHandler({
      isConfigured: () => configured,
      readManifest,
      logError: vi.fn(),
    })();

    await expect(response.json()).resolves.toEqual({ manifest: null });
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=300",
    );
    expect(readManifest).toHaveBeenCalledTimes(configured ? 1 : 0);
  });

  it("sanitizes configured storage failures", async () => {
    const logError = vi.fn();
    const response = await createTrendsHandler({
      isConfigured: () => true,
      readManifest: vi.fn().mockRejectedValue(new Error("secret provider detail")),
      logError,
    })();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "TRENDS_UNAVAILABLE" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("secret provider detail");
  });
});
