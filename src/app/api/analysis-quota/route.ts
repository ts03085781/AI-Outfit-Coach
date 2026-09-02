import { createAuthenticatedAnalysisQuotaRoute } from "@/features/outfit/authenticated-analysis-quota-route";

export const runtime = "nodejs";

export const GET = createAuthenticatedAnalysisQuotaRoute();
