import { z } from "zod";

export const OccasionSchema = z.enum(["casual", "date", "work", "formal"]);

export type Occasion = z.infer<typeof OccasionSchema>;

export const AnalyzeRequestSchema = z.object({
  occasion: OccasionSchema,
});

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
    occasion_fit: z.enum(["適合", "稍需調整", "不太適合"]),
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
