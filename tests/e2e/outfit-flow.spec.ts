import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const occasions = ["日常外出", "約會", "上班", "正式場合"] as const;

for (const occasion of occasions) {
  test(`completes the ${occasion} analysis locally without login or external photo upload`, async ({ page }) => {
    const requestUrls: string[] = [];
    page.on("request", (request) => requestUrls.push(request.url()));

    await page.route("**/api/analyze", async (route) => {
      expect(route.request().method()).toBe("POST");
      expect(new URL(route.request().url()).origin).toBe("http://127.0.0.1:3000");
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          summary: "這套已經有好基礎，配色乾淨而且輪廓清楚。",
          strengths: ["上衣和褲裝的比例清爽", "鞋子讓整體保持一致"],
          occasion_fit: "適合",
          suggestions: [
            {
              action: "把上衣下擺整理平整",
              reason: "讓可見衣物的線條更俐落",
              expected_effect: "整體看起來更有精神",
            },
          ],
          retake_required: false,
          retake_reason: null,
        }),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: occasion }).click();
    await page.setInputFiles("input[type=file]", "tests/fixtures/outfit-safe.png");
    await page.getByRole("button", { name: "繼續" }).click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "開始分析" }).click();

    await expect(page.getByText("這套已經有好基礎，配色乾淨而且輪廓清楚。")).toBeVisible();
    expect(requestUrls.every((url) => new URL(url).origin === "http://127.0.0.1:3000")).toBe(true);
  });
}
