import { createEcpayCronRoute } from "@/features/subscription/ecpay-routes";
export const runtime = "nodejs";
export const maxDuration = 60;
const handler = createEcpayCronRoute(process.env.CRON_SECRET);
export async function GET(request: Request) {
  if (process.env.ECPAY_ENABLED !== "true") return Response.json({ skipped: true }, { headers: { "Cache-Control": "no-store" } });
  return handler(request);
}
