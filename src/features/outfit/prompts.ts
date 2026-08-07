import type { AnalyzeRequest } from "./domain";
import { OUTFIT_SAFETY_SYSTEM_MESSAGE } from "./safety-rules";

export function buildAnalysisSystemPrompt(): string {
  return `${OUTFIT_SAFETY_SYSTEM_MESSAGE}

回覆必須是符合 OutfitAnalysisSchema 的 JSON。`;
}

export function serializeUntrustedData(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e");
}

export function buildAnalysisPrompt(input: AnalyzeRequest): string {
  return `<UNTRUSTED_ANALYSIS_CONTEXT>
${serializeUntrustedData(input)}
</UNTRUSTED_ANALYSIS_CONTEXT>
只分析隨附照片中的可見穿搭。`;
}
