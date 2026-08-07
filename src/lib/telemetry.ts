import { z } from "zod";

import { OccasionSchema } from "@/features/outfit/domain";

const LatencyBucketSchema = z.enum(["0-5s", "5-10s", "10-30s", "30s+"]);
const ErrorCodeSchema = z.enum([
  "INVALID_IMAGE",
  "AI_TIMEOUT",
  "AI_UNAVAILABLE",
  "AI_SAFETY_REJECTED",
  "RATE_LIMITED",
  "RATE_LIMIT_UNAVAILABLE",
  "INVALID_RESPONSE",
]);

const AnalysisSuccessEventSchema = z.object({
  type: z.literal("analysis_success"),
  occasion: OccasionSchema,
  latencyBucket: LatencyBucketSchema,
}).strict();

const AnalysisRetakeEventSchema = z.object({
  type: z.literal("analysis_retake"),
  occasion: OccasionSchema,
  latencyBucket: LatencyBucketSchema,
}).strict();

const AnalysisErrorEventSchema = z.object({
  type: z.literal("analysis_error"),
  occasion: OccasionSchema,
  latencyBucket: LatencyBucketSchema,
  errorCode: ErrorCodeSchema,
}).strict();

const FeedbackEventSchema = z.object({
  type: z.literal("feedback"),
  helpful: z.boolean(),
}).strict();

export const TelemetryEventSchema = z.discriminatedUnion("type", [
  AnalysisSuccessEventSchema,
  AnalysisRetakeEventSchema,
  AnalysisErrorEventSchema,
  FeedbackEventSchema,
]);

export type SafeEvent = z.infer<typeof TelemetryEventSchema>;
export type TelemetryErrorCode = z.infer<typeof ErrorCodeSchema>;
export type LatencyBucket = z.infer<typeof LatencyBucketSchema>;

export function coarseLatencyBucket(milliseconds: number): LatencyBucket {
  if (milliseconds < 5_000) return "0-5s";
  if (milliseconds < 10_000) return "5-10s";
  if (milliseconds < 30_000) return "10-30s";
  return "30s+";
}

export function track(event: SafeEvent): void {
  const safeEvent = TelemetryEventSchema.parse(event);
  if (typeof window === "undefined") return;

  try {
    void Promise.resolve(fetch("/api/telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(safeEvent),
      keepalive: true,
    })).catch(() => undefined);
  } catch {
    // Metrics are best-effort and never block the product flow.
  }
}
