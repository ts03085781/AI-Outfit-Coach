import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

const signInWithOAuth = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { signInWithOAuth },
  }),
}));

import { LoginPanel } from "@/features/auth/components/LoginPanel";

describe("LoginPanel", () => {
  beforeEach(() => {
    signInWithOAuth.mockReset();
  });

  it("starts Google OAuth with the current origin and basic-profile scopes", async () => {
    signInWithOAuth.mockResolvedValue({ data: { provider: "google", url: "https://accounts.google.com" }, error: null });

    render(<LocaleProvider initialLocale="zh-TW"><LoginPanel nextPath="/analyze" /></LocaleProvider>);

    expect(screen.getByRole("main")).toHaveClass("editorial-page", "login-shell");
    expect(screen.getByRole("heading", { name: "登入 AI StyleCue" })).toBeVisible();
    const button = screen.getByRole("button", { name: "使用 Google 登入" });
    expect(button).toHaveClass("button-primary");
    expect(button).toBeEnabled();

    fireEvent.click(button);

    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=%2Fanalyze`,
        scopes: "openid email profile",
      },
    }));
  });

  it("shows a localized safe alert when the provider rejects login", async () => {
    signInWithOAuth.mockResolvedValue({ data: { provider: "google", url: null }, error: new Error("secret provider failure") });

    render(<LocaleProvider initialLocale="zh-TW"><LoginPanel nextPath="/analyze" /></LocaleProvider>);
    fireEvent.click(screen.getByRole("button", { name: "使用 Google 登入" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("登入未完成，請再試一次。");
    expect(screen.getByRole("alert")).not.toHaveTextContent("secret provider failure");
  });

  it("shows a localized safe alert when the OAuth request throws", async () => {
    signInWithOAuth.mockRejectedValue(new Error("secret network failure"));

    render(<LocaleProvider initialLocale="zh-TW"><LoginPanel nextPath="/analyze" /></LocaleProvider>);
    fireEvent.click(screen.getByRole("button", { name: "使用 Google 登入" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("登入未完成，請再試一次。");
    expect(screen.getByRole("alert")).not.toHaveTextContent("secret network failure");
  });

  it("disables the login button while the OAuth request is pending", () => {
    signInWithOAuth.mockReturnValue(new Promise(() => undefined));

    render(<LocaleProvider initialLocale="zh-TW"><LoginPanel nextPath="/analyze" /></LocaleProvider>);
    const button = screen.getByRole("button", { name: "使用 Google 登入" });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("正在前往 Google…");
  });
});
