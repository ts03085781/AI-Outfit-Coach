import { z } from "zod";
import { SubscriptionMaintenanceError, SubscriptionUnavailableError, type SubscriptionService, type SubscriptionSummary } from "./domain";

const RowSchema = z.object({
  provider: z.enum(["mock", "ecpay"]),
  provider_environment: z.enum(["stage", "production"]).nullable().optional(),
  status: z.enum(["pending", "active", "past_due", "expired"]),
  current_period_start: z.string().datetime({ offset: true }).nullable(),
  current_period_end: z.string().datetime({ offset: true }).nullable(),
  cancel_at_period_end: z.boolean(),
  cancel_requested_at: z.string().datetime({ offset: true }).nullable(),
  amount_twd: z.literal(60),
  billing_interval: z.literal("month"),
});
export type SubscriptionRpc = (name: "get_subscription" | "activate_mock_subscription" | "cancel_mock_subscription", args: { p_user_id: string }) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
export function mockSubscriptionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SUBSCRIPTION_MOCK_ENABLED === "true"
    && (env.NODE_ENV === "test" || env.NODE_ENV === "development")
    && !env.VERCEL_ENV && !env.VERCEL;
}
export function subscriptionSummary(data: unknown, now: Date, allowMock = false, allowStage = false): SubscriptionSummary {
  const rows = z.array(RowSchema).max(1).safeParse(data);
  if (!rows.success) throw new SubscriptionUnavailableError();
  const row = rows.data[0];
  if (!row) return { status: "none", isActive: false, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelRequestedAt: null, amountTwd: 60, billingInterval: "month" };
  const start = row.current_period_start && Date.parse(row.current_period_start);
  const end = row.current_period_end && Date.parse(row.current_period_end);
  const paidStatus = row.status === "active" || row.status === "past_due";
  if (paidStatus && (typeof start !== "number" || typeof end !== "number" || start >= end)) throw new SubscriptionUnavailableError();
  const isActive = (row.provider !== "mock" || allowMock) && (row.provider_environment !== "stage" || allowStage) && paidStatus && typeof start === "number" && typeof end === "number" && start <= now.getTime() && now.getTime() < end;
  return { status: paidStatus && typeof end === "number" && end <= now.getTime() ? "expired" : row.status, isActive, currentPeriodStart: row.current_period_start, currentPeriodEnd: row.current_period_end, cancelAtPeriodEnd: row.cancel_at_period_end, cancelRequestedAt: row.cancel_requested_at, amountTwd: 60, billingInterval: "month" };
}
export function createSubscriptionService(rpc: SubscriptionRpc, options: { mockEnabled?: () => boolean; now?: () => Date } = {}): SubscriptionService {
  const invoke = async (name: Parameters<SubscriptionRpc>[0], userId: string) => {
    try {
      const result = await rpc(name, { p_user_id: userId });
      if (result.error?.code === "P0002") throw new SubscriptionMaintenanceError();
      if (result.error) throw new SubscriptionUnavailableError();
      return subscriptionSummary(result.data, (options.now ?? (() => new Date()))(), (options.mockEnabled ?? mockSubscriptionEnabled)());
    } catch (error) {
      if (error instanceof SubscriptionMaintenanceError) throw error;
      throw new SubscriptionUnavailableError();
    }
  };
  return {
    get: (userId) => invoke("get_subscription", userId),
    async subscribe(userId) {
      if (!(options.mockEnabled ?? mockSubscriptionEnabled)()) throw new SubscriptionMaintenanceError();
      return invoke("activate_mock_subscription", userId);
    },
    async cancel(userId) {
      if (!(options.mockEnabled ?? mockSubscriptionEnabled)()) throw new SubscriptionMaintenanceError();
      return invoke("cancel_mock_subscription", userId);
    },
  };
}
async function configured(): Promise<SubscriptionService> {
  try {
    const { createAdminSupabaseClient } = await import("@/lib/supabase/admin");
    const client = createAdminSupabaseClient();
    if (process.env.ECPAY_ENABLED === "true") {
      const { createConfiguredEcpayService } = await import("./ecpay-configured");
      return createConfiguredEcpayService(client);
    }
    return createSubscriptionService((name, args) => client.rpc(name, args));
  } catch { throw new SubscriptionUnavailableError(); }
}
export const configuredSubscriptionService: SubscriptionService = {
  async get(userId) { return (await configured()).get(userId); },
  async subscribe(userId) {
    if (!mockSubscriptionEnabled() && process.env.ECPAY_ENABLED !== "true") throw new SubscriptionMaintenanceError();
    return (await configured()).subscribe(userId);
  },
  async cancel(userId) {
    if (!mockSubscriptionEnabled() && process.env.ECPAY_ENABLED !== "true") throw new SubscriptionMaintenanceError();
    return (await configured()).cancel(userId);
  },
};
