import type { User } from "@supabase/supabase-js";

import { getCurrentUser, toBasicUser } from "@/lib/auth/user";

export function createSessionHandler(
  getUser: () => Promise<User | null> = getCurrentUser,
) {
  return async function GET() {
    const user = await getUser().catch(() => null);
    return Response.json(
      { user: user ? toBasicUser(user) : null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  };
}

export const GET = createSessionHandler();
