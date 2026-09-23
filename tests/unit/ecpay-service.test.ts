// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { createEcpaySubscriptionService, type EcpayOrder, type EcpayStore } from "@/features/subscription/ecpay-service";
import { ecpayConfig, generateCheckMacValue } from "@/features/subscription/ecpay";
import type { SubscriptionSummary } from "@/features/subscription/domain";
import { subscriptionSummary } from "@/features/subscription/service";

const config = ecpayConfig({ ECPAY_ENABLED: "true", ECPAY_ENV: "stage", ECPAY_MERCHANT_ID: "3002607", ECPAY_HASH_KEY: "pwFHCqoQZGmho4w6", ECPAY_HASH_IV: "EkRm7iFT261dpevs", ECPAY_PUBLIC_BASE_URL: "https://test.example.com" });
const order = { merchant_trade_no: "SUB1", user_id: "user-1", merchant_id: "3002607", environment: "stage" as const, status: "active" as const, cancel_confirmed_at: null };
const active = { ...subscriptionSummary([], new Date()), status: "active" as const, isActive: true, currentPeriodStart: "2026-09-22T01:00:00Z", currentPeriodEnd: "2026-10-22T01:00:00Z" };
const signed = (fields: Record<string, string>) => ({ ...fields, CheckMacValue: generateCheckMacValue(fields, config.hashKey, config.hashIv) });
function setup() {
  const state: { summary: SubscriptionSummary; order: EcpayOrder | null } = { summary: { ...active }, order: { ...order } };
  const store: EcpayStore = {
    read: vi.fn(async () => state), begin: vi.fn(async () => null), find: vi.fn(async () => state.order),
    claim: vi.fn(async () => true), apply: vi.fn(async () => {}), fail: vi.fn(async () => {}),
    confirmCancellation: vi.fn(async () => { state.summary = { ...state.summary, cancelAtPeriodEnd: true, cancelRequestedAt: "2026-09-22T02:00:00Z" }; }),
    due: vi.fn(async () => []),
  };
  const provider = { query: vi.fn(async () => ({ execStatus: "1" as "0" | "1" | "2", events: [] })), cancel: vi.fn(async () => {}) };
  return { state, store, provider, service: createEcpaySubscriptionService(config, store, provider) };
}

describe("ECPay subscription lifecycle", () => {
  it("rejects another environment before querying or canceling at the gateway", async () => {
    const { service, state, provider } = setup();
    state.order = { ...order, environment: "production" };
    await expect(service.get("user-1")).rejects.toThrow();
    await expect(service.cancel("user-1")).rejects.toThrow();
    expect(provider.query).not.toHaveBeenCalled();
    expect(provider.cancel).not.toHaveBeenCalled();
  });
  it("only marks cancellation after the provider confirms it, preserving paid dates", async () => {
    const { service, state } = setup();
    expect(await service.cancel("user-1")).toMatchObject({ isActive: true, cancelAtPeriodEnd: true, currentPeriodEnd: active.currentPeriodEnd });
    expect(state.summary.currentPeriodEnd).toBe(active.currentPeriodEnd);
  });
  it("keeps renewal enabled on provider failure", async () => {
    const { service, provider, state } = setup();
    provider.cancel.mockRejectedValue(new Error("timeout"));
    await expect(service.cancel("user-1")).rejects.toThrow();
    expect(state.summary.cancelAtPeriodEnd).toBe(false);
  });
  it("repairs cancellation after a lost success response using an authoritative query", async () => {
    const { service, provider } = setup();
    provider.cancel.mockRejectedValue(new Error("timeout"));
    provider.query.mockResolvedValue({ execStatus: "0", events: [] });
    expect(await service.cancel("user-1")).toMatchObject({ cancelAtPeriodEnd: true, currentPeriodEnd: active.currentPeriodEnd });
  });
  it("returns a checkout without granting entitlement to a pending user", async () => {
    const { service, state, store } = setup();
    state.summary = { ...active, status: "none", isActive: false, currentPeriodStart: null, currentPeriodEnd: null };
    state.order = null;
    vi.mocked(store.begin).mockResolvedValue({ ...order, status: "pending" });
    expect(await service.subscribe("user-1")).toMatchObject({ checkout: { action: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5" } });
    expect(state.summary.isActive).toBe(false);
  });
  it("rejects callback tampering, mismatched amounts and unknown orders before updating rights", async () => {
    const { service, store, state } = setup();
    const valid = { MerchantID: "3002607", MerchantTradeNo: "SUB1", RtnCode: "1", TradeAmt: "60" };
    await expect(service.notify("first", { ...signed(valid), TradeAmt: "1" })).rejects.toThrow();
    await expect(service.notify("first", signed({ ...valid, TradeAmt: "1" }))).rejects.toThrow();
    state.order = null;
    await expect(service.notify("first", signed(valid))).rejects.toThrow();
    expect(store.apply).not.toHaveBeenCalled();
  });
  it("ignores dashboard simulate-paid notifications, including in stage", async () => {
    const { service, provider } = setup();
    await service.notify("first", signed({ MerchantID: "3002607", MerchantTradeNo: "SUB1", RtnCode: "1", TradeAmt: "60", SimulatePaid: "1" }));
    expect(provider.query).not.toHaveBeenCalled();
  });
  it("checks each successful periodic callback against provider history", async () => {
    const { service, store, provider } = setup();
    const snapshot = { execStatus: "1" as const, events: [{ key: "123", success: true, amount: 60, occurred_at: "2026-09-22T01:00:00Z", period_end: "2026-10-22T01:00:00Z", rtn_code: "1" }] };
    provider.query.mockResolvedValue(snapshot as never);
    await service.notify("period", signed({ MerchantID: "3002607", MerchantTradeNo: "SUB1", RtnCode: "1", Amount: "60", FirstAuthAmount: "60", PeriodType: "M", Frequency: "1", ExecTimes: "999" }));
    expect(store.apply).toHaveBeenCalledWith("SUB1", snapshot);
  });
  it("keeps a pending user unpaid when provider reconciliation is unavailable", async () => {
    const { service, provider, state } = setup();
    state.summary.isActive = false;
    provider.query.mockRejectedValue(new Error("unavailable"));
    expect((await service.get("user-1")).isActive).toBe(false);
  });
});
