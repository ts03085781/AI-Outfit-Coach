// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  renderRegistrationNotificationEmail,
  sendRegistrationNotificationEmail,
} from "@/features/auth/registration-notification";

describe("registration notification", () => {
  it("renders an escaped account email and server registration time", () => {
    const html = renderRegistrationNotificationEmail({
      email: 'user+<admin>&"@example.com',
      registeredAt: new Date("2026-08-30T02:13:58.000Z"),
    });

    expect(html).toContain("AI Outfit Coach");
    expect(html).toContain("您的 AI Outfit Coach 帳號已成功註冊");
    expect(html).toContain("user+&lt;admin&gt;&amp;&quot;@example.com");
    expect(html).not.toContain('user+<admin>&"@example.com');
    expect(html).toContain("2026-08-30 02:13:58 UTC");
  });

  it("sends the registration notification from the configured address", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "email-1" }, error: null });

    await sendRegistrationNotificationEmail(
      {
        email: "user@example.com",
        registeredAt: new Date("2026-08-30T02:13:58.000Z"),
        idempotencyKey: "registration-notification/user-1/2026-08-30T02:13:58.000Z",
      },
      { client: { emails: { send } }, from: "AI Outfit Coach <welcome@example.com>" },
    );

    expect(send).toHaveBeenCalledWith(
      {
        from: "AI Outfit Coach <welcome@example.com>",
        to: "user@example.com",
        subject: "AI Outfit Coach 註冊成功",
        html: expect.stringContaining("您的 AI Outfit Coach 帳號已成功註冊"),
      },
      { idempotencyKey: "registration-notification/user-1/2026-08-30T02:13:58.000Z" },
    );
  });

  it("rejects when Resend reports a registration delivery error", async () => {
    const providerError = { message: "invalid sender", name: "validation_error" };

    await expect(sendRegistrationNotificationEmail(
      {
        email: "user@example.com",
        registeredAt: new Date("2026-08-30T02:13:58.000Z"),
        idempotencyKey: "registration-notification/user-1/2026-08-30T02:13:58.000Z",
      },
      {
        client: {
          emails: {
            send: vi.fn().mockResolvedValue({ data: null, error: providerError }),
          },
        },
        from: "AI Outfit Coach <welcome@example.com>",
      },
    )).rejects.toMatchObject({
      message: "Resend rejected the registration notification",
      cause: providerError,
    });
  });
});
