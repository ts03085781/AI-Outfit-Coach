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
  canCancel: z.boolean().optional(),
  canCheckout: z.boolean().optional(),
});
export type SubscriptionSummary = z.infer<typeof SubscriptionSummarySchema>;
export const CheckoutResponseSchema = z.object({
  checkout: z.object({
    action: z.enum(["https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5", "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"]),
    fields: z.record(z.string(), z.string()),
  }),
});
export type SubscriptionStart = SubscriptionSummary | z.infer<typeof CheckoutResponseSchema>;
export interface SubscriptionService {
  get(userId: string): Promise<SubscriptionSummary>;
  subscribe(userId: string): Promise<SubscriptionStart>;
  cancel(userId: string): Promise<SubscriptionSummary>;
}
export class SubscriptionUnavailableError extends Error {
  constructor() { super("SUBSCRIPTION_UNAVAILABLE"); this.name = "SubscriptionUnavailableError"; }
}
export class SubscriptionMaintenanceError extends Error {
  constructor() { super("SUBSCRIPTION_MAINTENANCE"); this.name = "SubscriptionMaintenanceError"; }
}
