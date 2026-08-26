import { del, list, put } from "@vercel/blob";

import {
  LatestTrendPointerSchema,
  TrendManifestSchema,
  TrendResearchSchema,
  type TrendManifest,
  type TrendResearch,
} from "./domain";

const ROOT_PREFIX = "fashion-trends";
const RUN_PATH = /^fashion-trends\/runs\/([^/]+)\/(?:manifest\.json|images\/[a-z0-9]+(?:-[a-z0-9]+)*\.png)$/;
const ORPHAN_MAX_AGE_MS = 48 * 60 * 60 * 1000;

type PutOptions = {
  access: "public";
  addRandomSuffix: false;
  allowOverwrite?: boolean;
  cacheControlMaxAge: number;
  contentType: string;
};

export type TrendBlob = {
  pathname: string;
  url: string;
  uploadedAt: Date;
};

export interface TrendBlobClient {
  put(pathname: string, body: string | Uint8Array, options: PutOptions): Promise<{ url: string }>;
  list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{
    blobs: TrendBlob[];
    cursor?: string;
    hasMore: boolean;
  }>;
  del(pathnames: string[]): Promise<void>;
}

export const vercelTrendBlobClient: TrendBlobClient = {
  put: async (pathname, body, options) => put(
    pathname,
    typeof body === "string" ? body : Buffer.from(body),
    options,
  ),
  list: async (options) => list(options),
  del: async (pathnames) => del(pathnames),
};

function runIdFrom(date: Date): string {
  return date.toISOString().replace(/[.:]/g, "-");
}

function jsonBody(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function publishTrendRun({
  client,
  research,
  generateImage,
  now,
}: {
  client: TrendBlobClient;
  research: TrendResearch;
  generateImage: (prompt: string) => Promise<Uint8Array>;
  now: Date;
}): Promise<TrendManifest> {
  const validatedResearch = TrendResearchSchema.parse(research);
  const runId = runIdFrom(now);
  const items: TrendManifest["items"] = [];

  for (const item of validatedResearch.items) {
    const image = await generateImage(item.image_prompt);
    const imageBlob = await client.put(
      `${ROOT_PREFIX}/runs/${runId}/images/${item.id}.png`,
      image,
      {
        access: "public",
        addRandomSuffix: false,
        cacheControlMaxAge: 31_536_000,
        contentType: "image/png",
      },
    );
    items.push({
      id: item.id,
      imageUrl: imageBlob.url,
      translations: item.translations,
      sources: item.sources,
    });
  }

  const manifest = TrendManifestSchema.parse({
    schemaVersion: 1,
    runId,
    generatedAt: now.toISOString(),
    market: "TW",
    items,
  });
  const manifestBlob = await client.put(
    `${ROOT_PREFIX}/runs/${runId}/manifest.json`,
    jsonBody(manifest),
    {
      access: "public",
      addRandomSuffix: false,
      cacheControlMaxAge: 31_536_000,
      contentType: "application/json; charset=utf-8",
    },
  );

  await client.put(
    `${ROOT_PREFIX}/latest.json`,
    jsonBody({
      schemaVersion: 1,
      runId,
      generatedAt: manifest.generatedAt,
      manifestUrl: manifestBlob.url,
    }),
    {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "application/json; charset=utf-8",
    },
  );

  return manifest;
}

async function listAll(client: TrendBlobClient, prefix: string): Promise<TrendBlob[]> {
  const blobs: TrendBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

export async function cleanupOldTrendRuns({
  client,
  currentRunId,
  now,
}: {
  client: TrendBlobClient;
  currentRunId: string;
  now: Date;
}): Promise<string[]> {
  const blobs = await listAll(client, `${ROOT_PREFIX}/runs/`);
  const runBlobs = new Map<string, TrendBlob[]>();
  for (const blob of blobs) {
    const match = RUN_PATH.exec(blob.pathname);
    if (!match) continue;
    const runId = match[1];
    runBlobs.set(runId, [...(runBlobs.get(runId) ?? []), blob]);
  }

  const successfulRuns = [...runBlobs.entries()]
    .filter(([, entries]) => entries.some((blob) => blob.pathname.endsWith("/manifest.json")))
    .sort(([, left], [, right]) => right[0].uploadedAt.getTime() - left[0].uploadedAt.getTime())
    .map(([runId]) => runId);
  const previousRunId = successfulRuns.find((runId) => runId !== currentRunId);
  const protectedRuns = new Set([currentRunId, ...(previousRunId ? [previousRunId] : [])]);
  const toDelete: string[] = [];

  for (const [runId, entries] of runBlobs) {
    if (protectedRuns.has(runId)) continue;
    const successful = entries.some((blob) => blob.pathname.endsWith("/manifest.json"));
    const newestUpload = Math.max(...entries.map((blob) => blob.uploadedAt.getTime()));
    if (successful || now.getTime() - newestUpload > ORPHAN_MAX_AGE_MS) {
      toDelete.push(...entries.map((blob) => blob.pathname));
    }
  }

  if (toDelete.length > 0) await client.del(toDelete);
  return toDelete;
}

type TrendFetch = (
  input: string,
  init: RequestInit & { next?: { revalidate: number } },
) => Promise<Response>;

async function fetchJson(fetcher: TrendFetch, url: string, init: Parameters<TrendFetch>[1]): Promise<unknown> {
  const response = await fetcher(url, init);
  if (!response.ok) throw new Error(`Unable to read trend Blob (${response.status})`);
  return response.json();
}

export async function readLatestTrendManifest({
  client = vercelTrendBlobClient,
  fetcher = fetch as TrendFetch,
}: {
  client?: TrendBlobClient;
  fetcher?: TrendFetch;
} = {}): Promise<TrendManifest | null> {
  const result = await client.list({ prefix: `${ROOT_PREFIX}/latest.json`, limit: 1 });
  const latestBlob = result.blobs.find((blob) => blob.pathname === `${ROOT_PREFIX}/latest.json`);
  if (!latestBlob) return null;

  const pointer = LatestTrendPointerSchema.parse(await fetchJson(fetcher, latestBlob.url, { cache: "no-store" }));
  return TrendManifestSchema.parse(await fetchJson(fetcher, pointer.manifestUrl, {
    next: { revalidate: 300 },
  }));
}
