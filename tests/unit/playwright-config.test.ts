import playwrightConfig from "../../playwright.config";
import {
  APPLICATION_ROUTES,
  prewarmApplicationBrowser,
  prewarmApplicationRoutes,
  requestPolicyFor,
  waitForRouteReadiness,
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

  it("blocks external and unknown API requests while mocking every page API", () => {
    const origin = new URL("http://127.0.0.1:4312");

    expect(requestPolicyFor(origin, "https://api.open-meteo.com/v1/forecast"))
      .toEqual({ action: "abort" });
    expect(requestPolicyFor(origin, `${origin.origin}/auth/callback?code=live-code`))
      .toEqual({ action: "abort" });
    expect(requestPolicyFor(origin, `${origin.origin}/unexpected-server-handler`))
      .toEqual({ action: "abort" });
    expect(requestPolicyFor(origin, `${origin.origin}/api/photo-check`))
      .toEqual({ action: "abort" });
    expect(requestPolicyFor(origin, `${origin.origin}/login`))
      .toEqual({ action: "continue" });
    expect(requestPolicyFor(origin, `${origin.origin}/_next/static/chunk.js`))
      .toEqual({ action: "continue" });
    expect(requestPolicyFor(origin, `${origin.origin}/api/auth/session`)).toEqual({
      action: "fulfill",
      body: JSON.stringify({ user: null }),
      status: 200,
    });
    expect(requestPolicyFor(origin, `${origin.origin}/api/trends`)).toEqual({
      action: "fulfill",
      body: JSON.stringify({ manifest: null }),
      status: 200,
    });
    expect(requestPolicyFor(origin, `${origin.origin}/api/analysis-quota`)).toEqual({
      action: "fulfill",
      body: JSON.stringify({ error: "UNAUTHORIZED" }),
      status: 401,
    });
  });

  it("replaces inherited live-service credentials with inert test values", async () => {
    const inherited = {
      BLOB_READ_WRITE_TOKEN: "live-blob-token",
      BLOB_STORE_ID: "live-blob-store",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "live-public-key",
      NEXT_PUBLIC_SUPABASE_URL: "https://live-project.supabase.co",
      OPENAI_API_KEY: "live-openai-key",
      SUPABASE_SECRET_KEY: "live-supabase-secret",
    };
    for (const [name, value] of Object.entries(inherited)) {
      vi.stubEnv(name, value);
    }
    vi.resetModules();

    try {
      const { default: isolatedConfig } = await import("../../playwright.config");
      const configuredServer = Array.isArray(isolatedConfig.webServer)
        ? isolatedConfig.webServer[0]
        : isolatedConfig.webServer;

      expect(configuredServer?.env).toMatchObject({
        BLOB_READ_WRITE_TOKEN: "",
        BLOB_STORE_ID: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-test-public-key",
        NEXT_PUBLIC_SUPABASE_URL: "https://e2e-test.supabase.co",
        OPENAI_API_KEY: "",
        SUPABASE_SECRET_KEY: "",
      });
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("uses an explicit hydrated readiness contract for every route", async () => {
    const calls: string[] = [];
    const page = {
      async goto() {},
      async waitForRole(role: string, options: { level?: number; name?: string }) {
        calls.push(`role:${role}:${options.name ?? ""}:${options.level ?? ""}`);
      },
      async waitForTestIdHidden(testId: string) {
        calls.push(`hidden:${testId}`);
      },
      async waitForReactHydration(selector: string) {
        calls.push(`hydrated:${selector}`);
      },
    };

    for (const route of APPLICATION_ROUTES) {
      calls.push(`route:${route}`);
      await waitForRouteReadiness(page, route);
    }

    expect(calls).toEqual([
      "route:/",
      "role:heading:穿出今天的風格。:1",
      "hidden:trend-skeleton",
      "route:/analyze",
      "role:alertdialog:登入後開始分析:",
      "route:/settings",
      "role:heading:設定:1",
      "role:link:前往登入:",
      "route:/login",
      "role:heading:登入 AI StyleCue:1",
      "role:button:使用 Google 登入:",
      "hydrated:.login-google-button",
    ]);
  });

  it.each(["success", "failure"] as const)(
    "closes its browser and context after %s",
    async (outcome) => {
      const closeContext = vi.fn(async () => {});
      const closeBrowser = vi.fn(async () => {});
      const goto = vi.fn(async (url: string) => {
        if (outcome === "failure" && url.endsWith("/analyze")) {
          throw new Error("readiness failed");
        }
      });
      const context = {
        addCookies: vi.fn(async () => {}),
        close: closeContext,
        newPage: vi.fn(async () => ({
          goto,
          waitForRole: vi.fn(async () => {}),
          waitForTestIdHidden: vi.fn(async () => {}),
          waitForReactHydration: vi.fn(async () => {}),
        })),
        route: vi.fn(async () => {}),
      };
      const launchBrowser = vi.fn(async () => ({
        close: closeBrowser,
        newContext: vi.fn(async () => context),
      }));

      const prewarm = prewarmApplicationBrowser(
        "http://127.0.0.1:4312",
        launchBrowser,
      );
      if (outcome === "failure") {
        await expect(prewarm).rejects.toThrow("readiness failed");
      } else {
        await expect(prewarm).resolves.toBeUndefined();
        expect(goto).toHaveBeenCalledTimes(APPLICATION_ROUTES.length);
      }
      expect(context.addCookies).toHaveBeenCalledWith([{
        name: "NEXT_LOCALE",
        value: "zh-TW",
        url: "http://127.0.0.1:4312",
      }]);
      expect(context.route).toHaveBeenCalledWith("**/*", expect.any(Function));
      expect(closeContext).toHaveBeenCalledOnce();
      expect(closeBrowser).toHaveBeenCalledOnce();
    },
  );
});
