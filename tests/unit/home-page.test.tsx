import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { HomeContent } from "@/features/home/components/HomeContent";
import { LocaleProvider, useAppLocale } from "@/lib/i18n/LocaleProvider";

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

const manifest = {
  schemaVersion: 1 as const,
  runId: "run-current",
  generatedAt: "2026-08-26T22:00:00.000Z",
  market: "TW" as const,
  items: Array.from({ length: 5 }, (_, index) => ({
    id: `sheer-jacket-${index}`,
    imageUrl: "https://store.public.blob.vercel-storage.com/trend.png",
    translations: {
      "zh-TW": { name: "薄透風衣", description: "適合台灣換季。" },
      en: { name: "Sheer jacket", description: "For changing weather." },
      ja: { name: "シアージャケット", description: "季節の変わり目に。" },
      ko: { name: "시어 재킷", description: "환절기에 어울립니다." },
    },
    sources: [{ title: "Taiwan Fashion Report", url: "https://example.com/source" }],
  })),
};

function LocaleControl() {
  const { setLocale } = useAppLocale();
  return <button type="button" onClick={() => setLocale("en")}>English</button>;
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    if (input === "/api/trends") return fetchMock(input, init);
    return originalFetch(input, init);
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: vi.fn((_success, error) => error({ code: 1 })) },
  });
});

it("renders the home shell and five trend skeletons before trends resolve", () => {
  fetchMock.mockReturnValue(new Promise(() => undefined));

  render(<LocaleProvider initialLocale="zh-TW"><HomeContent /></LocaleProvider>);

  expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
  expect(screen.getAllByTestId("trend-skeleton")).toHaveLength(5);
});

it("shows Blob images, localized AI copy, and traceable sources", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ manifest })));

  const { container } = render(
    <LocaleProvider initialLocale="ja"><HomeContent /></LocaleProvider>,
  );

  expect(container.querySelectorAll("img.trend-image")).toHaveLength(0);
  expect(await screen.findAllByRole("link", { name: "シアージャケット" })).toHaveLength(5);
  expect(container.querySelectorAll("img.trend-image")).toHaveLength(5);
  expect(screen.getAllByRole("link", { name: /Taiwan Fashion Report/ })[0]).toHaveAttribute(
    "href",
    "https://example.com/source",
  );
});

it.each([
  ["null manifest", () => Promise.resolve(new Response(JSON.stringify({ manifest: null })))],
  ["non-OK response", () => Promise.resolve(new Response(null, { status: 503 }))],
  ["invalid manifest", () => Promise.resolve(new Response(JSON.stringify({ manifest: { items: [] } })))],
  ["rejected request", () => Promise.reject(new Error("offline"))],
])("uses fallback trends after %s", async (_name, response) => {
  fetchMock.mockImplementation(response);
  render(<LocaleProvider initialLocale="zh-TW"><HomeContent /></LocaleProvider>);

  expect(await screen.findByRole("link", { name: /透氣亞麻寬褲/ })).toBeVisible();
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(5);
});

it("localizes loaded API trends without refetching", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ manifest })));

  render(
    <LocaleProvider initialLocale="zh-TW">
      <HomeContent />
      <LocaleControl />
    </LocaleProvider>,
  );

  expect(await screen.findAllByRole("link", { name: "薄透風衣" })).toHaveLength(5);
  fireEvent.click(screen.getByRole("button", { name: "English" }));

  expect(await screen.findAllByRole("link", { name: "Sheer jacket" })).toHaveLength(5);
  expect(fetchMock).toHaveBeenCalledOnce();
});
