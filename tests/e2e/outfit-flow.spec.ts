import { expect, test, type Page } from "@playwright/test";

const fixture = "tests/fixtures/outfit-safe.png";
const occasions = ["日常外出", "約會", "工作／面試", "正式活動"] as const;

const analysis = {
  summary: "這套已經有好基礎，配色乾淨而且輪廓清楚。",
  strengths: ["上衣和褲裝的比例清爽", "鞋子讓整體保持一致"],
  occasion_fit: "good",
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
    expect(route.request().postDataBuffer()?.toString()).toContain('name="locale"');
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ analysis, analysisToken: "mock-signed-analysis-token" }),
    });
  });
}

async function reachPhotoStep(page: Page, occasion = "日常外出") {
  await page.goto("/analyze");
  await page.getByRole("button", { name: occasion }).click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "加入一張全身照" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(fixture);
  await expect(page.getByRole("img", { name: "本機穿搭照片預覽" })).toBeVisible();
}

async function completeAnalysis(page: Page, occasion = "日常外出") {
  await reachPhotoStep(page, occasion);
  await page.getByRole("button", { name: "開始分析" }).click();
  await expect(page.getByText(analysis.summary)).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([{
    name: "NEXT_LOCALE",
    value: "zh-TW",
    url: "http://127.0.0.1:3000",
  }]);
});

test.describe("mock-only outfit flow", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows one empty upload surface before photo selection", async ({ page }) => {
    await page.goto("/analyze");
    await page.getByRole("button", { name: "日常外出" }).click();

    const upload = page.getByRole("button", { name: "加入一張全身照" });
    await expect(upload).toBeVisible();
    await expect(page.getByText("JPG、PNG、WebP，單張照片")).toBeVisible();
    await expect(page.getByRole("button", { name: "開始分析" })).toHaveCount(0);
    await expect(page.locator("#outfit-photo")).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp",
    );
    await expect(page.locator("#outfit-photo")).not.toHaveAttribute("capture");

    const uploadBox = await upload.boundingBox();
    expect(uploadBox?.width).toBeGreaterThanOrEqual(44);
    expect(uploadBox?.height).toBeGreaterThanOrEqual(352);
    await expect(upload).toHaveCSS("border-top-style", "dashed");
    await page.keyboard.press("Tab");
    await upload.focus();
    await expect(upload).toBeFocused();
    expect(await upload.evaluate((element) => getComputedStyle(element).outlineStyle))
      .not.toBe("none");
  });

  test("uses the language selected in settings", async ({ page }) => {
    await page.goto("/settings");
    await page.getByLabel("選擇語言").selectOption("en");

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page.goto("/analyze");
    await expect(page.getByRole("heading", { name: "Where are you going today?" })).toBeVisible();
    await expect(page.getByLabel("Select language")).toHaveCount(0);
  });

  test("replaces a prepared photo and restores the analysis action only when ready", async ({ page }) => {
    const analysisRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/analyze")) analysisRequests.push(request.url());
    });
    await reachPhotoStep(page);

    const replace = page.getByRole("button", { name: "更換照片" });
    await expect(replace).toBeVisible();
    const startAnalysis = page.getByRole("button", { name: "開始分析" });
    await expect(startAnalysis).toBeVisible();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await replace.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(fixture);
    const preview = page.getByRole("img", { name: "本機穿搭照片預覽" });
    const previewShell = page.locator(".photo-preview-shell");
    await expect(preview).toBeVisible();
    await expect(startAnalysis).toBeVisible();
    expect(analysisRequests).toHaveLength(0);

    const previewBox = await preview.boundingBox();
    const previewShellBox = await previewShell.boundingBox();
    const replaceBox = await replace.boundingBox();
    expect(previewBox).not.toBeNull();
    expect(previewShellBox).not.toBeNull();
    expect(replaceBox).not.toBeNull();
    if (!previewBox || !previewShellBox || !replaceBox) {
      throw new Error("Expected rendered preview controls to have bounding boxes");
    }
    expect(previewBox.x).toBeGreaterThanOrEqual(previewShellBox.x);
    expect(previewBox.y).toBeGreaterThanOrEqual(previewShellBox.y);
    expect(previewBox.x + previewBox.width)
      .toBeLessThanOrEqual(previewShellBox.x + previewShellBox.width);
    expect(previewBox.y + previewBox.height)
      .toBeLessThanOrEqual(previewShellBox.y + previewShellBox.height);
    expect(replaceBox.width).toBeGreaterThanOrEqual(44);
    expect(replaceBox?.height).toBeGreaterThanOrEqual(44);
    expect(replaceBox.x + (replaceBox.width / 2))
      .toBeGreaterThan(previewShellBox.x + (previewShellBox.width / 2));
    expect(replaceBox.y + (replaceBox.height / 2))
      .toBeLessThan(previewShellBox.y + (previewShellBox.height / 2));
    expect(replaceBox.x).toBeGreaterThanOrEqual(previewShellBox.x);
    expect(replaceBox.y).toBeGreaterThanOrEqual(previewShellBox.y);
    expect(replaceBox.x + replaceBox.width)
      .toBeLessThanOrEqual(previewShellBox.x + previewShellBox.width);
    expect(replaceBox.y + replaceBox.height)
      .toBeLessThanOrEqual(previewShellBox.y + previewShellBox.height);
    expect(await replace.evaluate((element) => {
      const channels = getComputedStyle(element).backgroundColor.match(/[\d.]+/g)?.map(Number);
      return channels?.length === 4 ? channels[3] : channels?.length === 3 ? 1 : 0;
    })).toBeGreaterThanOrEqual(0.9);

    const startAnalysisBox = await startAnalysis.boundingBox();
    expect(startAnalysisBox?.width).toBeGreaterThanOrEqual(44);
    expect(startAnalysisBox?.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Tab");
    await replace.focus();
    await expect(replace).toBeFocused();
    expect(await replace.evaluate((element) => getComputedStyle(element).outlineStyle))
      .not.toBe("none");
  });

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

    await reachPhotoStep(page);
    await page.getByRole("button", { name: "開始分析" }).click();
    await expect(page.getByText("衣物被遮住，請重新拍照。")).toBeVisible();
    await page.getByRole("button", { name: "重新拍照" }).click();

    await expect(page.getByRole("heading", { name: "拍下完整穿搭" })).toBeVisible();
    await expect(page.getByRole("button", { name: "開始分析" })).toHaveCount(0);
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

    await reachPhotoStep(page);
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
