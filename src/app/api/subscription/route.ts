import { createSubscriptionRoute } from "@/features/subscription/routes";
export const runtime = "nodejs";
export const GET = createSubscriptionRoute("get");
export const POST = createSubscriptionRoute("subscribe");
