import { createAnalyzeHandler } from "@/features/outfit/analyze-handler";
import { createOpenAIOutfitAnalyzer } from "@/features/outfit/openai-analyzer";
import { configuredAbuseGuard } from "@/lib/abuse-guard";

export const runtime = "nodejs";

const defaultDependencies = {
  createAnalyzer: createOpenAIOutfitAnalyzer,
  abuseGuard: configuredAbuseGuard,
};

export const POST = createAnalyzeHandler(defaultDependencies);
