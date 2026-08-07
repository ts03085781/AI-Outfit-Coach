import { describe, expect, it } from "vitest";

import {
  AnalyzeRequestSchema,
  OccasionSchema,
  OutfitAnalysisSchema,
} from "@/features/outfit/domain";

describe("outfit domain contract", () => {
  it("accepts a complete analysis with exactly two strengths", () => {
    expect(
      OutfitAnalysisSchema.parse({
        summary: "整體俐落。",
        strengths: ["配色協調", "比例清楚"],
        occasion_fit: "適合",
        suggestions: [],
        retake_required: false,
        retake_reason: null,
      }).strengths,
    ).toHaveLength(2);
  });

  it("rejects an analysis with fewer than two strengths", () => {
    expect(() =>
      OutfitAnalysisSchema.parse({ strengths: ["只有一項"] }),
    ).toThrow();
  });

  it("only accepts supported occasions in an analysis request", () => {
    expect(OccasionSchema.parse("work")).toBe("work");
    expect(() => AnalyzeRequestSchema.parse({ occasion: "party" })).toThrow();
  });

  it("rejects suggestions when a retake is required", () => {
    expect(() =>
      OutfitAnalysisSchema.parse({
        summary: "照片不足。",
        strengths: ["光線均勻", "人物置中"],
        occasion_fit: "稍需調整",
        suggestions: [
          { action: "調整站位", reason: "更清楚", expected_effect: "便於判讀" },
        ],
        retake_required: true,
        retake_reason: "衣物細節不清楚",
      }),
    ).toThrow("重拍時不得提供建議");
  });
});
