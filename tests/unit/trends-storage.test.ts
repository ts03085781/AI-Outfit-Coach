import { describe, expect, it, vi } from "vitest";

import {
  cleanupOldTrendRuns,
  publishTrendRun,
  readLatestTrendManifest,
  type TrendBlobClient,
} from "@/features/trends/blob-storage";

const translations = {
  "zh-TW": { name: "薄透風衣", description: "適合台灣換季。" },
  en: { name: "Sheer windbreaker", description: "For Taiwan's changing weather." },
  ja: { name: "シアーウィンドブレーカー", description: "台湾の季節の変わり目に。" },
  ko: { name: "시어 윈드브레이커", description: "대만의 환절기에 어울립니다." },
};

function blobClient(overrides: Partial<TrendBlobClient> = {}): TrendBlobClient {
  return {
    put: vi.fn(async (pathname) => ({ url: `https://store.public.blob.vercel-storage.com/${pathname}` })),
    list: vi.fn(async () => ({ blobs: [], hasMore: false })),
    del: vi.fn(async () => undefined),
    ...overrides,
  };
}

function research() {
  return {
    items: Array.from({ length: 5 }, (_, index) => ({
      id: `trend-${index + 1}`,
      translations,
      image_prompt: `Product ${index + 1}`,
      sources: [{ title: "Source", url: `https://example.com/${index + 1}` }],
    })),
  };
}

describe("trend Blob publication", () => {
  it("publishes all images and the manifest before atomically replacing latest.json", async () => {
    const client = blobClient();
    const generateImage = vi.fn(async () => new Uint8Array([1, 2, 3]));

    const manifest = await publishTrendRun({
      client,
      research: research(),
      generateImage,
      now: new Date("2026-08-26T22:00:00.000Z"),
    });

    expect(manifest.items).toHaveLength(5);
    expect(generateImage).toHaveBeenCalledTimes(5);
    const paths = vi.mocked(client.put).mock.calls.map(([pathname]) => pathname);
    expect(paths.slice(0, 5)).toEqual([
      "fashion-trends/runs/2026-08-26T22-00-00-000Z/images/trend-1.png",
      "fashion-trends/runs/2026-08-26T22-00-00-000Z/images/trend-2.png",
      "fashion-trends/runs/2026-08-26T22-00-00-000Z/images/trend-3.png",
      "fashion-trends/runs/2026-08-26T22-00-00-000Z/images/trend-4.png",
      "fashion-trends/runs/2026-08-26T22-00-00-000Z/images/trend-5.png",
    ]);
    expect(paths.at(-2)).toMatch(/manifest\.json$/);
    expect(paths.at(-1)).toBe("fashion-trends/latest.json");
    expect(vi.mocked(client.put).mock.calls.at(-1)?.[2]).toMatchObject({
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
  });

  it("does not replace latest.json when any image upload fails", async () => {
    const client = blobClient();
    const generateImage = vi.fn(async (prompt: string) => {
      if (prompt === "Product 3") throw new Error("image failure");
      return new Uint8Array([1]);
    });

    await expect(publishTrendRun({
      client,
      research: research(),
      generateImage,
      now: new Date("2026-08-26T22:00:00.000Z"),
    })).rejects.toThrow("image failure");

    expect(vi.mocked(client.put).mock.calls.some(([path]) => path === "fashion-trends/latest.json")).toBe(false);
  });

  it("keeps the latest two successful runs and deletes older orphans", async () => {
    const uploadedAt = new Date("2026-08-26T22:00:00.000Z");
    const runs = ["run-current", "run-previous", "run-old", "run-orphan"];
    const blobs = runs.flatMap((runId) => [
      { pathname: `fashion-trends/runs/${runId}/images/item.png`, url: `https://blob/${runId}/item`, uploadedAt },
      ...(runId === "run-orphan" ? [] : [{ pathname: `fashion-trends/runs/${runId}/manifest.json`, url: `https://blob/${runId}/manifest`, uploadedAt }]),
    ]);
    const client = blobClient({ list: vi.fn(async () => ({ blobs, hasMore: false })) });

    const deleted = await cleanupOldTrendRuns({
      client,
      currentRunId: "run-current",
      now: new Date("2026-08-29T22:00:00.000Z"),
    });

    expect(deleted.sort()).toEqual([
      "fashion-trends/runs/run-old/images/item.png",
      "fashion-trends/runs/run-old/manifest.json",
      "fashion-trends/runs/run-orphan/images/item.png",
    ].sort());
    expect(client.del).toHaveBeenCalledWith(deleted);
  });

  it("reads and validates latest.json followed by its immutable manifest", async () => {
    const manifest = {
      schemaVersion: 1,
      runId: "run-current",
      generatedAt: "2026-08-26T22:00:00.000Z",
      market: "TW",
      items: research().items.map(({ image_prompt: _imagePrompt, ...item }) => ({
        ...item,
        imageUrl: `https://store.public.blob.vercel-storage.com/${item.id}.png`,
      })),
    };
    const latestUrl = "https://store.public.blob.vercel-storage.com/fashion-trends/latest.json";
    const manifestUrl = "https://store.public.blob.vercel-storage.com/fashion-trends/runs/run-current/manifest.json";
    const client = blobClient({
      list: vi.fn(async () => ({
        blobs: [{ pathname: "fashion-trends/latest.json", url: latestUrl, uploadedAt: new Date() }],
        hasMore: false,
      })),
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        schemaVersion: 1,
        runId: "run-current",
        generatedAt: "2026-08-26T22:00:00.000Z",
        manifestUrl,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify(manifest)));

    await expect(readLatestTrendManifest({ client, fetcher })).resolves.toEqual(manifest);
    expect(fetcher).toHaveBeenNthCalledWith(1, latestUrl, expect.objectContaining({ cache: "no-store" }));
    expect(fetcher).toHaveBeenNthCalledWith(2, manifestUrl, expect.objectContaining({ next: { revalidate: 300 } }));
  });
});
