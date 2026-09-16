import { describe, expect, it, vi } from "vitest";
import { createSubscriptionService, mockSubscriptionEnabled, subscriptionSummary } from "@/features/subscription/service";
import { SubscriptionMaintenanceError, SubscriptionUnavailableError } from "@/features/subscription/domain";

const row = { provider: "ecpay", status: "active", current_period_start: "2026-01-01T00:00:00Z", current_period_end: "2026-02-01T00:00:00Z", cancel_at_period_end: false, cancel_requested_at: null, amount_twd: 60, billing_interval: "month" };
describe("subscription entitlement", () => {
  it.each(["active", "past_due"])("retains paid-through %s access after cancellation", (status) => {
    expect(subscriptionSummary([{ ...row, status, cancel_at_period_end: true, cancel_requested_at: "2026-01-15T00:00:00Z" }], new Date("2026-01-16"))).toMatchObject({ isActive: true, cancelAtPeriodEnd: true });
  });
  it("includes period start but excludes exact expiry and future starts", () => {
    expect(subscriptionSummary([row], new Date(row.current_period_start)).isActive).toBe(true);
    expect(subscriptionSummary([row], new Date(row.current_period_end))).toMatchObject({ isActive: false, status: "expired" });
    expect(subscriptionSummary([row], new Date("2025-12-31")).isActive).toBe(false);
  });
  it("never grants pending or expired rows and rejects malformed paid periods", () => {
    for (const status of ["pending", "expired"]) expect(subscriptionSummary([{ ...row, status }], new Date("2026-01-15")).isActive).toBe(false);
    expect(() => subscriptionSummary([{ ...row, current_period_start: null }], new Date())).toThrow(SubscriptionUnavailableError);
  });
  it("never grants production access to mock records", () => {
    const mock = [{ ...row, provider: "mock" }];
    expect(subscriptionSummary(mock, new Date("2026-01-15")).isActive).toBe(false);
    expect(subscriptionSummary(mock, new Date("2026-01-15"), true).isActive).toBe(true);
  });
  it("represents no row and rejects duplicate or malformed database results", () => {
    expect(subscriptionSummary([], new Date())).toMatchObject({ status: "none", isActive: false });
    for (const data of [null, [row, row], [{ ...row, amount_twd: 1 }]]) expect(() => subscriptionSummary(data, new Date())).toThrow(SubscriptionUnavailableError);
  });
});
describe("mock gate", () => {
  it.each([{}, { NODE_ENV: "test" }, { NODE_ENV: "production", SUBSCRIPTION_MOCK_ENABLED: "true" }, { NODE_ENV: "test", SUBSCRIPTION_MOCK_ENABLED: "true", VERCEL_ENV: "preview" }, { NODE_ENV: "development", SUBSCRIPTION_MOCK_ENABLED: "true", VERCEL: "1" }])("defaults closed in %j", (env) => expect(mockSubscriptionEnabled(env)).toBe(false));
  it.each(["test", "development"])("permits explicitly enabled local %s", (NODE_ENV) => expect(mockSubscriptionEnabled({ NODE_ENV, SUBSCRIPTION_MOCK_ENABLED: "true" })).toBe(true));
  it("never calls database for disabled mutations", async () => {
    const rpc = vi.fn(); const service = createSubscriptionService(rpc, { mockEnabled: () => false });
    await expect(service.subscribe("user")).rejects.toThrow(SubscriptionMaintenanceError);
    await expect(service.cancel("user")).rejects.toThrow(SubscriptionMaintenanceError);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("uses server-selected identity only and maps provider refusal", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValueOnce({ data: null, error: { code: "P0002" } });
    const service = createSubscriptionService(rpc, { mockEnabled: () => true, now: () => new Date("2026-01-15") });
    expect((await service.subscribe("verified-user")).isActive).toBe(true);
    expect(rpc).toHaveBeenCalledWith("activate_mock_subscription", { p_user_id: "verified-user" });
    await expect(service.cancel("verified-user")).rejects.toThrow(SubscriptionMaintenanceError);
  });
  it("fails closed on returned and thrown database errors", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [], error: { code: "42P01" } }).mockRejectedValueOnce(new Error("secret"));
    const service = createSubscriptionService(rpc);
    await expect(service.get("user")).rejects.toThrow(SubscriptionUnavailableError);
    await expect(service.get("user")).rejects.toThrow(SubscriptionUnavailableError);
  });
});
