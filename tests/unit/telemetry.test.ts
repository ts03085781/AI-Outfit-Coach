import { afterEach, describe, expect, it, vi } from "vitest";

import { track } from "@/lib/telemetry";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("track", () => {
  it("posts a strict whitelisted analysis outcome to the first-party endpoint", () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);

    track({
      type: "analysis_success",
      occasion: "casual",
      latencyBucket: "5-10s",
    });

    expect(fetch).toHaveBeenCalledWith("/api/telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "analysis_success",
        occasion: "casual",
        latencyBucket: "5-10s",
      }),
      keepalive: true,
    });
  });

  it.each([
    { type: "photo_check_pass", latencyBucket: "0-5s" },
    {
      type: "photo_check_reject",
      reason: "INCOMPLETE_OUTFIT",
      latencyBucket: "0-5s",
    },
    {
      type: "photo_check_error",
      errorCode: "PHOTO_CHECK_TIMEOUT",
      latencyBucket: "10-30s",
    },
  ])("posts a strict anonymous photo precheck event", (event) => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);

    track(event as never);

    expect(fetch).toHaveBeenCalledWith("/api/telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    });
  });

  it.each([
    { type: "feedback", helpful: true, occasion: "casual" },
    { type: "analysis_error", occasion: "casual", latencyBucket: "0-5s" },
    { type: "analysis_retake", occasion: "casual", latencyBucket: "0-5s", helpful: false },
    { type: "analysis_success", occasion: "casual", latencyBucket: "0-5s", photo: "base64" },
    { type: "photo_check_pass", latencyBucket: "0-5s", photo: "base64" },
    { type: "photo_check_pass", latencyBucket: "0-5s", filename: "look.jpg" },
    { type: "photo_check_pass", latencyBucket: "0-5s", provider: "openai" },
    { type: "photo_check_reject", reason: "UNKNOWN_REASON", latencyBucket: "0-5s" },
    { type: "photo_check_error", errorCode: "UNKNOWN_ERROR", latencyBucket: "0-5s" },
    { type: "photo_check_pass", latencyBucket: "0-5s", occasion: "casual" },
    { type: "photo_check_reject", reason: "NO_PERSON", latencyBucket: "0-5s", errorCode: "PHOTO_CHECK_TIMEOUT" },
    { type: "photo_check_error", errorCode: "PHOTO_CHECK_TIMEOUT", latencyBucket: "0-5s", reason: "NO_PERSON" },
  ])("rejects an invalid event-field combination before transport", (event) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    expect(() => track(event as never)).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not block or throw when telemetry transport fails", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetch);

    expect(() => track({ type: "feedback", helpful: true })).not.toThrow();
    await Promise.resolve();
  });
});
