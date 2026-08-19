import { createAuthCallbackHandler } from "@/lib/auth/callback";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  return createAuthCallbackHandler((code) => supabase.auth.exchangeCodeForSession(code))(request);
}
