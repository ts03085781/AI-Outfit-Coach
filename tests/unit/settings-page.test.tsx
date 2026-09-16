import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SettingsPage from "@/app/(app)/settings/page";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

const fetchMock = vi.fn();
const signOut = vi.fn();
const subscriptionFetch = vi.fn();
const active = { status: "active", isActive: true, currentPeriodStart: "2026-09-10T00:00:00Z", currentPeriodEnd: "2026-10-10T00:00:00Z", cancelAtPeriodEnd: false, cancelRequestedAt: null, amountTwd: 60, billingInterval: "month" };

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({ auth: { signOut } }),
}));

function sessionResponse(user: unknown) {
  return new Response(JSON.stringify({ user }));
}

beforeEach(() => {
  document.cookie = "NEXT_LOCALE=; Path=/; Max-Age=0";
  localStorage.clear();
  vi.stubGlobal("fetch", (url: string, options?: RequestInit) => url === "/api/auth/session" ? fetchMock(url, options) : subscriptionFetch(url, options));
  subscriptionFetch.mockReset();
  subscriptionFetch.mockResolvedValue(new Response(null, { status: 401 }));
  fetchMock.mockReset();
  signOut.mockReset();
});

describe("SettingsPage", () => {
  it("immediately applies and persists the selected language preference", async () => {
    fetchMock.mockResolvedValue(sessionResponse(null));

    render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);

    await screen.findByText("尚未登入");

    expect(screen.getByRole("main")).toHaveClass("editorial-page", "settings-shell");
    expect(screen.getByRole("combobox")).toHaveClass("field-control");

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

  it("treats an empty session user ID as signed out", async () => {
    fetchMock.mockResolvedValue(sessionResponse({
      id: "",
      name: "王小明",
      email: "ming@example.com",
      avatarUrl: "https://example.com/avatar.png",
    }));

    render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);

    expect(await screen.findByText("尚未登入")).toBeVisible();
    expect(screen.queryByText("王小明")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "登出" })).not.toBeInTheDocument();
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

it("shows monthly details and uses the subscription API for maintenance", async () => {
  fetchMock.mockImplementation(async () => sessionResponse({ id: "user-1" }));
  subscriptionFetch.mockImplementation(async (_url, options) => options?.method === "POST"
    ? Response.json({ error: "SUBSCRIPTION_MAINTENANCE" }, { status: 503 })
    : new Response(null, { status: 401 }));
  const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
  render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);
  expect(screen.getByText("NT$60／月")).toBeVisible();
  fireEvent.click(await screen.findByRole("button", { name: "立即訂閱" }));
  await waitFor(() => expect(alert).toHaveBeenCalledWith("此功能維護中，請稍後再試。"));
  alert.mockRestore();
});

it("shows active entitlement and cancels renewal while retaining access", async () => {
  fetchMock.mockImplementation(async () => sessionResponse({ id: "user-1" }));
  subscriptionFetch.mockImplementation(async (url) => Response.json(url.endsWith("/cancel")
    ? { ...active, cancelAtPeriodEnd: true, cancelRequestedAt: "2026-09-11T00:00:00Z" } : active));
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "取消訂閱" }));
  expect(await screen.findByText(/已取消續訂，可使用至/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "取消訂閱" })).not.toBeInTheDocument();
  expect(confirm.mock.calls[0][0]).toContain("不會退款");
  confirm.mockRestore();
});

it("clears paid entitlement after successful signout", async () => {
  fetchMock.mockImplementation(async () => sessionResponse({ id: "user-1" }));
  subscriptionFetch.mockImplementation(async () => Response.json(active));
  signOut.mockResolvedValue({ error: null });
  render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);
  await screen.findByRole("button", { name: "取消訂閱" });
  fireEvent.click(await screen.findByRole("button", { name: "登出" }));
  expect(await screen.findByRole("button", { name: "立即訂閱" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "取消訂閱" })).not.toBeInTheDocument();
});

it("offers retry when subscription cannot be loaded", async () => {
  fetchMock.mockImplementation(async () => sessionResponse(null));
  subscriptionFetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
  render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "重試" }));
  expect(await screen.findByRole("button", { name: "立即訂閱" })).toBeVisible();
});

it("keeps renewal active when cancellation confirmation is dismissed", async () => {
  fetchMock.mockImplementation(async () => sessionResponse({ id: "user-1" }));
  subscriptionFetch.mockImplementation(async () => Response.json(active));
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "取消訂閱" }));
  expect(screen.getByRole("button", { name: "取消訂閱" })).toBeEnabled();
  expect(subscriptionFetch.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
  confirm.mockRestore();
});

it("keeps cancellation retryable when the API fails", async () => {
  fetchMock.mockImplementation(async () => sessionResponse({ id: "user-1" }));
  subscriptionFetch.mockImplementation(async (url) => url.endsWith("/cancel")
    ? Response.json({ error: "SUBSCRIPTION_UNAVAILABLE" }, { status: 503 }) : Response.json(active));
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
  render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "取消訂閱" }));
  await waitFor(() => expect(alert).toHaveBeenCalledWith("暫時無法取消續訂，請稍後再試。"));
  expect(screen.getByRole("button", { name: "取消訂閱" })).toBeEnabled();
  expect(screen.queryByText(/已取消續訂/)).not.toBeInTheDocument();
  confirm.mockRestore();
  alert.mockRestore();
});

it("does not restore an active subscription from a stale request after signout", async () => {
  fetchMock.mockImplementation(async () => sessionResponse({ id: "user-1" }));
  let resolve!: (response: Response) => void;
  subscriptionFetch.mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
  signOut.mockResolvedValue({ error: null });
  render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "登出" }));
  await screen.findByRole("button", { name: "立即訂閱" });
  resolve(Response.json(active));
  await waitFor(() => expect(screen.getByRole("button", { name: "立即訂閱" })).toBeVisible());
  expect(screen.queryByRole("button", { name: "取消訂閱" })).not.toBeInTheDocument();
});


it("ignores subscription activation completing after signout and prevents duplicate submissions", async () => {
  fetchMock.mockImplementation(async () => sessionResponse({ id: "user-1" }));
  let resolve!: (response: Response) => void;
  subscriptionFetch.mockImplementation(async (_url, options) => options?.method === "POST"
    ? new Promise<Response>((done) => { resolve = done; })
    : new Response(null, { status: 401 }));
  signOut.mockResolvedValue({ error: null });
  render(<LocaleProvider initialLocale="zh-TW"><SettingsPage /></LocaleProvider>);
  const button = await screen.findByRole("button", { name: "立即訂閱" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(subscriptionFetch.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  fireEvent.click(await screen.findByRole("button", { name: "登出" }));
  await screen.findByText("尚未登入");
  await act(async () => { resolve(Response.json(active)); });
  expect(screen.getByRole("button", { name: "立即訂閱" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "取消訂閱" })).not.toBeInTheDocument();
});
