import { expect, test } from "@playwright/test";

test("opens the magazine-style homepage and links to analysis", async ({ context, page }) => {
  await context.addCookies([{
    name: "NEXT_LOCALE",
    value: "zh-TW",
    url: "http://127.0.0.1:3000",
  }]);
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "分析穿搭" })).toHaveAttribute("href", "/analyze");
  await expect(page.getByRole("link", { name: "首頁" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "分析穿搭" }).click();
  await expect(page).toHaveURL(/\/analyze$/);
  await expect(page.getByRole("heading", { name: "今天要去哪裡？" })).toBeVisible();
  await expect(page.getByRole("link", { name: "分析穿搭" })).toHaveAttribute("aria-current", "page");

  await page.getByRole("link", { name: "設定" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "設定" })).toBeVisible();
  await expect(page.getByRole("link", { name: "設定" })).toHaveAttribute("aria-current", "page");
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
