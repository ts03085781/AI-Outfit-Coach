import { createSubscriptionRoute } from "@/features/subscription/routes";
export const runtime = "nodejs";
export const POST = createSubscriptionRoute("cancel");
