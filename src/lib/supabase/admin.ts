import "server-only";

import { createClient } from "@supabase/supabase-js";

import { supabasePublicConfig } from "@/lib/supabase/config";

export function createAdminSupabaseClient() {
  const { url } = supabasePublicConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing server-only Supabase secret configuration");
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
