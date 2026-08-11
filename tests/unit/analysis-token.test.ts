// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createAnalysisTokenService } from "@/features/outfit/analysis-token";
import type { OutfitAnalysis } from "@/features/outfit/domain";

const analysis: OutfitAnalysis = {
  summary: "整體俐落。",
  strengths: ["配色協調", "比例清楚"],
  occasion_fit: "good",
  suggestions: [],
  retake_required: false,
  retake_reason: null,
};

describe("analysis token", () => {
  it("verifies a short-lived stateless HMAC token for the issued analysis", () => {
    let now = 1_000;
    const service = createAnalysisTokenService({
      secret: "analysis-token-secret",
      now: () => now,
      ttlMs: 60_000,
    });

    const token = service.issue(analysis);

    expect(service.verify(analysis, token)).toBe(true);
    expect(token).not.toContain(analysis.summary);
    now = 61_001;
    expect(service.verify(analysis, token)).toBe(false);
  });

  it("rejects a token when any analysis content is changed", () => {
    const service = createAnalysisTokenService({ secret: "analysis-token-secret" });
    const token = service.issue(analysis);

    expect(service.verify({ ...analysis, summary: "偽造內容" }, token)).toBe(false);
  });

  it("rejects malformed tokens without throwing", () => {
    const service = createAnalysisTokenService({ secret: "analysis-token-secret" });

    expect(service.verify(analysis, "not-a-token")).toBe(false);
  });
});
