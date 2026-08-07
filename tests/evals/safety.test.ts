import { describe, expect, it } from "vitest";

import { OutfitAnalysisSchema } from "@/features/outfit/domain";
import { buildAnalysisPrompt } from "@/features/outfit/prompts";

import { evaluateOutputFeatures, safetyCases } from "./safety-cases";

describe("static safety evaluation coverage", () => {
  it("covers every required safety and image-quality scenario", () => {
    expect(safetyCases).toHaveLength(10);
    expect([...new Set(safetyCases.map((safetyCase) => safetyCase.id))]).toHaveLength(10);
    for (const safetyCase of safetyCases) {
      expect(safetyCase.mustInclude.length).toBeGreaterThan(0);
      expect(safetyCase.mustNotInclude.length).toBeGreaterThan(0);
      expect(safetyCase.futureLiveModelCheck).not.toBe("");
    }
  });

  it("enforces every case's static prompt guard without calling a live model", () => {
    const prompt = buildAnalysisPrompt({ occasion: "casual" });

    for (const safetyCase of safetyCases) {
      for (const phrase of safetyCase.staticPromptPhrases) {
        expect(prompt, safetyCase.id).toContain(phrase);
      }
    }
  });

  it("executes every case's required and forbidden output assertions", () => {
    for (const safetyCase of safetyCases) {
      const compliantStaticExample = safetyCase.mustInclude.join("；");
      expect(evaluateOutputFeatures(safetyCase, compliantStaticExample), safetyCase.id).toEqual([]);

      for (const forbiddenFeature of safetyCase.mustNotInclude) {
        expect(
          evaluateOutputFeatures(
            safetyCase,
            `${compliantStaticExample}；${forbiddenFeature}`,
          ),
          `${safetyCase.id}: ${forbiddenFeature}`,
        ).toContain(`不得包含：${forbiddenFeature}`);
      }

      expect(evaluateOutputFeatures(safetyCase, ""), safetyCase.id).toEqual(
        safetyCase.mustInclude.map((feature) => `必須包含：${feature}`),
      );
    }
  });

  it("accepts a complete analysis only in the fixed contract shape", () => {
    const complete = OutfitAnalysisSchema.safeParse({
      summary: "可見衣物的配色乾淨。",
      strengths: ["上衣輪廓清楚", "鞋子與褲裝搭配一致"],
      occasion_fit: "適合",
      suggestions: [],
      retake_required: false,
      retake_reason: null,
    });

    expect(complete.success).toBe(true);
  });

  it("rejects any outfit evaluation fields when a safety case requires retaking", () => {
    const retakeCase = safetyCases.find((safetyCase) => safetyCase.requiredBranch === "retake");
    expect(retakeCase).toBeDefined();

    const malformedRetake = OutfitAnalysisSchema.safeParse({
      summary: "不應出現的穿搭評價",
      strengths: ["不應出現", "也不應出現"],
      occasion_fit: "適合",
      suggestions: [],
      retake_required: true,
      retake_reason: "衣物細節不清楚，請在明亮處重拍。",
    });

    expect(malformedRetake.success).toBe(false);
  });
});
