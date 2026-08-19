import type { User } from "@supabase/supabase-js";

import { createAnalyzeHandler } from "@/features/outfit/analyze-handler";
import { configuredAnalysisTokenService } from "@/features/outfit/analysis-token";
import { createOpenAIOutfitAnalyzer } from "@/features/outfit/openai-analyzer";
import { configuredAbuseGuard } from "@/lib/abuse-guard";
import { withAuthenticatedUser } from "@/lib/auth/guard";
import { getCurrentUser } from "@/lib/auth/user";

const defaultDependencies = {
  createAnalyzer: createOpenAIOutfitAnalyzer,
  abuseGuard: configuredAbuseGuard,
  issueAnalysisToken: configuredAnalysisTokenService.issue,
};

export function createAuthenticatedAnalyzeRoute(
  getUser: () => Promise<User | null> = getCurrentUser,
) {
  return withAuthenticatedUser(createAnalyzeHandler(defaultDependencies), getUser);
}
