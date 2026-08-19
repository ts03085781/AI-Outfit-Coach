import { createAuthenticatedAnalyzeRoute } from "@/features/outfit/authenticated-analyze-route";

export const runtime = "nodejs";

export const POST = createAuthenticatedAnalyzeRoute();
