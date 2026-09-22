// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import vectors from "../../.ecpay-skill/test-vectors/checkmacvalue.json";
import { createEcpayClient, ecpayConfig, generateCheckMacValue, parseEcpayForm, verifyCheckMacValue, buildCheckout, parsePeriodQuery } from "@/features/subscription/ecpay";

const env = { ECPAY_ENABLED: "true", ECPAY_ENV: "stage", ECPAY_MERCHANT_ID: "3002607", ECPAY_HASH_KEY: "pwFHCqoQZGmho4w6", ECPAY_HASH_IV: "EkRm7iFT261dpevs", ECPAY_PUBLIC_BASE_URL: "https://test.example.com" };
const config = () => ecpayConfig(env);
const query = (overrides = {}) => ({ MerchantID: "3002607", MerchantTradeNo: "SUB123", TradeNo: "20260922000001", RtnCode: 1, PeriodType: "M", Frequency: 1, ExecTimes: 999, PeriodAmount: 60, amount: 60, gwsr: 1001, process_date: "2026/01/31 10:00:00", TotalSuccessTimes: 2, TotalSuccessAmount: 120, ExecStatus: "1", ExecLog: [
  { RtnCode: 1, amount: 60, gwsr: 1001, process_date: "2026/01/31 10:00:00", TradeNo: "20260922000001" },
  { RtnCode: 1, amount: 60, gwsr: 1002, process_date: "2026/02/28 01:00:00", TradeNo: "20260922000002" },
], ...overrides });

describe("ECPay signature boundary", () => {
  it.each(vectors.vectors.filter(v => v.method === "SHA256" && v.params))("matches official vector $name", (v) => {
    expect(generateCheckMacValue(v.params as unknown as Record<string, string>, v.hashKey, v.hashIV)).toBe(v.expected);
  });
  it("rejects modified, malformed, duplicate and case-colliding fields", () => {
    const fields = { MerchantID: "3002607", RtnCode: "1" };
    const signed = { ...fields, CheckMacValue: generateCheckMacValue(fields, env.ECPAY_HASH_KEY, env.ECPAY_HASH_IV) };
    expect(verifyCheckMacValue(signed, config())).toBe(true);
    expect(verifyCheckMacValue({ ...signed, RtnCode: "0" }, config())).toBe(false);
    expect(verifyCheckMacValue({ ...signed, CheckMacValue: "bad" }, config())).toBe(false);
    expect(() => parseEcpayForm("RtnCode=1&RtnCode=0")).toThrow();
    expect(() => parseEcpayForm("RtnCode=1&rtncode=0")).toThrow();
  });
});

describe("stage checkout", () => {
  it("requires explicit stage configuration and a public HTTPS origin", () => {
    expect(() => ecpayConfig({})).toThrow();
    expect(() => ecpayConfig({ ...env, ECPAY_ENV: "production" })).toThrow();
    for (const url of ["http://test.example.com", "https://localhost", "https://127.0.0.1", "https://user:pass@test.example.com", "https://test.example.com/path"]) {
      expect(() => ecpayConfig({ ...env, ECPAY_PUBLIC_BASE_URL: url })).toThrow();
    }
  });
  it("signs a fixed monthly price with distinct server and browser return URLs", () => {
    const checkout = buildCheckout(config(), "SUB123", new Date("2026-09-22T01:02:03Z"));
    expect(checkout.action).toBe("https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5");
    expect(checkout.fields).toMatchObject({ MerchantTradeNo: "SUB123", MerchantTradeDate: "2026/09/22 09:02:03", TotalAmount: "60", PeriodAmount: "60", PeriodType: "M", Frequency: "1", ExecTimes: "999", ChoosePayment: "Credit", ReturnURL: "https://test.example.com/api/ecpay/payment", PeriodReturnURL: "https://test.example.com/api/ecpay/period", OrderResultURL: "https://test.example.com/api/ecpay/return", ClientBackURL: "https://test.example.com/settings" });
    expect(verifyCheckMacValue(checkout.fields, config())).toBe(true);
    expect(JSON.stringify(checkout)).not.toContain(env.ECPAY_HASH_KEY);
    expect(JSON.stringify(checkout)).not.toContain(env.ECPAY_HASH_IV);
  });
});

describe("provider query and cancellation", () => {
  it("normalizes confirmed authorizations, deduplicates the first log, and keeps the original month-end anchor", () => {
    const result = parsePeriodQuery(query(), config(), "SUB123");
    expect(result.execStatus).toBe("1");
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({ key: "1001", success: true, occurred_at: "2026-01-31T02:00:00.000Z", period_end: "2026-02-28T02:00:00.000Z" });
    expect(result.events[1]).toMatchObject({ key: "1002", period_end: "2026-03-31T02:00:00.000Z" });
  });
  it("rejects cross-order, cross-merchant, mismatched-price and malformed snapshots", () => {
    for (const overrides of [{ MerchantID: "other" }, { MerchantTradeNo: "other" }, { PeriodAmount: 1 }, { PeriodType: "D" }, { ExecLog: [{ RtnCode: 1, amount: 60, gwsr: 123, process_date: "2026/02/31 10:00:00", TradeNo: "X" }] }]) {
      expect(() => parsePeriodQuery(query(overrides), config(), "SUB123")).toThrow();
    }
  });
  it("validates a signed cancellation response before reporting success", async () => {
    const fields = { MerchantID: "3002607", MerchantTradeNo: "SUB123", RtnCode: "1", RtnMsg: "OK" };
    const signed = { ...fields, CheckMacValue: generateCheckMacValue(fields, env.ECPAY_HASH_KEY, env.ECPAY_HASH_IV) };
    const fetcher = vi.fn().mockResolvedValue(new Response(new URLSearchParams(signed).toString()));
    await expect(createEcpayClient(config(), fetcher).cancel("SUB123")).resolves.toBeUndefined();
    expect(fetcher.mock.calls[0][0]).toBe("https://payment-stage.ecpay.com.tw/Cashier/CreditCardPeriodAction");
    const request = parseEcpayForm(fetcher.mock.calls[0][1].body.toString());
    expect(request.Action).toBe("Cancel");
    expect(verifyCheckMacValue(request, config())).toBe(true);
    fetcher.mockResolvedValue(new Response(new URLSearchParams({ ...signed, MerchantTradeNo: "other" }).toString()));
    await expect(createEcpayClient(config(), fetcher).cancel("SUB123")).rejects.toThrow();
  });
  it("does not treat unsigned, declined or HTTP error responses as a cancellation", async () => {
    for (const response of [new Response("RtnCode=1"), new Response("RtnCode=0&RtnMsg=declined"), new Response("oops", { status: 500 })]) {
      await expect(createEcpayClient(config(), vi.fn().mockResolvedValue(response)).cancel("SUB123")).rejects.toThrow();
    }
  });
});
