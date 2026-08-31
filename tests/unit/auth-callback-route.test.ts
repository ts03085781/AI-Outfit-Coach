// @vitest-environment node

import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  sendLoginNotificationEmail: vi.fn(),
  sendRegistrationNotificationEmail: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      getUser: mocks.getUser,
    },
  }),
}));
vi.mock("@/features/auth/login-notification", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/auth/login-notification")>(),
  sendLoginNotificationEmail: mocks.sendLoginNotificationEmail,
}));
vi.mock("@/features/auth/registration-notification", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/auth/registration-notification")>(),
  sendRegistrationNotificationEmail: mocks.sendRegistrationNotificationEmail,
}));

import { GET } from "@/app/auth/callback/route";

describe("GET /auth/callback route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T02:15:00.000Z"));
    mocks.after.mockReset();
    mocks.exchangeCodeForSession.mockReset();
    mocks.getUser.mockReset();
    mocks.sendLoginNotificationEmail.mockReset();
    mocks.sendRegistrationNotificationEmail.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("verifies the exchanged session and schedules Resend after the redirect response", async () => {
    let scheduled: (() => Promise<void>) | undefined;
    mocks.after.mockImplementation((task: () => Promise<void>) => {
      scheduled = task;
    });
    mocks.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "verified@example.com",
          last_sign_in_at: "2026-08-30T02:14:00.000Z",
        } as User,
      },
      error: null,
    });
    mocks.sendLoginNotificationEmail.mockResolvedValue(undefined);

    const response = await GET(new Request(
      "https://stylecue.example/auth/callback?code=valid&next=/settings",
    ));

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("valid");
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.sendLoginNotificationEmail).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://stylecue.example/settings?login=success");

    await scheduled?.();
    expect(mocks.sendLoginNotificationEmail).toHaveBeenCalledWith({
      email: "verified@example.com",
      loginAt: expect.any(Date),
      idempotencyKey: "login-notification/user-1/2026-08-30T02:14:00.000Z",
    });
    expect(mocks.sendRegistrationNotificationEmail).not.toHaveBeenCalled();
  });

  it("schedules only the registration email for a newly created user", async () => {
    let scheduled: (() => Promise<void>) | undefined;
    mocks.after.mockImplementation((task: () => Promise<void>) => {
      scheduled = task;
    });
    mocks.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "verified@example.com",
          created_at: "2026-08-30T02:13:58.000Z",
          last_sign_in_at: "2026-08-30T02:14:00.000Z",
        } as User,
      },
      error: null,
    });
    mocks.sendLoginNotificationEmail.mockResolvedValue(undefined);
    mocks.sendRegistrationNotificationEmail.mockResolvedValue(undefined);

    const response = await GET(new Request(
      "https://stylecue.example/auth/callback?code=valid&next=/settings",
    ));

    expect(response.headers.get("location")).toBe("https://stylecue.example/settings?login=success");
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.sendLoginNotificationEmail).not.toHaveBeenCalled();
    expect(mocks.sendRegistrationNotificationEmail).not.toHaveBeenCalled();

    await scheduled?.();
    expect(mocks.sendRegistrationNotificationEmail).toHaveBeenCalledWith({
      email: "verified@example.com",
      registeredAt: new Date("2026-08-30T02:13:58.000Z"),
      idempotencyKey: "registration-notification/user-1/2026-08-30T02:13:58.000Z",
    });
    expect(mocks.sendLoginNotificationEmail).not.toHaveBeenCalled();
  });
});
