// @vitest-environment node

import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { createSessionHandler } from "@/lib/auth/session-handler";
import { toBasicUser } from "@/lib/auth/user";

describe("toBasicUser", () => {
  it("maps the supported Google identity metadata", () => {
    expect(toBasicUser({
      id: "user-1",
      email: "dean@example.com",
      user_metadata: {
        full_name: "Dean",
        avatar_url: "https://lh3.googleusercontent.com/avatar",
      },
    } as unknown as User)).toEqual({
      id: "user-1",
      name: "Dean",
      email: "dean@example.com",
      avatarUrl: "https://lh3.googleusercontent.com/avatar",
    });
  });

  it("normalizes invalid metadata and non-HTTPS avatar URLs to null", () => {
    expect(toBasicUser({
      id: "user-1",
      email: 42,
      user_metadata: {
        full_name: 42,
        name: "Fallback name",
        avatar_url: "http://example.com/avatar",
      },
    } as unknown as User)).toEqual({
      id: "user-1",
      name: "Fallback name",
      email: null,
      avatarUrl: null,
    });
  });
});

describe("GET /api/auth/session", () => {
  it("returns a private, uncached anonymous session summary", async () => {
    const response = await createSessionHandler(async () => null)();

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ user: null });
  });
});
