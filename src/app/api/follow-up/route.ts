import {
  createFollowUpHandler,
  createOpenAIFollowUpClient,
} from "@/features/outfit/follow-up-handler";

export const runtime = "nodejs";

const defaultDependencies = {
  createClient: createOpenAIFollowUpClient,
};

export const POST = createFollowUpHandler(defaultDependencies);
