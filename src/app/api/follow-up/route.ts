import {
  createFollowUpHandler,
  createOpenAIFollowUpClient,
} from "@/features/outfit/follow-up-handler";
import { configuredAnalysisTokenService } from "@/features/outfit/analysis-token";
import { configuredAbuseGuard } from "@/lib/abuse-guard";
import { withAuthenticatedUser } from "@/lib/auth/guard";
import { getCurrentUser } from "@/lib/auth/user";
import type { User } from "@supabase/supabase-js";

export const runtime = "nodejs";

const defaultDependencies = {
  createClient: createOpenAIFollowUpClient,
  abuseGuard: configuredAbuseGuard,
  verifyAnalysisToken: configuredAnalysisTokenService.verify,
};

export function createAuthenticatedFollowUpRoute(
  getUser: () => Promise<User | null> = getCurrentUser,
) {
  return withAuthenticatedUser(createFollowUpHandler(defaultDependencies), getUser);
}

export const POST = createAuthenticatedFollowUpRoute();
