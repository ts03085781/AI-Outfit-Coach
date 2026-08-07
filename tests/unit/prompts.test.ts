import { describe, expect, it } from "vitest";

import { buildAnalysisPrompt } from "@/features/outfit/prompts";

describe("buildAnalysisPrompt", () => {
  it("sets safety boundaries and requests no-purchase, visible-clothing advice", () => {
    const prompt = buildAnalysisPrompt({ occasion: "work" });

    expect(prompt).toContain("可見衣物");
    expect(prompt).toContain("不購物");
    expect(prompt).toContain("不得評價身體或外貌");
    expect(prompt).toContain("不得推斷敏感個人資訊");
    expect(prompt).toContain("照片不足時，要求重拍");
  });
});
