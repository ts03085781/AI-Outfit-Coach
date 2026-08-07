import { createAnalyzeHandler } from "@/features/outfit/analyze-handler";
import { createOpenAIOutfitAnalyzer } from "@/features/outfit/openai-analyzer";
import { configuredAbuseGuard } from "@/lib/abuse-guard";
import { configuredAnalysisTokenService } from "@/features/outfit/analysis-token";

export const runtime = "nodejs";

const defaultDependencies = {
  createAnalyzer: createOpenAIOutfitAnalyzer,
  abuseGuard: configuredAbuseGuard,
  issueAnalysisToken: configuredAnalysisTokenService.issue,
};

export const POST = createAnalyzeHandler(defaultDependencies);
