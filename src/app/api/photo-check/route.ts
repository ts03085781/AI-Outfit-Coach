import { createPhotoCheckHandler } from "@/features/outfit/photo-check-handler";
import { createOpenAIPhotoChecker } from "@/features/outfit/openai-photo-checker";
import { configuredAbuseGuard } from "@/lib/abuse-guard";

export const runtime = "nodejs";

export const POST = createPhotoCheckHandler({
  createChecker: createOpenAIPhotoChecker,
  abuseGuard: configuredAbuseGuard,
});
