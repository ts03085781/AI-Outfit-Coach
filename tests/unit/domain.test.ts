import { describe, expect, it } from "vitest";

import {
  AnalyzeRequestSchema,
  OccasionSchema,
  OutfitAnalysisSchema,
} from "@/features/outfit/domain";

describe("outfit domain contract", () => {
  it("accepts a complete analysis with exactly two strengths", () => {
    const result = OutfitAnalysisSchema.parse({
      summary: "整體俐落。",
      strengths: ["配色協調", "比例清楚"],
      occasion_fit: "適合",
      suggestions: [],
      retake_required: false,
      retake_reason: null,
    });

    if (result.retake_required) {
      throw new Error("預期為正常分析結果");
    }

    expect(result.strengths).toHaveLength(2);
  });

  it("accepts a retake result that contains only a non-empty reason", () => {
    expect(
      OutfitAnalysisSchema.parse({
        retake_required: true,
        retake_reason: "衣物細節不清楚",
      }),
    ).toEqual({
      retake_required: true,
      retake_reason: "衣物細節不清楚",
    });
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

  it("rejects a retake result without a reason", () => {
    expect(() =>
      OutfitAnalysisSchema.parse({
        retake_required: true,
        retake_reason: null,
      }),
    ).toThrow();
  });

  it("rejects analysis fields when a retake is required", () => {
    expect(() =>
      OutfitAnalysisSchema.parse({
        retake_required: true,
        retake_reason: "衣物細節不清楚",
        summary: "照片不足。",
      }),
    ).toThrow();
  });

  it("rejects a normal result with a retake reason", () => {
    expect(() =>
      OutfitAnalysisSchema.parse({
        summary: "整體俐落。",
        strengths: ["配色協調", "比例清楚"],
        occasion_fit: "適合",
        suggestions: [],
        retake_required: false,
        retake_reason: "衣物細節不清楚",
      }),
    ).toThrow();
  });
});
