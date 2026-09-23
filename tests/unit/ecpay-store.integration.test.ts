// @vitest-environment node
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createEcpayStore } from "@/features/subscription/ecpay-store";
import { createEcpaySubscriptionService } from "@/features/subscription/ecpay-service";
import { ecpayConfig, generateCheckMacValue } from "@/features/subscription/ecpay";

// Opt-in: real local database/REST; ECPay remains deterministic and no cloud configuration is read.
describe.skipIf(process.env.ECPAY_LOCAL_DB_TEST !== "true")("ECPay local REST integration", () => {
  it.each(["stage", "production"])("runs %s checkout, callback reconciliation and cancellation through the real service-role store", async (environment) => {
    const local = JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { encoding: "utf8", timeout: 30000 }));
    const apiUrl = String(local.API_URL);
    expect(new URL(apiUrl).hostname).toBe("127.0.0.1");
    const client = createClient(apiUrl, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const project = readFileSync("supabase/config.toml", "utf8").match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m)?.[1];
    expect(project).toBeTruthy();
    const sql = (statement: string) => execFileSync("docker", ["exec", `supabase_db_${project}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atc", statement], { encoding: "utf8", timeout: 30000 }).trim();
    const userId = randomUUID();
    const config = ecpayConfig({ ECPAY_ENABLED: "true", ECPAY_ENV: environment, ECPAY_MERCHANT_ID: environment === "stage" ? "3002607" : "9999999", ECPAY_HASH_KEY: "K".repeat(16), ECPAY_HASH_IV: "I".repeat(16), ECPAY_PUBLIC_BASE_URL: "https://test.example.com" });
    const store = createEcpayStore(client, config);
    const now = new Date();
    const end = new Date(now.getTime() + 28 * 86400_000).toISOString();
    const snapshot = { execStatus: "1" as const, events: [{ key: "901", success: true, amount: 60, occurred_at: now.toISOString(), period_end: end, rtn_code: "1" }] };
    const provider = { query: async () => snapshot, cancel: async () => {} };
    const service = createEcpaySubscriptionService(config, store, provider);
    try {
      sql(`insert into auth.users(id) values ('${userId}');`);
      const start = await service.subscribe(userId);
      expect("checkout" in start).toBe(true);
      if (!("checkout" in start)) throw new Error("Missing checkout");
      const tradeNo = start.checkout.fields.MerchantTradeNo;
      expect((await store.read(userId)).summary.isActive).toBe(false);
      const callback = { MerchantID: config.merchantId, MerchantTradeNo: tradeNo, RtnCode: "1", TradeAmt: "60" };
      const signed = { ...callback, CheckMacValue: generateCheckMacValue(callback, config.hashKey, config.hashIv) };
      await service.notify("first", signed);
      await service.notify("first", signed);
      expect(await service.get(userId)).toMatchObject({ isActive: true, canCancel: true, canCheckout: false });
      const { count, error } = await client.from("ecpay_payment_events").select("*", { count: "exact", head: true }).eq("merchant_trade_no", tradeNo);
      expect(error).toBeNull();
      expect(count).toBe(1);
      expect(await service.cancel(userId)).toMatchObject({ isActive: true, cancelAtPeriodEnd: true, canCancel: false });
      expect(new Date((await service.get(userId)).currentPeriodEnd!).toISOString()).toBe(end);
      expect(await store.due()).toEqual(expect.any(Array));
    } finally {
      sql(`delete from public.ecpay_payment_events where merchant_trade_no in (select merchant_trade_no from public.ecpay_orders where user_id='${userId}'); delete from public.ecpay_orders where user_id='${userId}'; delete from auth.users where id='${userId}';`);
    }
  }, 60000);
});
