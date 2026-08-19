import { createAuthenticatedFollowUpRoute } from "@/features/outfit/authenticated-follow-up-route";

export const runtime = "nodejs";

export const POST = createAuthenticatedFollowUpRoute();
