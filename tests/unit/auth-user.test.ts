// @vitest-environment node

import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser } }),
}));

import { getVerifiedCurrentUser } from "@/lib/auth/user";

describe("getVerifiedCurrentUser", () => {
  beforeEach(() => getUser.mockReset());

  it("returns the user verified by the Supabase Auth server", async () => {
    const user = { id: "user-1", email: "verified@example.com" } as User;
    getUser.mockResolvedValue({ data: { user }, error: null });

    await expect(getVerifiedCurrentUser()).resolves.toBe(user);
  });

  it("preserves a Supabase verification failure for server error handling", async () => {
    const authError = new Error("Supabase Auth unavailable");
    getUser.mockResolvedValue({ data: { user: null }, error: authError });

    await expect(getVerifiedCurrentUser()).rejects.toBe(authError);
  });
});
