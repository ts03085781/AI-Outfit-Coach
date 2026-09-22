// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { createEcpayNotificationRoute, createEcpayReturnRoute, createEcpayCronRoute } from "@/features/subscription/ecpay-routes";

describe("ECPay HTTP boundaries", () => {
  it("accepts form callbacks without browser cookies and returns exact acknowledgement after persistence", async () => {
    const notify = vi.fn(async () => {});
    const handler = createEcpayNotificationRoute("first", async () => ({ notify }));
    const response = await handler(new Request("https://app.test/api/ecpay/payment", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "MerchantID=3002607&RtnCode=1" }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("1|OK");
    expect(notify).toHaveBeenCalledWith("first", { MerchantID: "3002607", RtnCode: "1" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("does not acknowledge an invalid callback or unavailable database as processed", async () => {
    const handler = createEcpayNotificationRoute("period", async () => ({ notify: async () => { throw new Error("secret"); } }));
    const response = await handler(new Request("https://app.test/api/ecpay/period", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "RtnCode=1" }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("0|ERROR");
  });
  it("rejects duplicate fields, oversized bodies and JSON", async () => {
    const notify = vi.fn(async () => {});
    const handler = createEcpayNotificationRoute("first", async () => ({ notify }));
    for (const [contentType, body] of [["application/json", "{}"], ["application/x-www-form-urlencoded", "RtnCode=1&RtnCode=2"], ["application/x-www-form-urlencoded", "x=" + "a".repeat(33000)]]) {
      expect(await (await handler(new Request("https://app.test/api/ecpay/payment", { method: "POST", headers: { "content-type": contentType }, body }))).text()).toBe("0|ERROR");
    }
    expect(notify).not.toHaveBeenCalled();
  });
  it("treats the browser return as navigation only, ignoring attacker-controlled redirect targets", async () => {
    const response = await createEcpayReturnRoute()(new Request("https://app.test/api/ecpay/return?next=https://evil.test", { method: "POST", body: "RtnCode=1" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.test/settings?payment=returned");
  });
  it("protects scheduled reconciliation with the server secret", async () => {
    const reconcileDue = vi.fn(async () => ({ checked: 3, failed: 1 }));
    const handler = createEcpayCronRoute("a-test-secret", async () => ({ reconcileDue }));
    expect((await handler(new Request("https://app.test/api/cron/subscriptions"))).status).toBe(401);
    expect(reconcileDue).not.toHaveBeenCalled();
    const result = await handler(new Request("https://app.test/api/cron/subscriptions", { headers: { authorization: "Bearer a-test-secret" } }));
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ checked: 3, failed: 1 });
  });
});
