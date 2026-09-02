import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import AnalyzePage from "@/app/(app)/analyze/page";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(
    JSON.stringify({
      limit: 3,
      used: 0,
      remaining: 3,
      resetAt: "2026-09-01T16:00:00.000Z",
    }),
    { status: 200 },
  )));
});

it("shows the occasion question", async () => {
  Object.defineProperty(navigator, "language", { configurable: true, value: "zh-TW" });
  Object.defineProperty(navigator, "languages", { configurable: true, value: ["zh-TW"] });

  render(await AnalyzePage({ searchParams: Promise.resolve({}) }));
  await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "false"));
  expect(screen.getByRole("heading", { name: "今天要去哪裡？" })).toBeVisible();
});

it("uses the server-selected locale before client effects run", async () => {
  render(
    <LocaleProvider initialLocale="ja">
      {await AnalyzePage({ searchParams: Promise.resolve({}) })}
    </LocaleProvider>,
  );

  await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "false"));
  expect(screen.getByRole("heading", { name: "今日はどこへ行きますか？" })).toBeVisible();
});

it("announces a successful login without restoring a prior photo", async () => {
  render(await AnalyzePage({ searchParams: Promise.resolve({ login: "success" }) }));

  await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "false"));
  expect(screen.getByRole("status")).toHaveTextContent("登入成功，請重新選擇照片開始分析。");
  expect(screen.queryByRole("img", { name: "本機穿搭照片預覽" })).not.toBeInTheDocument();
});
