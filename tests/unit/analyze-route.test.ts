// @vitest-environment node

import { readFileSync } from "node:fs";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OutfitAnalyzer } from "@/features/outfit/analyzer";
import {
  AnalyzerTimeoutError,
  AnalyzerUnavailableError,
} from "@/features/outfit/openai-analyzer";
import {
  POST as defaultPost,
} from "@/app/api/analyze/route";
import { createAnalyzeHandler } from "@/features/outfit/analyze-handler";
import { createInMemoryAbuseGuard, type AbuseGuard } from "@/lib/abuse-guard";

const completeAnalysis = {
  summary: "整體俐落。",
  strengths: ["配色協調", "比例清楚"],
  occasion_fit: "適合" as const,
  suggestions: [],
  retake_required: false as const,
  retake_reason: null,
};

const validPng = readFileSync("tests/fixtures/outfit-safe.png");

function validImage(type = "image/png") {
  return new Blob([validPng], { type });
}

function makeMultipartRequest(image: Blob, occasion = "casual", headers?: HeadersInit) {
  const formData = new FormData();
  formData.set("image", image, "outfit-image");
  formData.set("occasion", occasion);
  return new Request("http://localhost/api/analyze", { method: "POST", body: formData, headers });
}

function analyzerReturning(result: Awaited<ReturnType<OutfitAnalyzer["analyze"]>>): OutfitAnalyzer {
  return { analyze: async () => result };
}

function allowingGuard(): AbuseGuard {
  return createInMemoryAbuseGuard({
    secret: "unit-test-secret",
    globalConcurrency: 20,
    config: {
      analyze: {
        burst: { limit: 100, windowMs: 1_000 },
        sustained: { limit: 100, windowMs: 10_000 },
      },
      followUp: {
        burst: { limit: 100, windowMs: 1_000 },
        sustained: { limit: 100, windowMs: 10_000 },
      },
    },
  });
}

function handleRequest(request: Request, analyzer: OutfitAnalyzer, abuseGuard = allowingGuard()) {
  return createAnalyzeHandler({ createAnalyzer: () => analyzer, abuseGuard })(request);
}

function makeOversizedMultipartRequest(contentLength?: string) {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(6 * 1024 * 1024 + 1));
    },
    cancel() {
      cancelled = true;
    },
  });
  const headers = new Headers({ "content-type": "multipart/form-data; boundary=body-limit" });
  if (contentLength) headers.set("content-length", contentLength);

  return {
    request: new Request("http://localhost/api/analyze", {
      method: "POST",
      body,
      headers,
      duplex: "half",
    } as RequestInit & { duplex: "half" }),
    wasCancelled: () => cancelled,
  };
}

