import { readLatestTrendManifest } from "./blob-storage";
import type { TrendManifest } from "./domain";

type TrendsHandlerDependencies = {
  isConfigured: () => boolean;
  readManifest: () => Promise<TrendManifest | null>;
  logError: (metadata: { event: "trend_read_failed"; errorName: string }) => void;
};

const dependencies: TrendsHandlerDependencies = {
  isConfigured: () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
  readManifest: readLatestTrendManifest,
  logError: (metadata) => console.warn(JSON.stringify(metadata)),
};

export function createTrendsHandler(overrides: Partial<TrendsHandlerDependencies> = {}) {
  const resolved = { ...dependencies, ...overrides };
  return async function GET() {
    if (!resolved.isConfigured()) {
      return Response.json({ manifest: null }, {
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
      });
    }

    try {
      const manifest = await resolved.readManifest();
      return Response.json({ manifest }, {
        headers: {
          "Cache-Control": manifest
            ? "public, s-maxage=300, stale-while-revalidate=86400"
            : "public, s-maxage=60, stale-while-revalidate=300",
        },
      });
    } catch (error) {
      resolved.logError({
        event: "trend_read_failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return Response.json(
        { error: "TRENDS_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}
