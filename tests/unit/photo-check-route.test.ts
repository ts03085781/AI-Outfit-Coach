// @vitest-environment node

import { readFileSync } from "node:fs";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as defaultPost } from "@/app/api/photo-check/route";
import { createPhotoCheckHandler } from "@/features/outfit/photo-check-handler";
import type { PhotoCheckResult } from "@/features/outfit/photo-check";
import type { PhotoChecker } from "@/features/outfit/photo-checker";
import {
  OpenAIPhotoChecker,
  PhotoCheckerProviderError,
  PhotoCheckerTimeoutError,
  type OpenAIPhotoCheckClient,
} from "@/features/outfit/openai-photo-checker";
import { createInMemoryAbuseGuard, type AbuseGuard } from "@/lib/abuse-guard";

const validPng = readFileSync("tests/fixtures/outfit-safe.png");

function makeMultipartRequest(
  image = new Blob([validPng], { type: "image/png" }),
  headers?: HeadersInit,
) {
  const formData = new FormData();
  formData.set("image", image, "outfit-image");
  return new Request("http://localhost/api/photo-check", { method: "POST", body: formData, headers });
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

function checkerReturning(result: PhotoCheckResult): PhotoChecker {
  return { check: async () => result };
}

function checkerThrowing(error: Error): PhotoChecker {
  return { check: async () => { throw error; } };
}

async function responseJson(checker: PhotoChecker) {
  const response = await createPhotoCheckHandler({
    createChecker: () => checker,
    abuseGuard: allowingGuard(),
  })(makeMultipartRequest());
  return { status: response.status, body: await response.json() };
}

function handleRequest(request: Request, checker: PhotoChecker, abuseGuard = allowingGuard()) {
  return createPhotoCheckHandler({ createChecker: () => checker, abuseGuard })(request);
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
    request: new Request("http://localhost/api/photo-check", {
      method: "POST",
      body,
      headers,
      duplex: "half",
    } as RequestInit & { duplex: "half" }),
    wasCancelled: () => cancelled,
  };
}

function makeStalledMultipartRequest() {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });

  return {
    request: new Request("http://localhost/api/photo-check", {
      method: "POST",
      body,
      headers: { "content-type": "multipart/form-data; boundary=stalled" },
      duplex: "half",
    } as RequestInit & { duplex: "half" }),
    wasCancelled: () => cancelled,
  };
}

