import type { User } from "@supabase/supabase-js";

import { createAnalysisQuotaHandler } from "@/features/outfit/analysis-quota-handler";
import { configuredAnalysisQuotaService } from "@/features/outfit/analysis-quota-service";
import type { AnalysisQuotaService } from "@/features/outfit/analysis-quota";
import { withAuthenticatedUser } from "@/lib/auth/guard";
import { getCurrentUser } from "@/lib/auth/user";

export function createAuthenticatedAnalysisQuotaRoute(
  getUser: () => Promise<User | null> = getCurrentUser,
  service: AnalysisQuotaService = configuredAnalysisQuotaService,
) {
  return withAuthenticatedUser(createAnalysisQuotaHandler(service), getUser);
}
