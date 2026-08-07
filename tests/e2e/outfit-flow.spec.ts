import { expect, test, type Page } from "@playwright/test";

const fixture = "tests/fixtures/outfit-safe.png";
const occasions = ["日常外出", "約會", "工作／面試", "正式活動"] as const;

const analysis = {
  summary: "這套已經有好基礎，配色乾淨而且輪廓清楚。",
  strengths: ["上衣和褲裝的比例清爽", "鞋子讓整體保持一致"],
  occasion_fit: "適合",
  suggestions: [
    {
      action: "把上衣下擺整理平整",
      reason: "讓可見衣物的線條更俐落",
      expected_effect: "整體看起來更有精神",
    },
    {
      action: "把袖口微微捲起",
      reason: "露出一點手腕線條",
      expected_effect: "上衣比例更輕盈",
    },
  ],
  retake_required: false,
  retake_reason: null,
};

async function mockTelemetry(page: Page, received: unknown[] = []) {
  await page.route("**/api/telemetry", async (route) => {
    received.push(route.request().postDataJSON());
    await route.fulfill({ status: 204, body: "" });
  });
}

async function mockSuccessfulAnalysis(page: Page) {
  await page.route("**/api/analyze", async (route) => {
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ analysis, analysisToken: "mock-signed-analysis-token" }),
    });
  });
}

async function reachConsent(page: Page, occasion = "日常外出") {
  await page.goto("/");
  await page.getByRole("button", { name: occasion }).click();
  await page.setInputFiles("input[type=file]", fixture);
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByRole("img", { name: "本機穿搭照片預覽" })).toBeVisible();
  await page.getByRole("checkbox").check();
}

async function completeAnalysis(page: Page, occasion = "日常外出") {
  await reachConsent(page, occasion);
  await page.getByRole("button", { name: "開始分析" }).click();
  await expect(page.getByText(analysis.summary)).toBeVisible();
}

test.describe("mock-only outfit flow", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const occasion of occasions) {
    test(`completes the ${occasion} analysis without login or external upload`, async ({ page }) => {
      const requestUrls: string[] = [];
      page.on("request", (request) => requestUrls.push(request.url()));
      await mockTelemetry(page);
      await mockSuccessfulAnalysis(page);

      await completeAnalysis(page, occasion);

      expect(requestUrls.every((url) => new URL(url).origin === "http://127.0.0.1:3000")).toBe(true);
    });
  }

  test("shows a retake result and returns to an empty photo step", async ({ page }) => {
    const metrics: unknown[] = [];
    await mockTelemetry(page, metrics);
    await page.route("**/api/analyze", async (route) => {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          error: "RETAKE_REQUIRED",
          retake_reason: "衣物被遮住，請重新拍照。",
        }),
      });
    });

    await reachConsent(page);
    await page.getByRole("button", { name: "開始分析" }).click();
    await expect(page.getByText("衣物被遮住，請重新拍照。")).toBeVisible();
    await page.getByRole("button", { name: "重新拍照" }).click();

    await expect(page.getByRole("heading", { name: "拍下完整穿搭" })).toBeVisible();
    await expect(page.getByRole("button", { name: "繼續" })).toBeDisabled();
    expect(metrics).toContainEqual(expect.objectContaining({ type: "analysis_retake" }));
  });

  test("returns from a normal result to a new photo selection", async ({ page }) => {
    await mockTelemetry(page);
    await mockSuccessfulAnalysis(page);
    await completeAnalysis(page);

    await page.getByRole("button", { name: "重新選擇照片" }).click();

    await expect(page.getByRole("heading", { name: "拍下完整穿搭" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "你的穿搭建議" })).toHaveCount(0);
  });

  test("returns from a normal result to the first step", async ({ page }) => {
    await mockTelemetry(page);
    await mockSuccessfulAnalysis(page);
    await completeAnalysis(page);

    await page.getByRole("button", { name: "返回第一步驟" }).click();

    await expect(page.getByRole("heading", { name: "今天要去哪裡？" })).toBeVisible();
  });

  test("sends one bound follow-up and anonymous feedback", async ({ page }) => {
    const metrics: unknown[] = [];
    await mockTelemetry(page, metrics);
    await mockSuccessfulAnalysis(page);
    await page.route("**/api/follow-up", async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({
        analysisToken: "mock-signed-analysis-token",
        question: "不買新衣服還能怎麼調整？",
      });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ alternative: "把袖口捲起，讓上衣比例更輕盈。" }),
      });
    });

    await completeAnalysis(page);
    await page.getByLabel("想再問一個穿搭問題").fill("不買新衣服還能怎麼調整？");
    await page.getByRole("button", { name: "取得替代方法" }).click();
    await expect(page.getByText("把袖口捲起，讓上衣比例更輕盈。")).toBeVisible();
    await page.getByRole("button", { name: "有幫助" }).click();

    await expect(page.getByText("謝謝你的回饋。")).toBeVisible();
    await expect.poll(() => metrics).toContainEqual({ type: "feedback", helpful: true });
  });

  test("keeps the photo for a transient error and retries successfully", async ({ page }) => {
    const metrics: unknown[] = [];
    let attempts = 0;
    await mockTelemetry(page, metrics);
    await page.route("**/api/analyze", async (route) => {
      attempts += 1;
      if (attempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "AI_UNAVAILABLE" }),
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ analysis, analysisToken: "mock-signed-analysis-token" }),
      });
    });

    await reachConsent(page);
    await page.getByRole("button", { name: "開始分析" }).click();
    await expect(page.getByText("分析服務暫時無法使用，請稍後再試一次。"))
      .toBeVisible();
    await page.getByRole("button", { name: "再試一次" }).click();

    await expect(page.getByText(analysis.summary)).toBeVisible();
    expect(attempts).toBe(2);
    expect(metrics).toContainEqual(expect.objectContaining({
      type: "analysis_error",
      errorCode: "AI_UNAVAILABLE",
    }));
  });

  test("reload clears the in-memory photo and result", async ({ page }) => {
    await mockTelemetry(page);
    await mockSuccessfulAnalysis(page);
    await completeAnalysis(page);

    await page.reload();

    await expect(page.getByRole("heading", { name: "今天要去哪裡？" })).toBeVisible();
    await expect(page.getByText(analysis.summary)).toHaveCount(0);
  });
});

for (const width of [320, 390, 430]) {
  test(`keeps ${width}px layout free of horizontal overflow with usable result controls`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockTelemetry(page);
    await mockSuccessfulAnalysis(page);
    await completeAnalysis(page);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const controls = page.locator(".result-step button, .result-step textarea");
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect((box?.x ?? width) + (box?.width ?? width)).toBeLessThanOrEqual(width);
    }

    await page.getByLabel("想再問一個穿搭問題").fill("還有其他衣物調整嗎？");
    await expect(page.getByRole("button", { name: "取得替代方法" })).toBeEnabled();
  });
}
