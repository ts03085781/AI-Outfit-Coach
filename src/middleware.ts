import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export function middleware(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/api/auth/session",
    "/api/analyze",
    "/api/follow-up",
    "/api/auth/login-notification",
  ],
};
