import { z } from "zod";

export const OccasionSchema = z.enum(["casual", "date", "work", "formal"]);

export type Occasion = z.infer<typeof OccasionSchema>;

export const LocaleSchema = z.enum(["zh-TW", "en", "ja", "ko"]);
export type Locale = z.infer<typeof LocaleSchema>;

export const WeatherSchema = z.enum(["sunny", "rainy", "cold", "hot", "mild"]);
export const SettingSchema = z.enum(["indoor", "outdoor", "mixed"]);

export type Weather = z.infer<typeof WeatherSchema>;
export type Setting = z.infer<typeof SettingSchema>;

export const AnalyzeRequestSchema = z.object({
  occasion: OccasionSchema,
  locale: LocaleSchema,
  weather: WeatherSchema.optional(),
  setting: SettingSchema.optional(),
  desiredFeel: z.string().trim().max(60).optional(),
}).strict();

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const SuggestionSchema = z.object({
  action: z.string().min(1).max(160),
  reason: z.string().min(1).max(240),
  expected_effect: z.string().min(1).max(240),
});

const CompleteOutfitAnalysisSchema = z
  .object({
    summary: z.string().min(1).max(280),
    strengths: z.array(z.string().min(1).max(160)).length(2),
    occasion_fit: z.enum(["good", "adjust", "poor"]),
    suggestions: z.array(SuggestionSchema).max(3),
    retake_required: z.literal(false),
    retake_reason: z.null(),
  })
  .strict();

const RetakeOutfitAnalysisSchema = z
  .object({
    retake_required: z.literal(true),
    retake_reason: z.string().min(1).max(240),
  })
  .strict();

export const OutfitAnalysisSchema = z.discriminatedUnion("retake_required", [
  CompleteOutfitAnalysisSchema,
  RetakeOutfitAnalysisSchema,
]);

export type OutfitAnalysis = z.infer<typeof OutfitAnalysisSchema>;

export const AnalyzeSuccessResponseSchema = z.object({
  analysis: OutfitAnalysisSchema,
  analysisToken: z.string().min(1).max(1_024),
}).strict();
