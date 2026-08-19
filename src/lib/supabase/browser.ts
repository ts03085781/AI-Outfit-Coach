import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicConfig } from "@/lib/supabase/config";

export function createBrowserSupabaseClient() {
  const { url, publishableKey } = supabasePublicConfig();
  return createBrowserClient(url, publishableKey);
}
