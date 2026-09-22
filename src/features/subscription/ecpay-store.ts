import { z } from "zod";
import type { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { SubscriptionUnavailableError } from "./domain";
import { subscriptionSummary } from "./service";
import type { EcpayConfig } from "./ecpay";
import type { EcpayOrder, EcpayStore } from "./ecpay-service";

const orderSchema = z.object({
  merchant_trade_no: z.string().regex(/^[A-Za-z0-9]{1,20}$/), user_id: z.string().uuid(), merchant_id: z.string(),
  environment: z.literal("stage"), status: z.enum(["pending", "active", "terminated", "failed"]),
  cancel_confirmed_at: z.string().datetime({ offset: true }).nullable(),
});

export function createEcpayStore(client: ReturnType<typeof createAdminSupabaseClient>, config: EcpayConfig): EcpayStore {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new SubscriptionUnavailableError();
    return data as unknown;
  }
  async function find(tradeNo: string): Promise<EcpayOrder | null> {
    const { data, error } = await client.from("ecpay_orders").select("*").eq("merchant_trade_no", tradeNo).maybeSingle();
    if (error) throw new SubscriptionUnavailableError();
    return data ? orderSchema.parse(data) : null;
  }
  const args = (tradeNo: string) => ({ p_trade_no: tradeNo, p_merchant_id: config.merchantId });
  return {
    async read(userId) {
      const data = await rpc("get_subscription", { p_user_id: userId });
      const summary = subscriptionSummary(data, new Date(), false, true);
      const rows = z.array(z.object({ provider: z.string(), provider_environment: z.string().nullable(), provider_subscription_id: z.string().nullable() })).max(1).parse(data);
      const row = rows[0];
      if (row?.provider === "ecpay" && row.provider_subscription_id) {
        if (row.provider_environment !== config.environment) throw new SubscriptionUnavailableError();
        const order = await find(row.provider_subscription_id);
        if (!order || order.user_id !== userId) throw new SubscriptionUnavailableError();
        return { summary, order };
      }
      return { summary, order: null };
    },
    async begin(userId, tradeNo) {
      const data = await rpc("begin_ecpay_checkout", { ...args(tradeNo), p_user_id: userId });
      return z.array(orderSchema).max(1).parse(data)[0] ?? null;
    },
    find,
    async claim(tradeNo) { return z.boolean().parse(await rpc("claim_ecpay_sync", args(tradeNo))); },
    async apply(tradeNo, snapshot) {
      await rpc("apply_ecpay_snapshot", { ...args(tradeNo), p_exec_status: snapshot.execStatus, p_events: snapshot.events });
    },
    async confirmCancellation(tradeNo) { await rpc("confirm_ecpay_cancellation", args(tradeNo)); },
    async fail(tradeNo, kind, code, fingerprint) {
      await rpc("record_ecpay_failure", { ...args(tradeNo), p_kind: kind, p_rtn_code: code, p_event_key: fingerprint });
    },
    async due() {
      const since = new Date(Date.now() - 7 * 86400_000).toISOString();
      const { data, error } = await client.from("ecpay_orders").select("*")
        .eq("environment", config.environment).eq("merchant_id", config.merchantId)
        .or(`status.in.(pending,active),and(status.eq.terminated,cancel_confirmed_at.gte.${since})`)
        .lte("next_sync_at", new Date().toISOString()).order("next_sync_at").limit(20);
      if (error) throw new SubscriptionUnavailableError();
      return z.array(orderSchema).parse(data);
    },
  };
}
