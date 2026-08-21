import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: vi.fn((_success, error) => error({ code: 1 })) },
  });
});

it("shows retryable weather, analysis navigation, and searchable trend cards", async () => {
  render(<LocaleProvider initialLocale="zh-TW"><HomePage /></LocaleProvider>);

  expect(await screen.findByRole("button", { name: "點擊取得所在地天氣" })).toBeVisible();
  expect(screen.getByRole("navigation", { name: "主要導覽" })).toBeVisible();
  expect(screen.getByTestId("navigation-icon-home")).toBeVisible();
  expect(screen.getByTestId("navigation-icon-analyze")).toBeVisible();
  expect(screen.getByTestId("navigation-icon-settings")).toBeVisible();
  expect(screen.getByRole("link", { name: "分析穿搭" })).toHaveAttribute("href", "/analyze");
  expect(screen.getByRole("link", { name: "首頁" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "拍下我的穿搭" })).toHaveAttribute("href", "/analyze");
  expect(screen.getByText("目前天氣條件")).toBeVisible();
  expect(screen.getByRole("link", { name: /透氣亞麻寬褲/ })).toHaveAttribute(
    "href",
    "https://www.google.com/search?q=%E9%80%8F%E6%B0%A3%E4%BA%9E%E9%BA%BB%E5%AF%AC%E8%A4%B2",
  );
  fireEvent.click(screen.getByRole("button", { name: "點擊取得所在地天氣" }));
  expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
});
