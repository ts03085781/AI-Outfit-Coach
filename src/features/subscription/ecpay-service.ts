import { createHash, randomBytes } from "node:crypto";
import { SubscriptionUnavailableError, type SubscriptionService, type SubscriptionSummary } from "./domain";
import { buildCheckout, createEcpayClient, verifyCheckMacValue, type EcpayConfig, type PeriodSnapshot } from "./ecpay";

export type EcpayOrder = {
  merchant_trade_no: string; user_id: string; merchant_id: string; environment: "stage" | "production";
  status: "pending" | "active" | "terminated" | "failed"; cancel_confirmed_at: string | null;
};
export type EcpayStore = {
  read(userId: string): Promise<{ summary: SubscriptionSummary; order: EcpayOrder | null }>;
  begin(userId: string, tradeNo: string): Promise<EcpayOrder | null>;
  find(tradeNo: string): Promise<EcpayOrder | null>;
  claim(tradeNo: string): Promise<boolean>;
  apply(tradeNo: string, snapshot: PeriodSnapshot): Promise<void>;
  confirmCancellation(tradeNo: string): Promise<void>;
  fail(tradeNo: string, kind: "first" | "period", code: string, fingerprint: string): Promise<void>;
  due(): Promise<EcpayOrder[]>;
};

export function createEcpaySubscriptionService(config: EcpayConfig, store: EcpayStore, provider = createEcpayClient(config)) {
  function checkOrder(order: EcpayOrder | null): asserts order is EcpayOrder {
    if (!order || order.merchant_id !== config.merchantId || order.environment !== config.environment) throw new SubscriptionUnavailableError();
  }
  async function sync(order: EcpayOrder, force = false) {
    checkOrder(order);
    if (!force && !await store.claim(order.merchant_trade_no)) return;
    await store.apply(order.merchant_trade_no, await provider.query(order.merchant_trade_no));
  }
  async function read(userId: string): Promise<SubscriptionSummary> {
    const { summary, order } = await store.read(userId);
    if (order) checkOrder(order);
    return { ...summary, canCancel: !!order && order.status === "active" && !order.cancel_confirmed_at,
      canCheckout: !summary.isActive && (!order || order.status !== "active") };
  }
  const service: SubscriptionService = {
    async get(userId) {
      const { order } = await store.read(userId);
      if (order) {
        checkOrder(order);
        // 外部查詢失敗不擴張權益；只回傳先前已確認的付款期間。
        await sync(order).catch(() => { console.warn("ECPay reconciliation unavailable"); });
      }
      return read(userId);
    },
    async subscribe(userId) {
      const summary = await service.get(userId);
      if (summary.isActive || summary.canCheckout === false) return summary;
      const order = await store.begin(userId, `OC${randomBytes(9).toString("hex")}`);
      if (!order) return read(userId);
      checkOrder(order);
      return { checkout: buildCheckout(config, order.merchant_trade_no) };
    },
    async cancel(userId) {
      const { order, summary } = await store.read(userId);
      if (!order) {
        if (summary.isActive) throw new SubscriptionUnavailableError();
        return read(userId);
      }
      checkOrder(order);
      if (order.cancel_confirmed_at || order.status === "terminated" || order.status === "failed") return read(userId);
      try {
        await provider.cancel(order.merchant_trade_no);
      } catch {
        // 逾時或重試可能發生於綠界已取消之後。必須查到終止，才可補記成功。
        const snapshot = await provider.query(order.merchant_trade_no);
        if (snapshot.execStatus !== "0" && snapshot.execStatus !== "2") throw new SubscriptionUnavailableError();
        await store.apply(order.merchant_trade_no, snapshot);
      }
      await store.confirmCancellation(order.merchant_trade_no);
      return read(userId);
    },
  };
  return {
    ...service,
    async notify(kind: "first" | "period", fields: Record<string, string>): Promise<void> {
      if (!verifyCheckMacValue(fields, config) || fields.MerchantID !== config.merchantId
        || !/^[A-Za-z0-9]{1,20}$/.test(fields.MerchantTradeNo ?? "") || !/^\d{1,20}$/.test(fields.RtnCode ?? "")) {
        throw new SubscriptionUnavailableError();
      }
      const order = await store.find(fields.MerchantTradeNo);
      checkOrder(order);
      if (fields.SimulatePaid === "1") return;
      if (fields.SimulatePaid !== undefined && fields.SimulatePaid !== "0") throw new SubscriptionUnavailableError();
      if (fields.RtnCode !== "1") {
        const fingerprint = createHash("sha256").update(Object.keys(fields).filter(k => k !== "CheckMacValue").sort().map(k => `${k}=${fields[k]}`).join("&")).digest("hex");
        await store.fail(order.merchant_trade_no, kind, fields.RtnCode, fingerprint);
        await sync(order, true).catch(() => { console.warn("ECPay failed-payment reconciliation unavailable"); });
        return;
      }
      if ((kind === "first" && fields.TradeAmt !== "60") || (kind === "period" && (fields.Amount !== "60" || fields.FirstAuthAmount !== "60"
        || fields.PeriodType !== "M" || fields.Frequency !== "1" || fields.ExecTimes !== "999"))) throw new SubscriptionUnavailableError();
      await sync(order, true);
    },
    async reconcileDue(): Promise<{ checked: number; failed: number }> {
      const orders = await store.due();
      let failed = 0;
      // 小批次執行，避免扣款查詢長時間占用 serverless 執行資源。
      for (let i = 0; i < orders.length; i += 5) {
        const results = await Promise.allSettled(orders.slice(i, i + 5).map(order => sync(order)));
        failed += results.filter(r => r.status === "rejected").length;
      }
      return { checked: orders.length, failed };
    },
  };
}
