import { z } from "zod";

import { OccasionSchema } from "@/features/outfit/domain";

const SafeEventSchema = z.object({
  type: z.enum(["analysis_complete", "feedback"]),
  occasion: OccasionSchema.optional(),
  success: z.boolean().optional(),
  errorCode: z.enum(["INVALID_IMAGE", "RETAKE_REQUIRED", "AI_TIMEOUT", "AI_UNAVAILABLE"]).optional(),
  latencyBucket: z.enum(["0-5s", "5-10s", "10-30s", "30s+"]).optional(),
  retake: z.boolean().optional(),
  helpful: z.boolean().optional(),
}).strict();

export type SafeEvent = z.infer<typeof SafeEventSchema>;

export function track(event: SafeEvent): void {
  const safeEvent = SafeEventSchema.parse(event);
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent("outfit-telemetry", { detail: safeEvent }));
}
