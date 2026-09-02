import { describe, expect, it } from "vitest";

import {
  AnalyzeRequestSchema,
  AnalyzeSuccessResponseSchema,
  LocaleSchema,
  OccasionSchema,
  OutfitAnalysisSchema,
  SettingSchema,
  WeatherSchema,
} from "@/features/outfit/domain";

const validSuccessResponse = {
  analysis: {
    summary: "整體俐落。",
    strengths: ["配色協調", "比例清楚"],
    occasion_fit: "good" as const,
    suggestions: [],
    retake_required: false as const,
    retake_reason: null,
  },
  analysisToken: "signed-analysis-token",
  quota: {
    limit: 3 as const,
    used: 1,
    remaining: 2,
    resetAt: "2026-09-01T16:00:00.000Z",
  },
};

describe("outfit domain contract", () => {
  it("accepts a successful response with a consistent daily quota summary", () => {
    expect(AnalyzeSuccessResponseSchema.parse(validSuccessResponse)).toEqual(validSuccessResponse);
  });

  it.each([
    ["a different limit", { limit: 4 }],
    ["inconsistent counts", { used: 2, remaining: 2 }],
    ["a negative count", { used: -1, remaining: 4 }],
    ["an invalid reset timestamp", { resetAt: "tomorrow" }],
    ["an extra field", { reserved: 1 }],
  ])("rejects a successful response with %s", (_case, quotaPatch) => {
    expect(() => AnalyzeSuccessResponseSchema.parse({
      ...validSuccessResponse,
      quota: { ...validSuccessResponse.quota, ...quotaPatch },
    })).toThrow();
  });

  it("accepts a complete analysis with exactly two strengths", () => {
    const result = OutfitAnalysisSchema.parse({
      summary: "整體俐落。",
      strengths: ["配色協調", "比例清楚"],
      occasion_fit: "good",
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

  it("only accepts supported occasions and locales in an analysis request", () => {
    expect(OccasionSchema.parse("work")).toBe("work");
    expect(LocaleSchema.parse("zh-TW")).toBe("zh-TW");
    expect(LocaleSchema.parse("en")).toBe("en");
    expect(() => AnalyzeRequestSchema.parse({ occasion: "party", locale: "zh-TW" })).toThrow();
    expect(() => AnalyzeRequestSchema.parse({ occasion: "work", locale: "zh-Hant" })).toThrow();
  });

  it("accepts bounded optional weather, setting, and trimmed desired feel", () => {
    expect(AnalyzeRequestSchema.parse({
      occasion: "work",
      locale: "ja",
      weather: "rainy",
      setting: "mixed",
      desiredFeel: "  專業但親切  ",
    })).toEqual({
      occasion: "work",
      locale: "ja",
      weather: "rainy",
      setting: "mixed",
      desiredFeel: "專業但親切",
    });
    expect(WeatherSchema.parse("hot")).toBe("hot");
    expect(SettingSchema.parse("outdoor")).toBe("outdoor");
  });

  it("rejects invalid or oversized optional context", () => {
    expect(() => AnalyzeRequestSchema.parse({ occasion: "casual", locale: "zh-TW", weather: "storm" })).toThrow();
    expect(() => AnalyzeRequestSchema.parse({ occasion: "casual", locale: "zh-TW", setting: "office" })).toThrow();
    expect(() => AnalyzeRequestSchema.parse({
      occasion: "casual",
      locale: "zh-TW",
      desiredFeel: "字".repeat(61),
    })).toThrow();
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
        occasion_fit: "good",
        suggestions: [],
        retake_required: false,
        retake_reason: "衣物細節不清楚",
      }),
    ).toThrow();
  });

  it("accepts analysis text at every forwarding limit", () => {
    expect(() => OutfitAnalysisSchema.parse({
      summary: "s".repeat(280),
      strengths: ["a".repeat(160), "b".repeat(160)],
      occasion_fit: "good",
      suggestions: [{
        action: "a".repeat(160),
        reason: "r".repeat(240),
        expected_effect: "e".repeat(240),
      }],
      retake_required: false,
      retake_reason: null,
    })).not.toThrow();
    expect(() => OutfitAnalysisSchema.parse({
      retake_required: true,
      retake_reason: "r".repeat(240),
    })).not.toThrow();
  });

  it.each([
    ["summary", { summary: "s".repeat(281) }],
    ["strength", { strengths: ["a".repeat(161), "比例清楚"] }],
    ["suggestion action", { suggestions: [{ action: "a".repeat(161), reason: "原因", expected_effect: "效果" }] }],
    ["suggestion reason", { suggestions: [{ action: "動作", reason: "r".repeat(241), expected_effect: "效果" }] }],
    ["suggestion expected effect", { suggestions: [{ action: "動作", reason: "原因", expected_effect: "e".repeat(241) }] }],
  ])("rejects a %s above its forwarding limit", (_field, invalidFields) => {
    expect(() => OutfitAnalysisSchema.parse({
      summary: "整體俐落。",
      strengths: ["配色協調", "比例清楚"],
      occasion_fit: "good",
      suggestions: [],
      retake_required: false,
      retake_reason: null,
      ...invalidFields,
    })).toThrow();
  });

  it("rejects a retake reason above its forwarding limit", () => {
    expect(() => OutfitAnalysisSchema.parse({
      retake_required: true,
      retake_reason: "r".repeat(241),
    })).toThrow();
  });
});
