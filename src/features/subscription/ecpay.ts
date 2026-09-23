import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { SubscriptionMaintenanceError, SubscriptionUnavailableError } from "./domain";

// 規格來源：2026-09-22 讀取綠界官方文件 2868.md、2892.md、2900.md、5631.md。
// 端點依伺服器環境選擇，拒絕自訂付款主機。
export const ECPAY_CHECKOUT_URL = "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";
const ECPAY_API = { stage: "https://payment-stage.ecpay.com.tw", production: "https://payment.ecpay.com.tw" } as const;
export type EcpayConfig = { merchantId: string; hashKey: string; hashIv: string; origin: string; environment: "stage" | "production" };

export function ecpayConfig(env: Record<string, string | undefined> = process.env): EcpayConfig {
  if (env.ECPAY_ENABLED !== "true") throw new SubscriptionMaintenanceError();
  const parsed = z.object({
    ECPAY_ENV: z.enum(["stage", "production"]),
    ECPAY_MERCHANT_ID: z.string().regex(/^\d{1,10}$/),
    ECPAY_HASH_KEY: z.string().length(16),
    ECPAY_HASH_IV: z.string().length(16),
    ECPAY_PUBLIC_BASE_URL: z.string().url(),
  }).safeParse(env);
  if (!parsed.success) {
    console.warn("ECPay configuration invalid fields", [...new Set(parsed.error.issues.map(issue => issue.path[0]))].join(","));
    throw new SubscriptionUnavailableError();
  }
  const v = parsed.data;
  if (env.SUBSCRIPTION_MOCK_ENABLED === "true" || (v.ECPAY_ENV === "production" && (
    ["3002607", "2000132", "3002599", "3003008"].includes(v.ECPAY_MERCHANT_ID)
    || v.ECPAY_HASH_KEY === "pwFHCqoQZGmho4w6" || v.ECPAY_HASH_IV === "EkRm7iFT261dpevs"
    || (env.VERCEL_ENV && env.VERCEL_ENV !== "production")
  ))) {
    console.warn("ECPay configuration conflict", {
      mockEnabled: env.SUBSCRIPTION_MOCK_ENABLED === "true",
      testMerchant: ["3002607", "2000132", "3002599", "3003008"].includes(v.ECPAY_MERCHANT_ID),
      testCredentials: v.ECPAY_HASH_KEY === "pwFHCqoQZGmho4w6" || v.ECPAY_HASH_IV === "EkRm7iFT261dpevs",
      nonProductionDeployment: !!env.VERCEL_ENV && env.VERCEL_ENV !== "production",
    });
    throw new SubscriptionUnavailableError();
  }
  const url = new URL(v.ECPAY_PUBLIC_BASE_URL);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash
    || url.pathname !== "/" || !url.hostname.includes(".") || url.hostname.endsWith(".localhost")
    || url.hostname.endsWith(".local") || isIP(url.hostname.replace(/^\[|\]$/g, "")) || url.origin.length > 160) {
    console.warn("ECPay configuration invalid fields", "ECPAY_PUBLIC_BASE_URL");
    throw new SubscriptionUnavailableError();
  }
  return { merchantId: v.ECPAY_MERCHANT_ID, hashKey: v.ECPAY_HASH_KEY, hashIv: v.ECPAY_HASH_IV, origin: url.origin, environment: v.ECPAY_ENV };
}

