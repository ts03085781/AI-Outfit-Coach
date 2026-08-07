import type { AnalyzeRequest } from "./domain";
import { OUTFIT_SAFETY_SYSTEM_MESSAGE } from "./safety-rules";

export function buildAnalysisSystemPrompt(): string {
  return `${OUTFIT_SAFETY_SYSTEM_MESSAGE}

回覆必須是符合 OutfitAnalysisSchema 的 JSON。`;
}

export function buildAnalysisPrompt(input: AnalyzeRequest): string {
  return `<UNTRUSTED_ANALYSIS_CONTEXT>
場合：${input.occasion}
</UNTRUSTED_ANALYSIS_CONTEXT>
只分析隨附照片中的可見穿搭。`;
}
