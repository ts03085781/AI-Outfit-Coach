import { z } from "zod";

export const OccasionSchema = z.enum(["casual", "date", "work", "formal"]);

export type Occasion = z.infer<typeof OccasionSchema>;

export const AnalyzeRequestSchema = z.object({
  occasion: OccasionSchema,
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const SuggestionSchema = z.object({
  action: z.string().min(1),
  reason: z.string().min(1),
  expected_effect: z.string().min(1),
});

export const OutfitAnalysisSchema = z
  .object({
    summary: z.string().min(1),
    strengths: z.array(z.string().min(1)).length(2),
    occasion_fit: z.enum(["適合", "稍需調整", "不太適合"]),
    suggestions: z.array(SuggestionSchema).max(3),
    retake_required: z.boolean(),
    retake_reason: z.string().min(1).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.retake_required && value.suggestions.length > 0) {
      ctx.addIssue({ code: "custom", message: "重拍時不得提供建議" });
    }
  });

export type OutfitAnalysis = z.infer<typeof OutfitAnalysisSchema>;
