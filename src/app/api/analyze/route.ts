import { createAnalyzeHandler } from "@/features/outfit/analyze-handler";
import { createOpenAIOutfitAnalyzer } from "@/features/outfit/openai-analyzer";
import { configuredAbuseGuard } from "@/lib/abuse-guard";
import { configuredAnalysisTokenService } from "@/features/outfit/analysis-token";
import { withAuthenticatedUser } from "@/lib/auth/guard";
import { getCurrentUser } from "@/lib/auth/user";
import type { User } from "@supabase/supabase-js";

export const runtime = "nodejs";

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

export const POST = createAuthenticatedAnalyzeRoute();
