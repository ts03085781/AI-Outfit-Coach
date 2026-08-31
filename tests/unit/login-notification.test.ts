// @vitest-environment node

import type { User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  createLoginNotificationHandler,
  createLoginNotifier,
  renderLoginNotificationEmail,
  sendLoginNotificationEmail,
} from "@/features/auth/login-notification";

describe("login notification", () => {
  it("renders an escaped account email and server login time", () => {
    const html = renderLoginNotificationEmail({
      email: 'user+<admin>&"@example.com',
      loginAt: new Date("2026-08-30T02:15:00.000Z"),
    });

    expect(html).toContain("AI Outfit Coach");
    expect(html).toContain("偵測到您的帳號剛剛成功登入 AI Outfit Coach。");
    expect(html).toContain("user+&lt;admin&gt;&amp;&quot;@example.com");
    expect(html).not.toContain('user+<admin>&"@example.com');
    expect(html).toContain("2026-08-30 02:15:00 UTC");
    expect(html).toContain("建議您立即檢查帳號安全性");
  });

  it("sends the login notification from the configured address", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "email-1" }, error: null });
    const loginAt = new Date("2026-08-30T02:15:00.000Z");

    await sendLoginNotificationEmail(
      {
        email: "user@example.com",
        loginAt,
        idempotencyKey: "login-notification/user-1/2026-08-30T02:14:00.000Z",
      },
      { client: { emails: { send } }, from: "AI Outfit Coach <security@example.com>" },
    );

    expect(send).toHaveBeenCalledWith(
      {
        from: "AI Outfit Coach <security@example.com>",
        to: "user@example.com",
        subject: "AI Outfit Coach 登入通知",
        html: expect.stringContaining("2026-08-30 02:15:00 UTC"),
      },
      { idempotencyKey: "login-notification/user-1/2026-08-30T02:14:00.000Z" },
    );
  });

  it("rejects when Resend reports a delivery error", async () => {
    const providerError = { message: "invalid sender", name: "validation_error" };

    await expect(sendLoginNotificationEmail(
      {
        email: "user@example.com",
        loginAt: new Date("2026-08-30T02:15:00.000Z"),
        idempotencyKey: "login-notification/user-1/2026-08-30T02:14:00.000Z",
      },
      {
        client: {
          emails: {
            send: vi.fn().mockResolvedValue({ data: null, error: providerError }),
          },
        },
        from: "AI Outfit Coach <security@example.com>",
      },
    )).rejects.toMatchObject({
      message: "Resend rejected the login notification",
      cause: providerError,
    });
  });

  it("uses the authenticated Supabase user's email and a server timestamp", async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const loginAt = new Date("2026-08-30T02:15:00.000Z");
    const notify = createLoginNotifier({
      getUser: async () => ({
        id: "user-1",
        email: "verified@example.com",
        last_sign_in_at: "2026-08-30T02:14:00.000Z",
      } as User),
      sendEmail,
      now: () => loginAt,
      logError: vi.fn(),
    });

    await expect(notify()).resolves.toBe("sent");
    expect(sendEmail).toHaveBeenCalledWith({
      email: "verified@example.com",
      loginAt: new Date("2026-08-30T02:14:00.000Z"),
      idempotencyKey: "login-notification/user-1/2026-08-30T02:14:00.000Z",
    });
  });

  it("logs a server error and contains an email delivery failure", async () => {
    const providerError = new Error("provider rejected request");
    const logError = vi.fn();
    const notify = createLoginNotifier({
      getUser: async () => ({
        id: "user-1",
        email: "verified@example.com",
        last_sign_in_at: "2026-08-30T02:14:00.000Z",
      } as User),
      sendEmail: vi.fn().mockRejectedValue(providerError),
      now: () => new Date("2026-08-30T02:15:00.000Z"),
      logError,
    });

    await expect(notify()).resolves.toBe("failed");
    expect(logError).toHaveBeenCalledWith("Login notification email failed", providerError);
  });

  it("distinguishes a Supabase verification error from an unauthenticated user", async () => {
    const authError = new Error("Supabase unavailable");
    const logError = vi.fn();
    const notify = createLoginNotifier({
      getUser: vi.fn().mockRejectedValue(authError),
      sendEmail: vi.fn(),
      now: () => new Date("2026-08-30T02:15:00.000Z"),
      logError,
    });

    await expect(notify()).resolves.toBe("verification-failed");
    expect(logError).toHaveBeenCalledWith("Login notification user verification failed", authError);
  });

  it("does not send when the verified Supabase login event is no longer recent", async () => {
    const sendEmail = vi.fn();
    const notify = createLoginNotifier({
      getUser: async () => ({
        id: "user-1",
        email: "verified@example.com",
        last_sign_in_at: "2026-08-29T02:15:00.000Z",
      } as User),
      sendEmail,
      now: () => new Date("2026-08-30T02:15:00.000Z"),
      logError: vi.fn(),
    });

    await expect(notify()).resolves.toBe("login-not-recent");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns 401 when the API request has no authenticated Supabase user", async () => {
    const response = await createLoginNotificationHandler(async () => "unauthorized")(
      new Request("https://stylecue.example/api/auth/login-notification", {
        method: "POST",
        body: JSON.stringify({ email: "attacker-selected@example.com" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "AUTH_REQUIRED" });
  });

  it("rejects cross-site API requests before sending a notification", async () => {
    const notify = vi.fn().mockResolvedValue("sent");
    const response = await createLoginNotificationHandler(notify)(
      new Request("https://stylecue.example/api/auth/login-notification", {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "CROSS_SITE_REQUEST" });
    expect(notify).not.toHaveBeenCalled();
  });

  it.each([
    ["sent", 200, { ok: true }],
    ["email-unavailable", 422, { error: "EMAIL_UNAVAILABLE" }],
    ["failed", 502, { error: "EMAIL_DELIVERY_FAILED" }],
    ["verification-failed", 503, { error: "AUTH_UNAVAILABLE" }],
    ["login-not-recent", 409, { error: "LOGIN_NOT_RECENT" }],
  ] as const)("maps the %s notification result to an API response", async (result, status, body) => {
    const response = await createLoginNotificationHandler(async () => result)(
      new Request("https://stylecue.example/api/auth/login-notification", { method: "POST" }),
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual(body);
  });
});
