import type { User } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type BasicUser = {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export async function getVerifiedCurrentUser(): Promise<User | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    return await getVerifiedCurrentUser();
  } catch {
    return null;
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function httpsUrlOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

export function toBasicUser(user: User): BasicUser {
  const metadata = user.user_metadata && typeof user.user_metadata === "object"
    ? user.user_metadata as Record<string, unknown>
    : {};

  return {
    id: user.id,
    name: stringOrNull(metadata.full_name) ?? stringOrNull(metadata.name),
    email: stringOrNull(user.email),
    avatarUrl: httpsUrlOrNull(metadata.avatar_url),
  };
}
