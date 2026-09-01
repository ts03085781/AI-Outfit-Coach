import { expect, test } from "@playwright/test";

function browserTrendManifest() {
  const translations = {
    "zh-TW": { name: "API 薄透風衣", description: "適合台灣換季。" },
    en: { name: "API sheer jacket", description: "For changing weather." },
    ja: { name: "API シアージャケット", description: "季節の変わり目に。" },
    ko: { name: "API 시어 재킷", description: "환절기에 어울립니다." },
  };
  return {
    schemaVersion: 1,
    runId: "e2e-run",
    generatedAt: "2026-08-26T22:00:00.000Z",
    market: "TW",
    items: Array.from({ length: 5 }, (_, index) => ({
      id: `e2e-trend-${index + 1}`,
      imageUrl: `https://store.public.blob.vercel-storage.com/e2e-${index + 1}.png`,
      translations,
      sources: [{ title: "Source", url: `https://example.com/${index + 1}` }],
    })),
  };
}

test("opens the magazine-style homepage and links to analysis", async ({ context, page }) => {
  await context.addCookies([{
    name: "NEXT_LOCALE",
    value: "zh-TW",
    url: "http://127.0.0.1:3000",
  }]);
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ user: { id: "e2e-user" } }),
    });
  });
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "分析穿搭" })).toHaveAttribute("href", "/analyze");
  await expect(page.getByRole("link", { name: "首頁" })).toHaveAttribute("aria-current", "page");
  await page.getByTestId("app-navigation").evaluate((navigation) => {
    navigation.dataset.persistenceProbe = "same-instance";
  });
  await page.getByRole("link", { name: "分析穿搭" }).click();
  await expect(page).toHaveURL(/\/analyze$/);
  await expect(page.getByTestId("app-navigation")).toHaveAttribute(
    "data-persistence-probe",
    "same-instance",
  );
  await expect(page.getByRole("heading", { name: "今天要去哪裡？" })).toBeVisible();
  await expect(page.getByRole("link", { name: "分析穿搭" })).toHaveAttribute("aria-current", "page");

  await page.getByRole("link", { name: "設定" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId("app-navigation")).toHaveAttribute(
    "data-persistence-probe",
    "same-instance",
  );
  await expect(page.getByRole("heading", { name: "設定" })).toBeVisible();
  await expect(page.getByRole("link", { name: "設定" })).toHaveAttribute("aria-current", "page");
});

test("renders the home shell before delayed trends arrive", async ({ context, page }) => {
  await context.addCookies([{
    name: "NEXT_LOCALE",
    value: "zh-TW",
    url: "http://127.0.0.1:3100",
  }]);
  let releaseResponse: (() => void) | undefined;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route("**/api/trends", async (route) => {
    await responseGate;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ manifest: browserTrendManifest() }),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("trend-skeleton")).toHaveCount(5);

  releaseResponse?.();
  await expect(page.getByRole("heading", { name: "API 薄透風衣" }).first()).toBeVisible();
  await expect(page.getByTestId("trend-skeleton")).toHaveCount(0);
});

test("keeps the app navigation visible without horizontal overflow on a narrow screen", async ({ context, page }) => {
  await context.addCookies([{
    name: "NEXT_LOCALE",
    value: "zh-TW",
    url: "http://127.0.0.1:3000",
  }]);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");

  await expect(page.getByTestId("app-navigation")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("keeps English navigation labels on one line at the label-caps scale on a 320px screen", async ({ context, page }) => {
  await context.addCookies([{
    name: "NEXT_LOCALE",
    value: "en",
    url: "http://127.0.0.1:3000",
  }]);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  const labels = navigation.locator(".app-navigation-label");
  await expect(labels).toHaveCount(3);
  await expect(labels).toHaveText(["Home", "Analyze outfit", "Settings"]);
  await expect(labels.first()).toHaveCSS("font-size", "12px");
  await expect(labels.first()).toHaveCSS("letter-spacing", "1.8px");

  const dimensions = await navigation.evaluate((nav) => ({
    navOverflows: nav.scrollWidth > nav.clientWidth,
    documentOverflows: document.documentElement.scrollWidth > window.innerWidth,
    labels: [...nav.querySelectorAll<HTMLElement>(".app-navigation-label")].map((label) => {
      const link = label.closest("a");
      const lineHeight = Number.parseFloat(getComputedStyle(label).lineHeight);
      return {
        labelOverflows: label.scrollWidth > label.clientWidth,
        linkOverflows: link ? link.scrollWidth > link.clientWidth : true,
        isSingleLine: label.scrollHeight <= Math.ceil(lineHeight) + 1,
      };
    }),
  }));

  expect(dimensions.navOverflows).toBe(false);
  expect(dimensions.documentOverflows).toBe(false);
  expect(dimensions.labels).toEqual([
    { labelOverflows: false, linkOverflows: false, isSingleLine: true },
    { labelOverflows: false, linkOverflows: false, isSingleLine: true },
    { labelOverflows: false, linkOverflows: false, isSingleLine: true },
  ]);
});

test("keeps a full-width branded navigation fixed to the top across desktop pages", async ({ context, page }) => {
  await context.addCookies([{
    name: "NEXT_LOCALE",
    value: "zh-TW",
    url: "http://127.0.0.1:3000",
  }]);
  await page.setViewportSize({ width: 768, height: 900 });
  for (const path of ["/", "/analyze", "/settings"]) {
    await page.goto(path);

    const navigation = page.getByRole("navigation", { name: "主要導覽" });
    const navigationBox = await navigation.boundingBox();

    await expect(page.getByRole("link", { name: "AI StyleCue" })).toBeVisible();
    await expect(navigation).toHaveCSS("position", "fixed");
    expect(navigationBox).not.toBeNull();
    expect(navigationBox!.x).toBeCloseTo(0, 0);
    expect(navigationBox!.y).toBeCloseTo(0, 0);
    expect(navigationBox!.width).toBeCloseTo(768, 0);
  }

  await page.goto("/");
  const navigationBox = await page.getByRole("navigation", { name: "主要導覽" }).boundingBox();
  const heroBox = await page.locator(".home-hero").boundingBox();
  expect(navigationBox).not.toBeNull();
  expect(heroBox).not.toBeNull();
  expect(navigationBox!.y + navigationBox!.height).toBeLessThanOrEqual(heroBox!.y);
});