async function makeDelayedMultipartRequest(delayMs: number) {
  const multipart = makeMultipartRequest();
  const bytes = new Uint8Array(await multipart.arrayBuffer());
  const contentType = multipart.headers.get("content-type");
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      setTimeout(() => {
        controller.enqueue(bytes);
        controller.close();
      }, delayMs);
    },
  });

  return new Request("http://localhost/api/photo-check", {
    method: "POST",
    body,
    headers: { "content-type": contentType ?? "multipart/form-data" },
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("POST /api/photo-check", () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_PHOTO_CHECK_MODEL;
    delete process.env.RATE_LIMIT_SECRET;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns the accepted photo result", async () => {
    expect(await responseJson(checkerReturning({ eligible: true, reason: null })))
      .toEqual({ status: 200, body: { eligible: true, reason: null } });
  });

  it("returns the rejected photo result", async () => {
    expect(await responseJson(checkerReturning({ eligible: false, reason: "TOO_DARK" })))
      .toEqual({ status: 200, body: { eligible: false, reason: "TOO_DARK" } });
  });

  it("returns INVALID_IMAGE when the multipart payload has no image", async () => {
    const formData = new FormData();
    const response = await handleRequest(
      new Request("http://localhost/api/photo-check", { method: "POST", body: formData }),
      checkerReturning({ eligible: true, reason: null }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
  });

  it("rejects unsupported image MIME metadata before calling the checker", async () => {
    const check = vi.fn(async (): Promise<PhotoCheckResult> => ({ eligible: true, reason: null }));
    const response = await handleRequest(
      makeMultipartRequest(new Blob(["image"], { type: "image/gif" })),
      { check },
    );

    expect(response.status).toBe(400);
    expect(check).not.toHaveBeenCalled();
  });

  it("rejects spoofed image MIME metadata before calling the checker", async () => {
    const check = vi.fn(async (): Promise<PhotoCheckResult> => ({ eligible: true, reason: null }));
    const response = await handleRequest(
      makeMultipartRequest(new Blob([validPng], { type: "image/webp" })),
      { check },
    );

    expect(response.status).toBe(400);
    expect(check).not.toHaveBeenCalled();
  });

  it("rejects corrupt image bytes before calling the checker", async () => {
    const check = vi.fn(async (): Promise<PhotoCheckResult> => ({ eligible: true, reason: null }));
    const corruptWebp = new Blob([
      new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
    ], { type: "image/webp" });
    const response = await handleRequest(makeMultipartRequest(corruptWebp), { check });

    expect(response.status).toBe(400);
    expect(check).not.toHaveBeenCalled();
  });

  it("rejects a decodable image with a dimension above 8000 pixels", async () => {
    const check = vi.fn(async (): Promise<PhotoCheckResult> => ({ eligible: true, reason: null }));
    const tooWide = await sharp({
      create: { width: 8001, height: 1, channels: 3, background: "#ffffff" },
    }).png().toBuffer();
    const response = await handleRequest(
      makeMultipartRequest(new Blob([Uint8Array.from(tooWide)], { type: "image/png" })),
      { check },
    );

    expect(response.status).toBe(400);
    expect(check).not.toHaveBeenCalled();
  });

  it("returns INVALID_IMAGE for an image larger than 4 MB", async () => {
    const response = await handleRequest(
      makeMultipartRequest(new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: "image/webp" })),
      checkerReturning({ eligible: true, reason: null }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
  });

  it("returns INVALID_IMAGE when Content-Length exceeds 6 MB", async () => {
    const request = makeMultipartRequest();
    const response = await handleRequest(
      new Request(request, { headers: { "content-length": String(6 * 1024 * 1024 + 1) } }),
      checkerReturning({ eligible: true, reason: null }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
  });

  it.each([undefined, "1"])(
    "rejects and cancels an over-limit multipart stream with Content-Length %s",
    async (contentLength) => {
      const oversized = makeOversizedMultipartRequest(contentLength);
      const response = await handleRequest(
        oversized.request,
        checkerReturning({ eligible: true, reason: null }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
      expect(oversized.wasCancelled()).toBe(true);
    },
  );

  it("returns INVALID_IMAGE for a non-multipart request", async () => {
    const response = await handleRequest(
      new Request("http://localhost/api/photo-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      checkerReturning({ eligible: true, reason: null }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
  });

  it("returns INVALID_IMAGE for a multipart body with a malformed boundary", async () => {
    const response = await handleRequest(
      new Request("http://localhost/api/photo-check", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=expected" },
        body: "--different\\r\\n",
      }),
      checkerReturning({ eligible: true, reason: null }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_IMAGE" });
  });

  it("rejects a cross-site request before buffering or calling the checker", async () => {
    const check = vi.fn(async (): Promise<PhotoCheckResult> => ({ eligible: true, reason: null }));
    const response = await handleRequest(makeMultipartRequest(undefined, {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    }), { check });

    expect(response.status).toBe(403);
    expect(check).not.toHaveBeenCalled();
  });

  it("returns 429 after the photo-check endpoint burst budget", async () => {
    const check = vi.fn(async (): Promise<PhotoCheckResult> => ({ eligible: true, reason: null }));
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

    expect((await handleRequest(makeMultipartRequest(), { check }, abuseGuard)).status).toBe(200);
    const blocked = await handleRequest(makeMultipartRequest(), { check }, abuseGuard);

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("1");
    expect(check).toHaveBeenCalledOnce();
  });

  it("maps a checker timeout to PHOTO_CHECK_TIMEOUT", async () => {
    expect(await responseJson(checkerThrowing(new PhotoCheckerTimeoutError())))
      .toEqual({ status: 504, body: { error: "PHOTO_CHECK_TIMEOUT" } });
  });

  it("times out a stalled multipart body at 10 seconds and releases global concurrency", async () => {
    vi.useFakeTimers();
    const guard = createInMemoryAbuseGuard({ secret: "stalled-body-secret", globalConcurrency: 1 });
    const stalled = makeStalledMultipartRequest();
    const responsePromise = handleRequest(
      stalled.request,
      checkerReturning({ eligible: true, reason: null }),
      guard,
    );

    await vi.advanceTimersByTimeAsync(10_000);
    const response = await Promise.race([responsePromise, Promise.resolve(undefined)]);

    expect(response?.status).toBe(504);
    if (response) await expect(response.json()).resolves.toEqual({ error: "PHOTO_CHECK_TIMEOUT" });
    expect(stalled.wasCancelled()).toBe(true);
    const next = guard.enter(makeMultipartRequest(), "analyze");
    expect(next.allowed).toBe(true);
    if (next.allowed) next.release();
  });

  it("gives the checker only the remaining time in the 10-second request deadline", async () => {
    vi.useFakeTimers();
    let checkStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { checkStarted = resolve; });
    const checker: PhotoChecker = {
      check: ({ signal }) => {
        checkStarted?.();
        return new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      },
    };
    const responsePromise = handleRequest(await makeDelayedMultipartRequest(5_000), checker);

    await vi.advanceTimersByTimeAsync(5_000);
    await started;
    await vi.advanceTimersByTimeAsync(4_999);
    expect(await Promise.race([responsePromise, Promise.resolve(undefined)])).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    const response = await Promise.race([responsePromise, Promise.resolve(undefined)]);

    expect(response?.status).toBe(504);
    if (response) await expect(response.json()).resolves.toEqual({ error: "PHOTO_CHECK_TIMEOUT" });
  });

  it("keeps an invalid-output retry inside the same 10-second route deadline", async () => {
    vi.useFakeTimers();
    process.env.OPENAI_PHOTO_CHECK_MODEL = "photo-check-test-model";
    const signals: Array<AbortSignal | undefined> = [];
    let firstCallStarted: (() => void) | undefined;
    let secondCallStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => { firstCallStarted = resolve; });
    const secondStarted = new Promise<void>((resolve) => { secondCallStarted = resolve; });
    const client: OpenAIPhotoCheckClient = {
      responses: {
        create: (_request, options) => {
          const signal = options?.signal;
          signals.push(signal);
          if (signals.length === 1) {
            firstCallStarted?.();
            return new Promise((resolve) => {
              setTimeout(() => resolve({ output_text: "not-json" }), 9_000);
            });
          }

          secondCallStarted?.();
          return new Promise((_, reject) => {
            const rejectAborted = () => reject(new DOMException("aborted", "AbortError"));
            if (signal?.aborted) rejectAborted();
            else signal?.addEventListener("abort", rejectAborted, { once: true });
          });
        },
      },
    };
    const checker = new OpenAIPhotoChecker(client);
    const responsePromise = handleRequest(makeMultipartRequest(), checker);

    await firstStarted;
    await vi.advanceTimersByTimeAsync(9_000);
    await secondStarted;
    expect(signals).toHaveLength(2);
    expect(signals[0]).toBeDefined();
    expect(signals[1]).toBe(signals[0]);

    let settled = false;
    void responsePromise.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const response = await responsePromise;
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({ error: "PHOTO_CHECK_TIMEOUT" });
    expect(signals).toHaveLength(2);
  });

  it("aborts the checker after 10 seconds and maps it to PHOTO_CHECK_TIMEOUT", async () => {
    vi.useFakeTimers();
    let checkStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { checkStarted = resolve; });
    const checker: PhotoChecker = {
      check: ({ signal }) => {
        checkStarted?.();
        return new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      },
    };
    const responsePromise = handleRequest(makeMultipartRequest(), checker);

    await started;
    await vi.advanceTimersByTimeAsync(10_000);
    const response = await responsePromise;
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({ error: "PHOTO_CHECK_TIMEOUT" });
  });

  it.each([
    new PhotoCheckerProviderError("PHOTO_CHECK_AUTHORIZATION", 401, "req_authorization"),
    new PhotoCheckerProviderError("PHOTO_CHECK_RATE_LIMITED", 429, "req_rate_limit"),
    new PhotoCheckerProviderError("PHOTO_CHECK_REFUSED"),
    new PhotoCheckerProviderError("PHOTO_CHECK_INVALID_RESPONSE"),
    new PhotoCheckerProviderError("PHOTO_CHECK_UNAVAILABLE"),
  ])("maps provider failures to PHOTO_CHECK_UNAVAILABLE", async (error) => {
    expect(await responseJson(checkerThrowing(error)))
      .toEqual({ status: 503, body: { error: "PHOTO_CHECK_UNAVAILABLE" } });
  });

  it.each([
    ["API key", undefined, "photo-check-test-model"],
    ["model", "photo-check-test-key", undefined],
  ])("maps a missing %s in the default route to PHOTO_CHECK_UNAVAILABLE", async (_missing, apiKey, model) => {
    process.env.RATE_LIMIT_SECRET = `default-route-rate-secret-${_missing}`;
    if (apiKey) process.env.OPENAI_API_KEY = apiKey;
    if (model) process.env.OPENAI_PHOTO_CHECK_MODEL = model;
    const response = await defaultPost(makeMultipartRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "PHOTO_CHECK_UNAVAILABLE" });
  });

  it.each([
    ["a valid response", makeMultipartRequest(), checkerReturning({ eligible: true, reason: null })],
    ["an invalid image", new Request("http://localhost/api/photo-check", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }), checkerReturning({ eligible: true, reason: null })],
    ["a timeout", makeMultipartRequest(), checkerThrowing(new PhotoCheckerTimeoutError())],
    ["a provider failure", makeMultipartRequest(), checkerThrowing(new PhotoCheckerProviderError("PHOTO_CHECK_UNAVAILABLE"))],
  ] as const)("releases global concurrency after %s", async (_caseName, request, checker) => {
    const guard = createInMemoryAbuseGuard({ secret: "release-test-secret", globalConcurrency: 1 });
    await handleRequest(request, checker, guard);

    const next = guard.enter(makeMultipartRequest(), "analyze");
    expect(next.allowed).toBe(true);
    if (next.allowed) next.release();
  });
});
