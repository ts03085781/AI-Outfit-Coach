import type { User } from "@supabase/supabase-js";

import { getCurrentUser } from "@/lib/auth/user";

type PostHandler = (request: Request) => Promise<Response>;

export function withAuthenticatedUser(
  handler: PostHandler,
  getUser: () => Promise<User | null> = getCurrentUser,
): PostHandler {
  return async (request) => {
    const user = await getUser().catch(() => null);
    if (!user) {
      return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    }
    return handler(request);
  };
}