export function generateCheckMacValue(fields: Record<string, string>, hashKey: string, hashIv: string): string {
  const pairs = Object.keys(fields).filter(k => k.toLowerCase() !== "checkmacvalue")
    .sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0)
    .map(k => `${k}=${fields[k]}`).join("&");
  const encoded = encodeURIComponent(`HashKey=${hashKey}&${pairs}&HashIV=${hashIv}`)
    .replace(/%20/g, "+").replace(/~/g, "%7E").replace(/'/g, "%27").toLowerCase();
  return createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

export function verifyCheckMacValue(fields: Record<string, string>, config: EcpayConfig): boolean {
  if (!/^[A-Fa-f0-9]{64}$/.test(fields.CheckMacValue ?? "")) return false;
  return timingSafeEqual(Buffer.from(fields.CheckMacValue.toUpperCase()), Buffer.from(generateCheckMacValue(fields, config.hashKey, config.hashIv)));
}

export function parseEcpayForm(body: string): Record<string, string> {
  if (Buffer.byteLength(body) > 32_768) throw new SubscriptionUnavailableError();
  const fields: Record<string, string> = Object.create(null);
  const keys = new Set<string>();
  for (const [key, value] of new URLSearchParams(body)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || keys.has(key.toLowerCase()) || value.length > 4096 || keys.size >= 100) {
      throw new SubscriptionUnavailableError();
    }
    keys.add(key.toLowerCase());
    fields[key] = value;
  }
  return fields;
}

function taiwanDate(date: Date): string {
  return new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 19).replace(/-/g, "/").replace("T", " ");
}

export function parseEcpayDate(value: string): Date {
  if (!/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) throw new SubscriptionUnavailableError();
  const date = new Date(value.replace(/\//g, "-").replace(" ", "T") + "+08:00");
  if (!Number.isFinite(date.getTime()) || taiwanDate(date) !== value) throw new SubscriptionUnavailableError();
  return date;
}

export function buildCheckout(config: EcpayConfig, tradeNo: string, now = new Date()) {
  if (!/^[A-Za-z0-9]{1,20}$/.test(tradeNo)) throw new SubscriptionUnavailableError();
  const fields: Record<string, string> = {
    MerchantID: config.merchantId, MerchantTradeNo: tradeNo, MerchantTradeDate: taiwanDate(now),
    PaymentType: "aio", TotalAmount: "60", TradeDesc: "每月穿搭分析訂閱", ItemName: "無限次穿搭分析月訂閱",
    ReturnURL: `${config.origin}/api/ecpay/payment`, PeriodReturnURL: `${config.origin}/api/ecpay/period`,
    OrderResultURL: `${config.origin}/api/ecpay/return`, ClientBackURL: `${config.origin}/settings`,
    ChoosePayment: "Credit", EncryptType: "1", PeriodAmount: "60", PeriodType: "M", Frequency: "1", ExecTimes: "999",
    NeedExtraPaidInfo: "Y",
  };
  fields.CheckMacValue = generateCheckMacValue(fields, config.hashKey, config.hashIv);
  return { action: `${ECPAY_API[config.environment]}/Cashier/AioCheckOut/V5`, fields } as const;
}

const int = z.union([z.number().int(), z.string().regex(/^\d+$/).transform(Number)]).pipe(z.number().int().safe());
const logSchema = z.object({ RtnCode: int, amount: int, gwsr: int, process_date: z.string(), TradeNo: z.string().max(20).optional() });
const querySchema = z.object({
  MerchantID: z.string(), MerchantTradeNo: z.string(), TradeNo: z.string().max(20), RtnCode: int,
  PeriodType: z.literal("M"), Frequency: int.pipe(z.literal(1)), ExecTimes: int.pipe(z.literal(999)),
  PeriodAmount: int.pipe(z.literal(60)), amount: int, gwsr: int, process_date: z.string(),
  TotalSuccessTimes: int.pipe(z.number().nonnegative()), TotalSuccessAmount: int.pipe(z.number().nonnegative()),
  ExecStatus: z.enum(["0", "1", "2"]), ExecLog: z.array(logSchema).max(2000),
});
export type PaymentEvent = { key: string; success: boolean; amount: number; occurred_at: string; period_end: string | null; rtn_code: string };
export type PeriodSnapshot = { execStatus: "0" | "1" | "2"; events: PaymentEvent[] };

// 綠界沒有回傳下一期日期。以首期授權的台灣日期作為月結日，月底按該月天數截短。
function periodEnd(processed: Date, anchor: Date): string {
  const local = new Date(processed.getTime() + 8 * 3600_000);
  const first = new Date(anchor.getTime() + 8 * 3600_000);
  const nextMonth = local.getUTCMonth() + 1;
  const day = Math.min(first.getUTCDate(), new Date(Date.UTC(local.getUTCFullYear(), nextMonth + 1, 0)).getUTCDate());
  return new Date(Date.UTC(local.getUTCFullYear(), nextMonth, day, first.getUTCHours(), first.getUTCMinutes(), first.getUTCSeconds()) - 8 * 3600_000).toISOString();
}

export function parsePeriodQuery(value: unknown, config: EcpayConfig, tradeNo: string): PeriodSnapshot {
  const parsed = querySchema.safeParse(value);
  if (!parsed.success) {
    console.warn("ECPay configuration invalid fields", [...new Set(parsed.error.issues.map(issue => issue.path[0]))].join(","));
    throw new SubscriptionUnavailableError();
  }
  const q = parsed.data;
  if (q.MerchantID !== config.merchantId || q.MerchantTradeNo !== tradeNo) throw new SubscriptionUnavailableError();
  const logs = [q, ...q.ExecLog];
  const events = new Map<string, PaymentEvent>();
  const successful = logs.filter(l => l.RtnCode === 1);
  const dates = successful.map(l => parseEcpayDate(l.process_date));
  const anchor = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
  for (const l of logs) {
    if (l.RtnCode === 1 && (l.amount !== 60 || l.gwsr <= 0)) throw new SubscriptionUnavailableError();
    // 授權失敗有時沒有處理時間；保留失敗狀態，不能以缺少時間的紀錄授予權益。
    if (!l.process_date && l.RtnCode !== 1) continue;
    const occurred = parseEcpayDate(l.process_date);
    const event: PaymentEvent = { key: String(l.gwsr), success: l.RtnCode === 1, amount: l.amount,
      occurred_at: occurred.toISOString(), period_end: l.RtnCode === 1 && anchor ? periodEnd(occurred, anchor) : null, rtn_code: String(l.RtnCode) };
    const existing = events.get(event.key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(event)) throw new SubscriptionUnavailableError();
    events.set(event.key, event);
  }
  const paid = [...events.values()].filter(e => e.success);
  if (paid.length !== q.TotalSuccessTimes || paid.length * 60 !== q.TotalSuccessAmount) throw new SubscriptionUnavailableError();
  return { execStatus: q.ExecStatus, events: [...events.values()].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)) };
}

