import { safeNextPath } from "@/lib/auth/redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ExchangeCode = (code: string) => Promise<{ error: unknown }>;

export function createAuthCallbackHandler(exchangeCode: ExchangeCode) {
  return async function GET(request: Request) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    if (!code) return Response.redirect(new URL("/login?error=oauth", url.origin));

    const { error } = await exchangeCode(code).catch(() => ({ error: true }));
    if (error) return Response.redirect(new URL("/login?error=oauth", url.origin));

    const destination = new URL(safeNextPath(url.searchParams.get("next") ?? undefined), url.origin);
    destination.searchParams.set("login", "success");
    return Response.redirect(destination);
  };
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  return createAuthCallbackHandler((code) => supabase.auth.exchangeCodeForSession(code))(request);
}
