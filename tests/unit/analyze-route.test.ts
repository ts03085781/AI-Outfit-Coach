// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import type { OutfitAnalyzer } from "@/features/outfit/analyzer";
import {
  AnalyzerTimeoutError,
  AnalyzerUnavailableError,
} from "@/features/outfit/openai-analyzer";
import { POST } from "@/app/api/analyze/route";

const completeAnalysis = {
  summary: "整體俐落。",
  strengths: ["配色協調", "比例清楚"],
  occasion_fit: "適合" as const,
  suggestions: [],
  retake_required: false as const,
  retake_reason: null,
};

function makeMultipartRequest(image: Blob, occasion = "casual") {
  const formData = new FormData();
  formData.set("image", image, "outfit.webp");
  formData.set("occasion", occasion);
  return new Request("http://localhost/api/analyze", { method: "POST", body: formData });
}

function analyzerReturning(result: Awaited<ReturnType<OutfitAnalyzer["analyze"]>>): OutfitAnalyzer {
  return { analyze: async () => result };
}

describe("POST /api/analyze", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns a complete analysis for a valid multipart image", async () => {
    const response = await POST(
      makeMultipartRequest(new Blob(["image"], { type: "image/webp" })),
      analyzerReturning(completeAnalysis),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ occasion_fit: "適合" });
  });

  it("returns INVALID_IMAGE when the multipart payload has no image", async () => {
    const formData = new FormData();
    formData.set("occasion", "casual");
    const response = await POST(
      new Request("http://localhost/api/analyze", { method: "POST", body: formData }),
      analyzerReturning(completeAnalysis),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
  });

  it("returns INVALID_IMAGE for an unsupported image type", async () => {
    const response = await POST(
      makeMultipartRequest(new Blob(["image"], { type: "image/gif" })),
      analyzerReturning(completeAnalysis),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
  });

  it("returns INVALID_IMAGE for an image larger than 4 MB", async () => {
    const response = await POST(
      makeMultipartRequest(new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: "image/webp" })),
      analyzerReturning(completeAnalysis),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
  });

  it("returns INVALID_IMAGE when the Content-Length exceeds 6 MB", async () => {
    const request = makeMultipartRequest(new Blob(["image"], { type: "image/webp" }));
    const response = await POST(
      new Request(request, { headers: { "content-length": String(6 * 1024 * 1024 + 1) } }),
      analyzerReturning(completeAnalysis),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
  });

  it("returns RETAKE_REQUIRED when the analysis requires a new photo", async () => {
    const response = await POST(
      makeMultipartRequest(new Blob(["image"], { type: "image/webp" })),
      analyzerReturning({ retake_required: true, retake_reason: "衣物細節不清楚" }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "RETAKE_REQUIRED",
      retake_reason: "衣物細節不清楚",
    });
  });

  it("maps an aborted analysis to AI_TIMEOUT", async () => {
    const response = await POST(
      makeMultipartRequest(new Blob(["image"], { type: "image/webp" })),
      { analyze: async () => { throw new AnalyzerTimeoutError(); } },
    );

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({ error: "AI_TIMEOUT" });
  });

  it("aborts an analysis after 30 seconds and maps it to AI_TIMEOUT", async () => {
    vi.useFakeTimers();
    const analyzer: OutfitAnalyzer = {
      analyze: ({ signal }) => new Promise((_, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    };
    const responsePromise = POST(
      makeMultipartRequest(new Blob(["image"], { type: "image/webp" })),
      analyzer,
    );

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30_000);
    const response = await responsePromise;
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({ error: "AI_TIMEOUT" });
  });

  it("maps provider failures to AI_UNAVAILABLE", async () => {
    const response = await POST(
      makeMultipartRequest(new Blob(["image"], { type: "image/webp" })),
      { analyze: async () => { throw new AnalyzerUnavailableError(); } },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "AI_UNAVAILABLE" });
  });

  it("maps a missing server-side API key to AI_UNAVAILABLE", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const response = await POST(
        makeMultipartRequest(new Blob(["image"], { type: "image/webp" })),
      );
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "AI_UNAVAILABLE" });
    } finally {
      if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it("does not log image payloads while handling a request", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await POST(
      makeMultipartRequest(new Blob(["private image"], { type: "image/webp" })),
      analyzerReturning(completeAnalysis),
    );

    expect(log).not.toHaveBeenCalled();
  });
});
