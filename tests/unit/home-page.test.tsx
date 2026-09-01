import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { HomeContent } from "@/features/home/components/HomeContent";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: vi.fn((_success, error) => error({ code: 1 })) },
  });
});

it("shows retryable weather and searchable trend cards", async () => {
  const { container } = render(
    <LocaleProvider initialLocale="zh-TW"><HomeContent trendManifest={null} /></LocaleProvider>,
  );

  expect(screen.getByRole("main")).toHaveClass("editorial-page", "home-shell");
  expect(await screen.findByRole("button", { name: "點擊取得所在地天氣" })).toBeVisible();
  expect(screen.getByRole("link", { name: "拍下我的穿搭" })).toHaveAttribute("href", "/analyze");
  expect(screen.getByText("目前天氣條件")).toBeVisible();
  expect(screen.getByRole("link", { name: /透氣亞麻寬褲/ })).toHaveAttribute(
    "href",
    "https://www.google.com/search?q=%E9%80%8F%E6%B0%A3%E4%BA%9E%E9%BA%BB%E5%AF%AC%E8%A4%B2",
  );
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(5);
  expect(container.querySelector(".trend-index")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "點擊取得所在地天氣" }));
  expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
});

it("shows Blob images, localized AI copy, and traceable sources", () => {
  const item = {
    id: "sheer-jacket",
    imageUrl: "https://store.public.blob.vercel-storage.com/trend.png",
    translations: {
      "zh-TW": { name: "薄透風衣", description: "適合台灣換季。" },
      en: { name: "Sheer jacket", description: "For changing weather." },
      ja: { name: "シアージャケット", description: "季節の変わり目に。" },
      ko: { name: "시어 재킷", description: "환절기에 어울립니다." },
    },
    sources: [{ title: "Taiwan Fashion Report", url: "https://example.com/source" }],
  };
  const manifest = {
    schemaVersion: 1 as const,
    runId: "run-current",
    generatedAt: "2026-08-26T22:00:00.000Z",
    market: "TW" as const,
    items: Array.from({ length: 5 }, (_, index) => ({ ...item, id: `${item.id}-${index}` })),
  };

  const { container } = render(
    <LocaleProvider initialLocale="ja"><HomeContent trendManifest={manifest} /></LocaleProvider>,
  );

  expect(container.querySelectorAll("img.trend-image")).toHaveLength(5);
  expect(screen.getAllByRole("link", { name: "シアージャケット" })).toHaveLength(5);
  expect(screen.getAllByRole("link", { name: /Taiwan Fashion Report/ })[0]).toHaveAttribute(
    "href",
    "https://example.com/source",
  );
});
