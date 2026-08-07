import {
  createFollowUpHandler,
  createOpenAIFollowUpClient,
} from "@/features/outfit/follow-up-handler";
import { configuredAnalysisTokenService } from "@/features/outfit/analysis-token";
import { configuredAbuseGuard } from "@/lib/abuse-guard";

export const runtime = "nodejs";

const defaultDependencies = {
  createClient: createOpenAIFollowUpClient,
  abuseGuard: configuredAbuseGuard,
  verifyAnalysisToken: configuredAnalysisTokenService.verify,
};

export const POST = createFollowUpHandler(defaultDependencies);
