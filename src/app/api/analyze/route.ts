import { createAnalyzeHandler } from "@/features/outfit/analyze-handler";
import { createOpenAIOutfitAnalyzer } from "@/features/outfit/openai-analyzer";

export const runtime = "nodejs";

const defaultDependencies = {
  createAnalyzer: createOpenAIOutfitAnalyzer,
};

export const POST = createAnalyzeHandler(defaultDependencies);
