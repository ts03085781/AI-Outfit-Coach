import type { User } from "@supabase/supabase-js";

import type { AnalysisQuotaService, GetSubscriptionAccess } from "@/features/outfit/analysis-quota";

const PRIVATE_NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

export function createAnalysisQuotaHandler(service: AnalysisQuotaService, getSubscription: GetSubscriptionAccess) {
  return async function GET(_request: Request, user: User) {
    try {
      const subscription = await getSubscription(user.id);
      if (subscription.isActive) {
        if (!subscription.currentPeriodEnd) throw new Error("Invalid subscription access");
        return Response.json({ type: "subscription", unlimited: true, currentPeriodEnd: subscription.currentPeriodEnd }, { headers: PRIVATE_NO_STORE_HEADERS });
      }
      const quota = await service.get(user.id);
      return Response.json({
        limit: quota.limit,
        used: quota.used,
        remaining: quota.remaining,
        resetAt: quota.resetAt,
      }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch {
      return Response.json(
        { error: "QUOTA_UNAVAILABLE" },
        { status: 503, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
  };
}
