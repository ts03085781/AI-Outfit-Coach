// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { createTelemetryHandler } from "@/lib/telemetry-handler";

function request(body: unknown) {
  return new Request("https://coach.example/api/telemetry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://coach.example",
      "sec-fetch-site": "same-origin",
      "x-forwarded-for": "203.0.113.88",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/telemetry", () => {
  it("writes only the parsed allowlisted structured metric", async () => {
    const writeMetric = vi.fn();
    const response = await createTelemetryHandler({ writeMetric })(request({
      type: "analysis_error",
      occasion: "formal",
      latencyBucket: "10-30s",
      errorCode: "AI_TIMEOUT",
    }));

    expect(response.status).toBe(204);
    expect(writeMetric).toHaveBeenCalledWith({
      type: "analysis_error",
      occasion: "formal",
      latencyBucket: "10-30s",
      errorCode: "AI_TIMEOUT",
    });
    expect(JSON.stringify(writeMetric.mock.calls)).not.toContain("203.0.113.88");
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
  ])("accepts an anonymous photo precheck event", async (body) => {
    const writeMetric = vi.fn();
    const response = await createTelemetryHandler({ writeMetric })(request(body));

    expect(response.status).toBe(204);
    expect(writeMetric).toHaveBeenCalledWith(body);
  });

  it.each([
    { type: "feedback", helpful: true, question: "私人內容" },
    { type: "feedback", helpful: true, occasion: "casual" },
    { type: "analysis_error", occasion: "casual", latencyBucket: "0-5s" },
    { type: "analysis_success", occasion: "casual", latencyBucket: "0-5s", errorCode: "AI_TIMEOUT" },
    { type: "photo_check_pass", latencyBucket: "0-5s", photo: "base64" },
    { type: "photo_check_pass", latencyBucket: "0-5s", filename: "look.jpg" },
    { type: "photo_check_pass", latencyBucket: "0-5s", provider: "openai" },
    { type: "photo_check_reject", reason: "UNKNOWN_REASON", latencyBucket: "0-5s" },
    { type: "photo_check_error", errorCode: "UNKNOWN_ERROR", latencyBucket: "0-5s" },
    { type: "photo_check_pass", latencyBucket: "0-5s", occasion: "casual" },
    { type: "photo_check_reject", reason: "NO_PERSON", latencyBucket: "0-5s", errorCode: "PHOTO_CHECK_TIMEOUT" },
    { type: "photo_check_error", errorCode: "PHOTO_CHECK_TIMEOUT", latencyBucket: "0-5s", reason: "NO_PERSON" },
  ])("rejects unsafe or incompatible metric fields", async (body) => {
    const writeMetric = vi.fn();
    const response = await createTelemetryHandler({ writeMetric })(request(body));

    expect(response.status).toBe(400);
    expect(writeMetric).not.toHaveBeenCalled();
  });

  it("rejects cross-site metric injection", async () => {
    const writeMetric = vi.fn();
    const response = await createTelemetryHandler({ writeMetric })(new Request(
      "https://coach.example/api/telemetry",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        },
        body: JSON.stringify({ type: "feedback", helpful: true }),
      },
    ));

    expect(response.status).toBe(403);
    expect(writeMetric).not.toHaveBeenCalled();
  });
});
