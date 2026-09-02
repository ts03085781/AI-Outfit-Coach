// @vitest-environment node

import { readFileSync } from "node:fs";
import type { User } from "@supabase/supabase-js";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OutfitAnalyzer } from "@/features/outfit/analyzer";
import {
  QuotaUnavailableError,
  type AnalysisQuotaService,
} from "@/features/outfit/analysis-quota";
import {
  AnalyzerProviderError,
  AnalyzerSafetyError,
  AnalyzerTimeoutError,
  AnalyzerUnavailableError,
} from "@/features/outfit/openai-analyzer";
import { createAuthenticatedAnalyzeRoute } from "@/features/outfit/authenticated-analyze-route";
import { createAnalyzeHandler } from "@/features/outfit/analyze-handler";
import { createInMemoryAbuseGuard, type AbuseGuard } from "@/lib/abuse-guard";

const completeAnalysis = {
  summary: "整體俐落。",
  strengths: ["配色協調", "比例清楚"],
  occasion_fit: "good" as const,
  suggestions: [],
  retake_required: false as const,
  retake_reason: null,
};

const quotaSummary = {
  limit: 3 as const,
  used: 1,
  remaining: 2,
  resetAt: "2026-09-01T16:00:00.000Z",
};

function allowingQuotaService(overrides: Partial<AnalysisQuotaService> = {}): AnalysisQuotaService {
  return {
    get: vi.fn(async () => quotaSummary),
    reserve: vi.fn(async (_userId, reservationId) => ({
      status: "reserved" as const,
      reservationId,
      quota: { ...quotaSummary, used: 0, remaining: 3 },
    })),
    complete: vi.fn(async () => quotaSummary),
    release: vi.fn(async () => undefined),
    ...overrides,
  };
}

const validPng = readFileSync("tests/fixtures/outfit-safe.png");

function validImage(type = "image/png") {
  return new Blob([validPng], { type });
}

