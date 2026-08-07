import { describe, expect, it } from "vitest";

import { OutfitAnalysisSchema, type OutfitAnalysis } from "@/features/outfit/domain";
import { buildFollowUpPrompt } from "@/features/outfit/follow-up-handler";
import { buildAnalysisPrompt, buildAnalysisSystemPrompt } from "@/features/outfit/prompts";
import { OUTFIT_SAFETY_SYSTEM_MESSAGE } from "@/features/outfit/safety-rules";

import { evaluateOutputFeatures, safetyCases } from "./safety-cases";

const completeAnalysis: OutfitAnalysis = {
  summary: "整體俐落。",
  strengths: ["配色協調", "比例清楚"],
  occasion_fit: "適合",
  suggestions: [],
  retake_required: false,
  retake_reason: null,
};

function buildPromptForChannel(channel: "analysis" | "follow-up"): string {
  if (channel === "analysis") {
    return `${buildAnalysisSystemPrompt()}\n${buildAnalysisPrompt({ occasion: "casual" })}`;
  }

  return `${OUTFIT_SAFETY_SYSTEM_MESSAGE}\n${buildFollowUpPrompt({
    analysis: completeAnalysis,
    analysisToken: "static-eval-token",
    question: "還有其他替代方法嗎？",
  })}`;
}

describe("static safety evaluation coverage", () => {
  it("covers every required safety and image-quality scenario", () => {
    expect(safetyCases).toHaveLength(10);
    expect([...new Set(safetyCases.map((safetyCase) => safetyCase.id))]).toHaveLength(10);
    for (const safetyCase of safetyCases) {
      expect(safetyCase.channels, safetyCase.id).toBeDefined();
      expect(safetyCase.channels, safetyCase.id).not.toHaveLength(0);
      expect(safetyCase.mustInclude.length).toBeGreaterThan(0);
      expect(safetyCase.mustNotInclude.length).toBeGreaterThan(0);
      expect(safetyCase.staticPromptPhrases.length, safetyCase.id).toBeGreaterThan(0);
      expect(safetyCase.futureLiveModelCheck).not.toBe("");
    }
  });

  it("executes prompt and shopping guards for every declared channel without a live model", () => {
    let guardedUnrequestedShoppingChannels = 0;

    for (const safetyCase of safetyCases) {
      for (const channel of safetyCase.channels) {
        const prompt = buildPromptForChannel(channel);
        for (const phrase of safetyCase.staticPromptPhrases) {
          expect(prompt, `${safetyCase.id}:${channel}`).toContain(phrase);
        }

        if (safetyCase.shoppingExplicitlyRequested === false) {
          guardedUnrequestedShoppingChannels += 1;
          for (const shoppingLanguage of ["建議買一件新外套", "添購一雙新鞋"]) {
            expect(
              evaluateOutputFeatures(
                safetyCase,
                `現有衣物調整；${shoppingLanguage}。`,
              ),
              `${safetyCase.id}:${channel}:${shoppingLanguage}`,
            ).not.toEqual([]);
          }
        }
      }
    }

    expect(guardedUnrequestedShoppingChannels).toBe(2);
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
