import { expect, test, type Page } from "@playwright/test";

const fixture = "tests/fixtures/outfit-safe.png";

type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
};

async function mockSession(page: Page, user: SessionUser | null) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ user }),
    });
  });
}

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{
    name: "NEXT_LOCALE",
    value: "zh-TW",
    url: "http://127.0.0.1:3000",
  }]);
  await mockSession(page, null);
});

test("anonymous visitors can load the home, analysis, and settings pages", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goto("/analyze");
  await expect(page.getByRole("heading", { name: "今天要去哪裡？" })).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "設定" })).toBeVisible();
  await expect(page.getByText("尚未登入")).toBeVisible();
  await expect(page.getByRole("link", { name: "前往登入" }))
    .toHaveAttribute("href", "/login?next=/settings");
});

test("anonymous analysis shows one login action without starting analysis", async ({ page }) => {
  const analysisRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/analyze")) analysisRequests.push(request.url());
  });
  await page.route("**/api/photo-check", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ eligible: true, reason: null }),
    });
  });

  await page.goto("/analyze");
  await page.getByRole("button", { name: "日常外出" }).click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "加入一張穿搭照" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(fixture);
  await expect(page.getByRole("button", { name: "開始分析" })).toBeEnabled();

  await page.getByRole("button", { name: "開始分析" }).click();

  const dialog = page.getByRole("alertdialog", { name: "登入後開始分析" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "前往登入" })).toHaveCount(1);
  expect(analysisRequests).toHaveLength(0);
});

test("settings shows only the sign-in action for an anonymous session", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByText("尚未登入")).toBeVisible();
  await expect(page.getByRole("link", { name: "前往登入" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "登出" })).toHaveCount(0);
});

test("settings shows basic identity and sign-out for an authenticated session", async ({ page }) => {
  await page.unroute("**/api/auth/session");
  await mockSession(page, {
    id: "e2e-user",
    name: "E2E User",
    email: "e2e@example.com",
    avatarUrl: null,
  });

  await page.goto("/settings");

  await expect(page.getByText("E2E User")).toBeVisible();
  await expect(page.getByText("e2e@example.com")).toBeVisible();
  await expect(page.getByRole("button", { name: "登出" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "前往登入" })).toHaveCount(0);
});

test("login presents AI StyleCue information before starting Google OAuth", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "登入 AI StyleCue" })).toBeVisible();
  await expect(page.getByText("登入後即可開始穿搭分析。")).toBeVisible();
  await expect(page.getByText("我們只會取得你的姓名、Email 與 Google 個人頭像。")).toBeVisible();
  await expect(page.getByRole("button", { name: "使用 Google 登入" })).toBeEnabled();
});
