import { z } from "zod";

export const DAILY_ANALYSIS_LIMIT = 3 as const;

export const DailyQuotaSummarySchema = z.object({
  limit: z.literal(DAILY_ANALYSIS_LIMIT),
  used: z.number().int().min(0).max(DAILY_ANALYSIS_LIMIT),
  remaining: z.number().int().min(0).max(DAILY_ANALYSIS_LIMIT),
  resetAt: z.string().datetime({ offset: true }),
}).strict().refine(
  ({ used, remaining }) => used + remaining === DAILY_ANALYSIS_LIMIT,
);

export type DailyQuotaSummary = z.infer<typeof DailyQuotaSummarySchema>;

export type ReserveQuotaResult =
  | { status: "reserved"; reservationId: string; quota: DailyQuotaSummary }
  | { status: "daily_limit_reached"; quota: DailyQuotaSummary }
  | { status: "slots_busy"; quota: DailyQuotaSummary };

export class QuotaUnavailableError extends Error {
  constructor() {
    super("QUOTA_UNAVAILABLE");
    this.name = "QuotaUnavailableError";
  }
}

export type AnalysisQuotaService = {
  get(userId: string): Promise<DailyQuotaSummary>;
  reserve(userId: string, reservationId: string): Promise<ReserveQuotaResult>;
  complete(userId: string, reservationId: string): Promise<DailyQuotaSummary>;
  release(userId: string, reservationId: string): Promise<void>;
};
