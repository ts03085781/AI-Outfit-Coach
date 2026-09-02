import type { User } from "@supabase/supabase-js";

import { createAnalyzeHandler } from "@/features/outfit/analyze-handler";
import type { AnalysisQuotaService } from "@/features/outfit/analysis-quota";
import { configuredAnalysisQuotaService } from "@/features/outfit/analysis-quota-service";
import { configuredAnalysisTokenService } from "@/features/outfit/analysis-token";
import { createOpenAIOutfitAnalyzer } from "@/features/outfit/openai-analyzer";
import { configuredAbuseGuard } from "@/lib/abuse-guard";
import { withAuthenticatedUser } from "@/lib/auth/guard";
import { getCurrentUser } from "@/lib/auth/user";

const defaultDependencies = {
  createAnalyzer: createOpenAIOutfitAnalyzer,
  abuseGuard: configuredAbuseGuard,
  quotaService: configuredAnalysisQuotaService,
  issueAnalysisToken: configuredAnalysisTokenService.issue,
};

export function createAuthenticatedAnalyzeRoute(
  getUser: () => Promise<User | null> = getCurrentUser,
  quotaService: AnalysisQuotaService = configuredAnalysisQuotaService,
) {
  const handler = createAnalyzeHandler({ ...defaultDependencies, quotaService });
  return withAuthenticatedUser((request, user) => handler(request, user.id), getUser);
}