export function createEcpayClient(config: EcpayConfig, fetcher: typeof fetch = fetch) {
  async function post(path: string, fields: Record<string, string>): Promise<string> {
    const params = { MerchantID: config.merchantId, TimeStamp: String(Math.floor(Date.now() / 1000)), ...fields };
    const body = new URLSearchParams({ ...params, CheckMacValue: generateCheckMacValue(params, config.hashKey, config.hashIv) });
    const response = await fetcher(`${ECPAY_API[config.environment]}${path}`, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new SubscriptionUnavailableError();
    const text = await response.text();
    if (text.length > 1_000_000) throw new SubscriptionUnavailableError();
    return text;
  }
  return {
    async query(tradeNo: string): Promise<PeriodSnapshot> {
      return parsePeriodQuery(JSON.parse(await post("/Cashier/QueryCreditCardPeriodInfo", { MerchantTradeNo: tradeNo })), config, tradeNo);
    },
    async cancel(tradeNo: string): Promise<void> {
      const response = parseEcpayForm(await post("/Cashier/CreditCardPeriodAction", { MerchantTradeNo: tradeNo, Action: "Cancel" }));
      if (!verifyCheckMacValue(response, config) || response.MerchantID !== config.merchantId || response.MerchantTradeNo !== tradeNo || response.RtnCode !== "1") {
        throw new SubscriptionUnavailableError();
      }
    },
  };
}