function makeMultipartRequest(image: Blob, occasion = "casual", headers?: HeadersInit, locale = "zh-TW") {
  const formData = new FormData();
  formData.set("image", image, "outfit-image");
  formData.set("occasion", occasion);
  formData.set("locale", locale);
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
      photoCheck: {
        burst: { limit: 100, windowMs: 1_000 },
        sustained: { limit: 100, windowMs: 10_000 },
      },
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

function handleRequest(
  request: Request,
  analyzer: OutfitAnalyzer,
  abuseGuard = allowingGuard(),
  quotaService = allowingQuotaService(),
  userId = "user-1",
) {
  return createAnalyzeHandler({
    createAnalyzer: () => analyzer,
    abuseGuard,
    quotaService,
    issueAnalysisToken: () => "signed-analysis-token",
  })(request, userId);
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

  it("returns AUTH_REQUIRED before processing an unauthenticated request", async () => {
    const response = await createAuthenticatedAnalyzeRoute(async () => null)(
      makeMultipartRequest(validImage()),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "AUTH_REQUIRED" });
  });

  it("returns a complete analysis for a valid multipart image", async () => {
    const response = await handleRequest(
      makeMultipartRequest(validImage()),
      analyzerReturning(completeAnalysis),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      analysis: completeAnalysis,
      analysisToken: "signed-analysis-token",
      quota: quotaSummary,
    });
  });

  it("uses the verified authenticated user ID for quota reservation", async () => {
    const originalRateLimitSecret = process.env.RATE_LIMIT_SECRET;
    process.env.RATE_LIMIT_SECRET = "verified-user-test-secret";
    const reserve = vi.fn(async (_userId: string, reservationId: string) => ({
      status: "reserved" as const,
      reservationId,
      quota: { ...quotaSummary, used: 0, remaining: 3 },
    }));
    const quotaService = allowingQuotaService({ reserve });
    try {
      const response = await createAuthenticatedAnalyzeRoute(
        async () => ({ id: "verified-user" } as User),
        quotaService,
      )(makeMultipartRequest(validImage()));

      expect(response.status).toBe(503);
      expect(reserve).toHaveBeenCalledWith("verified-user", expect.any(String));
    } finally {
      if (originalRateLimitSecret === undefined) delete process.env.RATE_LIMIT_SECRET;
      else process.env.RATE_LIMIT_SECRET = originalRateLimitSecret;
    }
  });

  it.each([
    ["missing image", (() => {
      const formData = new FormData();
      formData.set("occasion", "casual");
      formData.set("locale", "zh-TW");
      return new Request("http://localhost/api/analyze", { method: "POST", body: formData });
    })()],
    ["oversized body", makeOversizedMultipartRequest().request],
    ["undecodable image", makeMultipartRequest(new Blob(["not-an-image"], { type: "image/png" }))],
  ])("does not reserve quota for %s", async (_case, request) => {
    const quotaService = allowingQuotaService();
    const response = await handleRequest(
      request,
      analyzerReturning(completeAnalysis),
      allowingGuard(),
      quotaService,
    );

    expect(response.status).toBe(400);
    expect(quotaService.reserve).not.toHaveBeenCalled();
  });

  it("returns the daily limit response without calling the analyzer", async () => {
    const analyze = vi.fn(async () => completeAnalysis);
    const quotaService = allowingQuotaService({
      reserve: vi.fn(async () => ({ status: "daily_limit_reached" as const, quota: {
        ...quotaSummary,
        used: 3,
        remaining: 0,
      } })),
    });
    const response = await handleRequest(
      makeMultipartRequest(validImage()),
      { analyze },
      allowingGuard(),
      quotaService,
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "DAILY_ANALYSIS_LIMIT_REACHED",
      limit: 3,
      used: 3,
      remaining: 0,
      resetAt: "2026-09-01T16:00:00.000Z",
    });
    expect(analyze).not.toHaveBeenCalled();
  });

  it("returns slots busy without calling the analyzer", async () => {
    const analyze = vi.fn(async () => completeAnalysis);
    const quotaService = allowingQuotaService({
      reserve: vi.fn(async () => ({ status: "slots_busy" as const, quota: quotaSummary })),
    });
    const response = await handleRequest(
      makeMultipartRequest(validImage()),
      { analyze },
      allowingGuard(),
      quotaService,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "ANALYSIS_SLOTS_BUSY" });
    expect(analyze).not.toHaveBeenCalled();
  });

  it("fails closed when quota reservation is unavailable", async () => {
    const analyze = vi.fn(async () => completeAnalysis);
    const quotaService = allowingQuotaService({
      reserve: vi.fn(async () => { throw new QuotaUnavailableError(); }),
    });
    const response = await handleRequest(
      makeMultipartRequest(validImage()),
      { analyze },
      allowingGuard(),
      quotaService,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "QUOTA_UNAVAILABLE" });
    expect(analyze).not.toHaveBeenCalled();
  });

  it("prepares the token before completing quota and only then delivers a valid result", async () => {
    const events: string[] = [];
    const quotaService = allowingQuotaService({
      reserve: vi.fn(async (_userId, reservationId) => {
        events.push("reserve");
        return {
          status: "reserved" as const,
          reservationId,
          quota: { ...quotaSummary, used: 0, remaining: 3 },
        };
      }),
      complete: vi.fn(async () => {
        events.push("complete");
        return quotaSummary;
      }),
    });
    const response = await createAnalyzeHandler({
      createAnalyzer: () => ({ analyze: async () => {
        events.push("analyze");
        return completeAnalysis;
      } }),
      abuseGuard: allowingGuard(),
      quotaService,
      issueAnalysisToken: () => {
        events.push("issue-token");
        return "signed-analysis-token";
      },
    })(makeMultipartRequest(validImage()), "user-1");

    expect(response.status).toBe(200);
    expect(events).toEqual(["reserve", "analyze", "issue-token", "complete"]);
    const reservationId = vi.mocked(quotaService.reserve).mock.calls[0]?.[1];
    expect(reservationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(quotaService.complete).toHaveBeenCalledWith("user-1", reservationId);
    expect(quotaService.release).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      analysis: completeAnalysis,
      analysisToken: "signed-analysis-token",
      quota: quotaSummary,
    });
  });

  it("forwards strictly validated optional context to the analyzer", async () => {
    const analyze = vi.fn(async () => completeAnalysis);
    const formData = new FormData();
    formData.set("image", validImage(), "outfit.png");
    formData.set("occasion", "work");
    formData.set("locale", "ja");
    formData.set("weather", "rainy");
    formData.set("setting", "mixed");
    formData.set("desiredFeel", "  專業但親切  ");

    const response = await handleRequest(
      new Request("http://localhost/api/analyze", { method: "POST", body: formData }),
      { analyze },
    );

    expect(response.status).toBe(200);
    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({
      occasion: "work",
      weather: "rainy",
      setting: "mixed",
      desiredFeel: "專業但親切",
      locale: "ja",
    }));
  });

  it("rejects invalid optional context before calling the analyzer", async () => {
    const analyze = vi.fn(async () => completeAnalysis);
    const formData = new FormData();
    formData.set("image", validImage(), "outfit.png");
    formData.set("occasion", "casual");
    formData.set("weather", "stormy");

    const response = await handleRequest(
      new Request("http://localhost/api/analyze", { method: "POST", body: formData }),
      { analyze },
    );

    expect(response.status).toBe(400);
    expect(analyze).not.toHaveBeenCalled();
  });

  it("rejects an unsupported locale before calling the analyzer", async () => {
    const analyze = vi.fn(async () => completeAnalysis);
    const response = await handleRequest(
      makeMultipartRequest(validImage(), "casual", undefined, "zh-Hant"),
      { analyze },
    );

    expect(response.status).toBe(400);
    expect(analyze).not.toHaveBeenCalled();
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
        photoCheck: {
          burst: { limit: 1, windowMs: 1_000 },
          sustained: { limit: 2, windowMs: 10_000 },
        },
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
    const release = vi.fn(async () => undefined);
    const response = await handleRequest(
      makeMultipartRequest(validImage()),
      analyzerReturning({ retake_required: true, retake_reason: "衣物細節不清楚" }),
      allowingGuard(),
      allowingQuotaService({ release }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "RETAKE_REQUIRED",
      retake_reason: "衣物細節不清楚",
    });
    expect(release).toHaveBeenCalledOnce();
  });

  it.each([
    ["timeout", new AnalyzerTimeoutError(), 504, "AI_TIMEOUT"],
    ["unavailable", new AnalyzerUnavailableError(), 503, "AI_UNAVAILABLE"],
    ["provider", new AnalyzerProviderError("AI_AUTHORIZATION", 401, "req_auth"), 503, "AI_AUTHORIZATION"],
    ["safety", new AnalyzerSafetyError(), 502, "AI_SAFETY_REJECTED"],
    ["abort", new DOMException("aborted", "AbortError"), 504, "AI_TIMEOUT"],
    ["unexpected", new Error("unexpected"), 503, "AI_UNAVAILABLE"],
  ])("releases quota after an analyzer %s failure", async (_case, analyzerError, status, errorCode) => {
    if (analyzerError instanceof AnalyzerProviderError) {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
    }
    const release = vi.fn(async () => undefined);
    const response = await handleRequest(
      makeMultipartRequest(validImage()),
      { analyze: async () => { throw analyzerError; } },
      allowingGuard(),
      allowingQuotaService({ release }),
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: errorCode });
    expect(release).toHaveBeenCalledWith("user-1", expect.any(String));
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not deliver the prepared analysis or token when quota completion fails", async () => {
    const issueAnalysisToken = vi.fn(() => "signed-analysis-token");
    const release = vi.fn(async () => undefined);
    const response = await createAnalyzeHandler({
      createAnalyzer: () => analyzerReturning(completeAnalysis),
      abuseGuard: allowingGuard(),
      quotaService: allowingQuotaService({
        complete: vi.fn(async () => { throw new QuotaUnavailableError(); }),
        release,
      }),
      issueAnalysisToken,
    })(makeMultipartRequest(validImage()), "user-1");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "QUOTA_UNAVAILABLE" });
    expect(issueAnalysisToken).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it("releases the reservation without consuming quota when token issuance fails", async () => {
    const complete = vi.fn(async () => quotaSummary);
    const release = vi.fn(async () => undefined);
    const response = await createAnalyzeHandler({
      createAnalyzer: () => analyzerReturning(completeAnalysis),
      abuseGuard: allowingGuard(),
      quotaService: allowingQuotaService({ complete, release }),
      issueAnalysisToken: () => { throw new Error("missing token secret"); },
    })(makeMultipartRequest(validImage()), "user-1");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "AI_UNAVAILABLE" });
    expect(complete).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith("user-1", expect.any(String));
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not let a release failure replace the analyzer response", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await handleRequest(
      makeMultipartRequest(validImage()),
      { analyze: async () => { throw new AnalyzerSafetyError(); } },
      allowingGuard(),
      allowingQuotaService({
        release: vi.fn(async () => { throw new QuotaUnavailableError(); }),
      }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "AI_SAFETY_REJECTED" });
    expect(error).toHaveBeenCalledWith("analysis_quota_cleanup_failure", { stage: "release" });
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

  it("returns an allowlisted authorization code without provider details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await handleRequest(
      makeMultipartRequest(validImage()),
      {
        analyze: async () => {
          throw new AnalyzerProviderError("AI_AUTHORIZATION", 401, "req_authorization");
        },
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "AI_AUTHORIZATION" });
  });

  it("logs only allowlisted provider diagnostic fields", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await handleRequest(
      makeMultipartRequest(validImage()),
      {
        analyze: async () => {
          throw new AnalyzerProviderError("AI_RATE_LIMITED", 429, "req_rate_limit");
        },
      },
    );

    expect(error).toHaveBeenCalledWith("outfit_analysis_failure", {
      stage: "provider",
      errorCode: "AI_RATE_LIMITED",
      providerStatus: 429,
      requestId: "req_rate_limit",
    });
  });

  it("fails closed when deterministic output safety rejects the analysis", async () => {
    const response = await handleRequest(
      makeMultipartRequest(validImage()),
      { analyze: async () => { throw new AnalyzerSafetyError(); } },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "AI_SAFETY_REJECTED" });
  });

  it("maps a missing server-side API key to AI_UNAVAILABLE", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalRateLimitSecret = process.env.RATE_LIMIT_SECRET;
    const originalTokenSecret = process.env.ANALYSIS_TOKEN_SECRET;
    delete process.env.OPENAI_API_KEY;
    process.env.RATE_LIMIT_SECRET = "unit-test-rate-secret";
    process.env.ANALYSIS_TOKEN_SECRET = "unit-test-analysis-secret";

    try {
      const response = await createAuthenticatedAnalyzeRoute(
        async () => ({ id: "user-1" } as User),
        allowingQuotaService(),
      )(
        makeMultipartRequest(validImage()),
      );
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "AI_UNAVAILABLE" });
    } finally {
      if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalApiKey;
      if (originalRateLimitSecret === undefined) delete process.env.RATE_LIMIT_SECRET;
      else process.env.RATE_LIMIT_SECRET = originalRateLimitSecret;
      if (originalTokenSecret === undefined) delete process.env.ANALYSIS_TOKEN_SECRET;
      else process.env.ANALYSIS_TOKEN_SECRET = originalTokenSecret;
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
