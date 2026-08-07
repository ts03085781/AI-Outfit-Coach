import type { AnalyzeRequest } from "./domain";
import { OUTFIT_SAFETY_SYSTEM_MESSAGE } from "./safety-rules";

export function buildAnalysisSystemPrompt(): string {
  return `${OUTFIT_SAFETY_SYSTEM_MESSAGE}

回覆必須是符合 OutfitAnalysisSchema 的 JSON。`;
}

export function buildAnalysisPrompt(input: AnalyzeRequest): string {
  const context = [
    `場合：${input.occasion}`,
    input.weather ? `天氣：${input.weather}` : undefined,
    input.setting ? `環境：${input.setting}` : undefined,
    input.desiredFeel ? `想呈現的感覺：${input.desiredFeel}` : undefined,
  ].filter((line): line is string => Boolean(line)).join("\n");

  return `<UNTRUSTED_ANALYSIS_CONTEXT>
${context}
</UNTRUSTED_ANALYSIS_CONTEXT>
只分析隨附照片中的可見穿搭。`;
}
