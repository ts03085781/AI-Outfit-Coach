import { expect, test, type Page } from "@playwright/test";

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

async function mockAnonymousAnalysisQuota(page: Page) {
  await page.route("**/api/analysis-quota", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 401,
      body: JSON.stringify({ error: "UNAUTHORIZED" }),
    });
  });
}

async function mockEmptyTrends(page: Page) {
  await page.route("**/api/trends", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ manifest: null }),
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
  await page.route("**/api/subscription", (route) => route.fulfill({ status: 401, json: { error: "AUTH_REQUIRED" } }));
  await mockAnonymousAnalysisQuota(page);
  await mockEmptyTrends(page);
});

test("anonymous visitors can load the home, analysis, and settings pages", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goto("/analyze");
  await expect(page.getByRole("alertdialog", { name: "登入後開始分析" })).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByRole("main")).toHaveClass(/editorial-page/);
  await expect(page.getByRole("heading", { name: "設定" })).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveClass(/field-control/);
  await expect(page.getByText("尚未登入")).toBeVisible();
  await expect(page.getByRole("link", { name: "前往登入" }))
    .toHaveAttribute("href", "/login?next=/settings");
});

test("anonymous analysis shows one login action on entry without accepting flow input", async ({ page }) => {
  const analysisRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/analyze")) analysisRequests.push(request.url());
  });
  await page.goto("/analyze");

  const dialog = page.getByRole("alertdialog", { name: "登入後開始分析" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveClass(/editorial-card/);
  const loginLink = dialog.getByRole("link", { name: "前往登入" });
  await expect(loginLink).toHaveCount(1);
  await expect(loginLink).toHaveClass(/button-primary/);
  await expect(loginLink).toBeFocused();
  await expect(page.getByRole("button", { name: "日常外出", includeHidden: true })).toBeDisabled();
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
  const googleButton = page.getByRole("button", { name: "使用 Google 登入" });
  await expect(googleButton).toHaveClass(/button-primary/);
  await expect(googleButton).toBeEnabled();
  await expect(page.getByRole("link", { name: "返回設定" })).toHaveAttribute("href", "/settings");
});

test("login errors use the error palette without exposing provider details", async ({ page }) => {
  await page.goto("/login?error=oauth");

  const alert = page.getByText("登入未完成，請再試一次。", { exact: true });
  await expect(alert).toHaveText("登入未完成，請再試一次。");
  await expect(alert).toHaveCSS("color", "rgb(186, 26, 26)");
  await expect(alert).toHaveCSS("background-color", "rgb(255, 218, 214)");
  await expect(alert).toHaveCSS("border-color", "rgb(186, 26, 26)");
});

test("subscription sends anonymous visitors to login and returns to settings", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText("NT$60／月")).toBeVisible();
  await page.getByRole("button", { name: "立即訂閱" }).click();
  await expect(page).toHaveURL(/\/login\?next=\/settings&reason=auth/);
});

test("subscription shows maintenance to signed-in visitors", async ({ page }) => {
  await mockSession(page, { id: "user-1", name: "Test", email: null, avatarUrl: null });
  await page.route("**/api/subscription", (route) => route.fulfill({ status: route.request().method() === "POST" ? 503 : 401, json: { error: "SUBSCRIPTION_MAINTENANCE" } }));
  await page.goto("/settings");
  const dialogPromise = page.waitForEvent("dialog").then(async (dialog) => {
    expect(dialog.message()).toBe("此功能維護中，請稍後再試。");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "立即訂閱" }).click();
  await dialogPromise;
  await expect(page).toHaveURL(/\/settings$/);
});


test("active subscription can cancel renewal and retains the paid period", async ({ page }) => {
  const summary = { status: "active", isActive: true, currentPeriodStart: "2026-09-10T00:00:00Z", currentPeriodEnd: "2026-10-10T00:00:00Z", cancelAtPeriodEnd: false, cancelRequestedAt: null, amountTwd: 60, billingInterval: "month" };
  await mockSession(page, { id: "user-1", name: "Test", email: null, avatarUrl: null });
  await page.route("**/api/subscription", (route) => route.fulfill({ json: summary }));
  await page.route("**/api/subscription/cancel", (route) => route.fulfill({ json: { ...summary, cancelAtPeriodEnd: true, cancelRequestedAt: "2026-09-11T00:00:00Z" } }));
  await page.goto("/settings");
  const dialogPromise = page.waitForEvent("dialog").then(async (dialog) => {
    expect(dialog.message()).toContain("不會退款");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "取消訂閱" }).click();
  await dialogPromise;
  await expect(page.getByText(/已取消續訂，可使用至/)).toBeVisible();
  await expect(page.getByRole("button", { name: "取消訂閱" })).toHaveCount(0);
});
