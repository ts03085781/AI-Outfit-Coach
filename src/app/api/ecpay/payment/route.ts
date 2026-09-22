import { createEcpayNotificationRoute } from "@/features/subscription/ecpay-routes";
export const runtime = "nodejs";
export const POST = createEcpayNotificationRoute("first");
