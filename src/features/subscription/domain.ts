import { z } from "zod";

export const SubscriptionSummarySchema = z.object({
  status: z.enum(["none", "pending", "active", "past_due", "expired"]),
  isActive: z.boolean(),
  currentPeriodStart: z.string().datetime({ offset: true }).nullable(),
  currentPeriodEnd: z.string().datetime({ offset: true }).nullable(),
  cancelAtPeriodEnd: z.boolean(),
  cancelRequestedAt: z.string().datetime({ offset: true }).nullable(),
  amountTwd: z.literal(60),
  billingInterval: z.literal("month"),
});
export type SubscriptionSummary = z.infer<typeof SubscriptionSummarySchema>;
export interface SubscriptionService {
  get(userId: string): Promise<SubscriptionSummary>;
  subscribe(userId: string): Promise<SubscriptionSummary>;
  cancel(userId: string): Promise<SubscriptionSummary>;
}
export class SubscriptionUnavailableError extends Error {
  constructor() { super("SUBSCRIPTION_UNAVAILABLE"); this.name = "SubscriptionUnavailableError"; }
}
export class SubscriptionMaintenanceError extends Error {
  constructor() { super("SUBSCRIPTION_MAINTENANCE"); this.name = "SubscriptionMaintenanceError"; }
}
