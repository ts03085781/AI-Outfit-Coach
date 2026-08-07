import { describe, expect, it } from "vitest";

import {
  buildAnalysisPrompt,
  buildAnalysisSystemPrompt,
} from "@/features/outfit/prompts";

describe("buildAnalysisPrompt", () => {
  it("forbids nonessential shopping unless explicitly requested and keeps it optional", () => {
    const prompt = `${buildAnalysisSystemPrompt()}\n${buildAnalysisPrompt({ occasion: "work" })}`;

    expect(prompt).toContain("可見衣物");
    expect(prompt).toContain("不得建議非必要購物");
    expect(prompt).toContain("只有使用者明確要求購物建議時");
    expect(prompt).toContain("非強制選項");
    expect(prompt).toContain("仍先提供現有衣物調整");
    expect(prompt).toContain("不得評價身體或外貌");
    expect(prompt).toContain("不得推斷敏感個人資訊");
    expect(prompt).toContain("照片不足時，要求重拍");
    expect(prompt).toContain("<UNTRUSTED_ANALYSIS_CONTEXT>");
  });
});
