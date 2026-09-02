// @vitest-environment node

import type { User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { withAuthenticatedUser } from "@/lib/auth/guard";

describe("withAuthenticatedUser", () => {
  it("rejects a missing user without invoking the protected handler", async () => {
    const handler = vi.fn(async () => new Response(null, { status: 204 }));
    const response = await withAuthenticatedUser(handler, async () => null)(
      new Request("http://localhost/api/protected", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "AUTH_REQUIRED" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("invokes the protected handler for an authenticated user", async () => {
    const handler = vi.fn(async () => new Response(null, { status: 204 }));
    const response = await withAuthenticatedUser(
      handler,
      async () => ({ id: "user-1" } as User),
    )(new Request("http://localhost/api/protected", { method: "POST" }));

    expect(response.status).toBe(204);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("passes the verified user to the protected handler", async () => {
    const user = { id: "user-1" } as User;
    const handler = vi.fn(async (_request: Request, received: User) =>
      Response.json({ id: received.id }));
    const response = await withAuthenticatedUser(handler, async () => user)(
      new Request("http://localhost/api/protected"),
    );

    await expect(response.json()).resolves.toEqual({ id: "user-1" });
    expect(handler).toHaveBeenCalledWith(expect.any(Request), user);
  });
});
