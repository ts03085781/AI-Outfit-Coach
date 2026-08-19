import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SettingsPage from "@/app/settings/page";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

const fetchMock = vi.fn();
const signOut = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({ auth: { signOut } }),
}));

function sessionResponse(user: unknown) {
  return new Response(JSON.stringify({ user }));
}

beforeEach(() => {
  document.cookie = "NEXT_LOCALE=; Path=/; Max-Age=0";
  localStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  signOut.mockReset();
});

describe("SettingsPage", () => {
  it("immediately applies and persists the selected language preference", async () => {
    fetchMock.mockResolvedValue(sessionResponse(null));

    render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);

    await screen.findByText("尚未登入");

    fireEvent.change(screen.getByLabelText("選擇語言"), { target: { value: "en" } });

    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
    expect(localStorage.getItem("NEXT_LOCALE")).toBe("en");
    expect(document.cookie).toContain("NEXT_LOCALE=en");
  });

  it("shows a sign-in link when the session is signed out", async () => {
    fetchMock.mockResolvedValue(sessionResponse(null));

    render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);

    expect(await screen.findByText("尚未登入")).toBeVisible();
    expect(screen.getByRole("link", { name: "前往登入" })).toHaveAttribute("href", "/login?next=/settings");
  });

  it("shows the signed-in identity with a safe avatar description", async () => {
    fetchMock.mockResolvedValue(sessionResponse({
      id: "user-1",
      name: "王小明",
      email: "ming@example.com",
      avatarUrl: "https://example.com/avatar.png",
    }));

    render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);

    expect(await screen.findByText("王小明")).toBeVisible();
    expect(screen.getByText("ming@example.com")).toBeVisible();
    expect(screen.getByRole("img", { name: "王小明 的個人頭像" })).toHaveAttribute("src", "https://example.com/avatar.png");
    expect(screen.getByRole("button", { name: "登出" })).toBeEnabled();
  });

  it("uses a neutral avatar placeholder for missing identity metadata", async () => {
    fetchMock.mockResolvedValue(sessionResponse({
      id: "user-1",
      name: null,
      email: null,
      avatarUrl: null,
    }));

    render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);

    expect(await screen.findByText("?")).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });

  it("uses name initials when the signed-in user has no avatar", async () => {
    fetchMock.mockResolvedValue(sessionResponse({
      id: "user-1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      avatarUrl: null,
    }));

    render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);

    expect(await screen.findByText("AL")).toBeVisible();
  });

  it("signs out locally without leaving Settings", async () => {
    fetchMock.mockResolvedValue(sessionResponse({
      id: "user-1",
      name: "王小明",
      email: "ming@example.com",
      avatarUrl: null,
    }));
    signOut.mockResolvedValue({ error: null });

    render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "登出" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(screen.getByRole("heading", { name: "設定" })).toBeVisible();
    expect(await screen.findByText("尚未登入")).toBeVisible();
  });

  it("keeps the identity and shows a safe error when sign-out fails", async () => {
    fetchMock.mockResolvedValue(sessionResponse({
      id: "user-1",
      name: "王小明",
      email: "ming@example.com",
      avatarUrl: null,
    }));
    signOut.mockResolvedValue({ error: new Error("secret provider failure") });

    render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "登出" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("登出暫時無法完成，請再試一次。");
    expect(screen.getByText("王小明")).toBeVisible();
    expect(screen.getByRole("button", { name: "登出" })).toBeEnabled();
  });
});
