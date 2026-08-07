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
    { type: "feedback", helpful: true, occasion: "casual" },
    { type: "analysis_error", occasion: "casual", latencyBucket: "0-5s" },
    { type: "analysis_retake", occasion: "casual", latencyBucket: "0-5s", helpful: false },
    { type: "analysis_success", occasion: "casual", latencyBucket: "0-5s", photo: "base64" },
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