describe("POST /api/analyze", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns a complete analysis for a valid multipart image", async () => {
    const response = await handleRequest(
      makeMultipartRequest(validImage()),
      analyzerReturning(completeAnalysis),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ occasion_fit: "適合" });
  });

  it("returns INVALID_IMAGE when the multipart payload has no image", async () => {
    const formData = new FormData();
    formData.set("occasion", "casual");
    const response = await handleRequest(
      new Request("http://localhost/api/analyze", { method: "POST", body: formData }),
      analyzerReturning(completeAnalysis),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
  });

  it("returns INVALID_IMAGE for an unsupported image type", async () => {
    const response = await handleRequest(
      makeMultipartRequest(new Blob(["image"], { type: "image/gif" })),
      analyzerReturning(completeAnalysis),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
  });

  it("rejects spoofed image MIME metadata without calling the analyzer", async () => {
    const analyze = vi.fn(async () => completeAnalysis);
    const response = await handleRequest(
      makeMultipartRequest(validImage("image/webp")),
      { analyze },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
    expect(analyze).not.toHaveBeenCalled();
  });

  it("rejects corrupt bytes even when the WebP magic and MIME agree", async () => {
    const analyze = vi.fn(async () => completeAnalysis);
    const corruptWebp = new Blob([
      new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
    ], { type: "image/webp" });

    const response = await handleRequest(makeMultipartRequest(corruptWebp), { analyze });

    expect(response.status).toBe(400);
    expect(analyze).not.toHaveBeenCalled();
  });

  it("rejects a decodable image with a dimension above 8000 pixels", async () => {
    const analyze = vi.fn(async () => completeAnalysis);
    const tooWide = await sharp({
      create: { width: 8001, height: 1, channels: 3, background: "#ffffff" },
    }).png().toBuffer();

    const response = await handleRequest(
      makeMultipartRequest(new Blob([Uint8Array.from(tooWide)], { type: "image/png" })),
      { analyze },
    );

    expect(response.status).toBe(400);
    expect(analyze).not.toHaveBeenCalled();
  });

  it("rejects a cross-site request before buffering or calling the analyzer", async () => {
    const analyze = vi.fn(async () => completeAnalysis);
    const response = await handleRequest(
      makeMultipartRequest(validImage(), "casual", {
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      }),
      { analyze },
    );

    expect(response.status).toBe(403);
    expect(analyze).not.toHaveBeenCalled();
  });

  it("returns 429 and does not call the analyzer after the endpoint burst budget", async () => {
    const analyze = vi.fn(async () => completeAnalysis);
    const abuseGuard = createInMemoryAbuseGuard({
      secret: "unit-test-secret",
      globalConcurrency: 2,
      config: {
        analyze: {
          burst: { limit: 1, windowMs: 1_000 },
          sustained: { limit: 2, windowMs: 10_000 },
        },
        followUp: {
          burst: { limit: 1, windowMs: 1_000 },
          sustained: { limit: 2, windowMs: 10_000 },
        },
      },
    });

    expect((await handleRequest(makeMultipartRequest(validImage()), { analyze }, abuseGuard)).status).toBe(200);
    const blocked = await handleRequest(makeMultipartRequest(validImage()), { analyze }, abuseGuard);

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("1");
    expect(analyze).toHaveBeenCalledOnce();
  });

  it("returns INVALID_IMAGE for an image larger than 4 MB", async () => {
    const response = await handleRequest(
      makeMultipartRequest(new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: "image/webp" })),
      analyzerReturning(completeAnalysis),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
  });

  it("returns INVALID_IMAGE when the Content-Length exceeds 6 MB", async () => {
    const request = makeMultipartRequest(validImage());
    const response = await handleRequest(
      new Request(request, { headers: { "content-length": String(6 * 1024 * 1024 + 1) } }),
      analyzerReturning(completeAnalysis),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
  });

  it("rejects and cancels an over-limit multipart stream without Content-Length", async () => {
    const oversized = makeOversizedMultipartRequest();
    const response = await handleRequest(oversized.request, analyzerReturning(completeAnalysis));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
    expect(oversized.wasCancelled()).toBe(true);
  });

  it("rejects an over-limit multipart stream with a falsely small Content-Length", async () => {
    const oversized = makeOversizedMultipartRequest("1");
    const response = await handleRequest(oversized.request, analyzerReturning(completeAnalysis));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
    expect(oversized.wasCancelled()).toBe(true);
  });

  it("returns INVALID_IMAGE for a non-multipart request", async () => {
    const response = await handleRequest(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      analyzerReturning(completeAnalysis),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
  });

  it("returns INVALID_IMAGE for a multipart body with a malformed boundary", async () => {
    const response = await handleRequest(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=expected" },
        body: "--different\\r\\n",
      }),
      analyzerReturning(completeAnalysis),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
  });

  it("returns RETAKE_REQUIRED when the analysis requires a new photo", async () => {
    const response = await handleRequest(
      makeMultipartRequest(validImage()),
      analyzerReturning({ retake_required: true, retake_reason: "衣物細節不清楚" }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "RETAKE_REQUIRED",
      retake_reason: "衣物細節不清楚",
    });
  });

  it("maps an aborted analysis to AI_TIMEOUT", async () => {
    const response = await handleRequest(
      makeMultipartRequest(validImage()),
      { analyze: async () => { throw new AnalyzerTimeoutError(); } },
    );

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({ error: "AI_TIMEOUT" });
  });

  it("aborts an analysis after 30 seconds and maps it to AI_TIMEOUT", async () => {
    vi.useFakeTimers();
    let analysisStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      analysisStarted = resolve;
    });
    const analyzer: OutfitAnalyzer = {
      analyze: ({ signal }) => {
        analysisStarted?.();
        return new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      },
    };
    const responsePromise = handleRequest(
      makeMultipartRequest(validImage()),
      analyzer,
    );

    await started;
    await vi.advanceTimersByTimeAsync(30_000);
    const response = await responsePromise;
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({ error: "AI_TIMEOUT" });
  });

  it("maps provider failures to AI_UNAVAILABLE", async () => {
    const response = await handleRequest(
      makeMultipartRequest(validImage()),
      { analyze: async () => { throw new AnalyzerUnavailableError(); } },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "AI_UNAVAILABLE" });
  });

  it("maps a missing server-side API key to AI_UNAVAILABLE", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalRateLimitSecret = process.env.RATE_LIMIT_SECRET;
    delete process.env.OPENAI_API_KEY;
    process.env.RATE_LIMIT_SECRET = "unit-test-rate-secret";

    try {
      const response = await defaultPost(
        makeMultipartRequest(validImage()),
      );
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "AI_UNAVAILABLE" });
    } finally {
      if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalApiKey;
      if (originalRateLimitSecret === undefined) delete process.env.RATE_LIMIT_SECRET;
      else process.env.RATE_LIMIT_SECRET = originalRateLimitSecret;
    }
  });

  it("does not log image payloads while handling a request", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await handleRequest(
      makeMultipartRequest(validImage()),
      analyzerReturning(completeAnalysis),
    );

    expect(log).not.toHaveBeenCalled();
  });
});
