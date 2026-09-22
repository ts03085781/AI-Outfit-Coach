import { timingSafeEqual } from "node:crypto";
import { parseEcpayForm } from "./ecpay";

type NotificationService = { notify(kind: "first" | "period", fields: Record<string, string>): Promise<void> };
type ReconciliationService = { reconcileDue(): Promise<{ checked: number; failed: number }> };
async function configured() {
  const { createConfiguredEcpayService } = await import("./ecpay-configured");
  return createConfiguredEcpayService();
}

async function readForm(request: Request): Promise<Record<string, string>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") throw new Error("Invalid content type");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 32_768) { await reader.cancel(); throw new Error("Body too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return parseEcpayForm(Buffer.concat(chunks).toString("utf8"));
}

export function createEcpayNotificationRoute(kind: "first" | "period", factory: () => Promise<NotificationService> = configured) {
  return async (request: Request) => {
    let body = "0|ERROR";
    try {
      const fields = await readForm(request);
      await (await factory()).notify(kind, fields);
      body = "1|OK";
    } catch {
      // 不記錄原始回呼、簽章或卡片資訊。
      console.warn("ECPay notification could not be processed");
    }
    return new Response(body, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  };
}

export function createEcpayReturnRoute() {
  return async (request: Request) => new Response(null, {
    status: 303,
    headers: { Location: new URL("/settings?payment=returned", request.url).toString(), "Cache-Control": "no-store" },
  });
}

export function createEcpayCronRoute(secret: string | undefined, factory: () => Promise<ReconciliationService> = configured) {
  return async (request: Request) => {
    const expected = `Bearer ${secret}`;
    const supplied = request.headers.get("authorization") ?? "";
    const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    if (!secret || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return respond({ error: "UNAUTHORIZED" }, 401);
    try {
      const result = await (await factory()).reconcileDue();
      return respond(result, result.failed ? 503 : 200);
    } catch { return respond({ error: "SUBSCRIPTION_UNAVAILABLE" }, 503); }
  };
}
