import playwrightConfig from "../../playwright.config";
import {
  APPLICATION_ROUTES,
  prewarmApplicationRoutes,
} from "../e2e/global-setup";

describe("Playwright configuration", () => {
  it("prewarms every application page after the dev server starts", () => {
    expect(playwrightConfig.globalSetup).toBe("./tests/e2e/global-setup.ts");
    expect(APPLICATION_ROUTES).toEqual(["/", "/analyze", "/settings", "/login"]);
  });

  it("uses the configured local port and waits for every response body", async () => {
    const consumed: string[] = [];
    const fetchPage = vi.fn(async (url: URL, _options: RequestInit) => ({
      ok: true,
      status: 200,
      async arrayBuffer() {
        consumed.push(url.href);
        return new ArrayBuffer(0);
      },
    }));

    await prewarmApplicationRoutes("http://127.0.0.1:4312", fetchPage);

    expect(consumed).toEqual([
      "http://127.0.0.1:4312/",
      "http://127.0.0.1:4312/analyze",
      "http://127.0.0.1:4312/settings",
      "http://127.0.0.1:4312/login",
    ]);
    expect(fetchPage.mock.calls.every(([, options]) => options?.redirect === "manual"))
      .toBe(true);
  });

  it("refuses to prewarm an external origin", async () => {
    await expect(prewarmApplicationRoutes("https://example.com"))
      .rejects.toThrow("restricted to http://127.0.0.1");
  });
});
