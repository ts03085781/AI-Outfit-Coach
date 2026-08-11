import type { AnalyzeRequest, Locale } from "./domain";
import { getOutfitSafetySystemMessage } from "./safety-rules";

const LANGUAGE_NAMES: Record<Locale, string> = {
  "zh-TW": "繁體中文（台灣）",
  en: "English",
  ja: "日本語",
  ko: "한국어",
};

export function outputLanguageInstruction(locale: Locale): string {
  return `Write every natural-language value in ${LANGUAGE_NAMES[locale]} only. Keep JSON field names and occasion_fit codes unchanged.`;
}

export function buildAnalysisSystemPrompt(locale: Locale = "zh-TW"): string {
  return `${getOutfitSafetySystemMessage(locale)}

${outputLanguageInstruction(locale)}

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
