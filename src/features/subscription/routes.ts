import type { User } from "@supabase/supabase-js";
import { getCurrentUser } from "@/lib/auth/user";
import { SubscriptionMaintenanceError, type SubscriptionService } from "./domain";
import { configuredSubscriptionService } from "./service";

export function createSubscriptionRoute(operation: keyof SubscriptionService, getUser: () => Promise<User | null> = getCurrentUser, service: SubscriptionService = configuredSubscriptionService) {
  return async (request: Request) => {
    const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    const user = await getUser().catch(() => null);
    if (!user || user.is_anonymous) return respond({ error: "AUTH_REQUIRED" }, 401);
    if (operation !== "get") {
      const origin = request.headers.get("origin");
      if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return respond({ error: "FORBIDDEN" }, 403);
    }
    try { return respond(await service[operation](user.id)); }
    catch (error) { return respond({ error: error instanceof SubscriptionMaintenanceError ? "SUBSCRIPTION_MAINTENANCE" : "SUBSCRIPTION_UNAVAILABLE" }, 503); }
  };
}
