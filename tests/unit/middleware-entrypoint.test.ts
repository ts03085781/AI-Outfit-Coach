// @vitest-environment node

import type { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { updateSupabaseSession } = vi.hoisted(() => ({
  updateSupabaseSession: vi.fn(),
}));

vi.mock("@/lib/supabase/middleware", () => ({ updateSupabaseSession }));

import { config, middleware } from "@/middleware";

describe("middleware entrypoint", () => {
  it("refreshes the Supabase session through the src middleware entrypoint", async () => {
    const request = { nextUrl: new URL("https://example.com/api/auth/session") } as NextRequest;
    const response = new Response(null, { status: 204 });
    updateSupabaseSession.mockResolvedValue(response);

    await expect(middleware(request)).resolves.toBe(response);
    expect(updateSupabaseSession).toHaveBeenCalledWith(request);
    expect(config.matcher).toEqual([
      "/api/auth/session",
      "/api/analyze",
      "/api/follow-up",
      "/api/auth/login-notification",
    ]);
    expect(config.matcher).not.toContain("/");
    expect(config.matcher).not.toContain("/api/trends");
  });
});
