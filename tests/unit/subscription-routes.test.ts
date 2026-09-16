import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { createSubscriptionRoute } from "@/features/subscription/routes";
import { SubscriptionMaintenanceError } from "@/features/subscription/domain";
import { subscriptionSummary } from "@/features/subscription/service";

const user = { id: "verified-user" } as User;
const summary = subscriptionSummary([], new Date());
const services = () => ({ get: vi.fn().mockResolvedValue(summary), subscribe: vi.fn().mockResolvedValue(summary), cancel: vi.fn().mockResolvedValue(summary) });
describe("subscription endpoints", () => {
  it.each(["get", "subscribe", "cancel"] as const)("requires verified login for %s", async (operation) => {
    const service = services();
    const response = await createSubscriptionRoute(operation, async () => null, service)(new Request("https://app.test/api/subscription"));
    expect(response.status).toBe(401); expect(response.headers.get("cache-control")).toBe("no-store"); expect(service[operation]).not.toHaveBeenCalled();
  });
  it("ignores attacker-selected user, dates and price", async () => {
    const service = services();
    const response = await createSubscriptionRoute("subscribe", async () => user, service)(new Request("https://app.test/api/subscription", { method: "POST", body: JSON.stringify({ user_id: "victim", amount: 0, end: "2099-01-01" }) }));
    expect(response.status).toBe(200); expect(service.subscribe).toHaveBeenCalledExactlyOnceWith(user.id);
  });
  it("rejects cross-origin mutation and anonymous identities", async () => {
    const service = services();
    expect((await createSubscriptionRoute("cancel", async () => user, service)(new Request("https://app.test/api/subscription", { method: "POST", headers: { origin: "https://evil.test" } }))).status).toBe(403);
    expect((await createSubscriptionRoute("get", async () => ({ ...user, is_anonymous: true }), service)(new Request("https://app.test/api/subscription"))).status).toBe(401);
    expect(service.cancel).not.toHaveBeenCalled(); expect(service.get).not.toHaveBeenCalled();
  });
  it("returns stable maintenance/unavailable errors without secrets", async () => {
    const service = services(); service.subscribe.mockRejectedValue(new SubscriptionMaintenanceError()); service.get.mockRejectedValue(new Error("secret"));
    const request = new Request("https://app.test/api/subscription");
    expect(await (await createSubscriptionRoute("subscribe", async () => user, service)(request)).json()).toEqual({ error: "SUBSCRIPTION_MAINTENANCE" });
    const response = await createSubscriptionRoute("get", async () => user, service)(request);
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "SUBSCRIPTION_UNAVAILABLE" });
  });
});
