import { chromium, type FullConfig } from "@playwright/test";

export const APPLICATION_ROUTES = ["/", "/analyze", "/settings", "/login"] as const;

type ApplicationRoute = typeof APPLICATION_ROUTES[number];

type FetchPage = (url: URL, options: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

type RequestPolicy =
  | { action: "abort" }
  | { action: "continue" }
  | { action: "fulfill"; body: string; status: number };

type WarmPage = {
  goto(url: string): Promise<void>;
  waitForRole(
    role: "alertdialog" | "button" | "heading" | "link",
    options: { level?: number; name?: string },
  ): Promise<void>;
  waitForReactHydration(selector: string): Promise<void>;
  waitForTestIdHidden(testId: string): Promise<void>;
};

type WarmContext = {
  addCookies(cookies: Array<{ name: string; value: string; url: string }>): Promise<void>;
  close(): Promise<void>;
  newPage(): Promise<WarmPage>;
  route(
    pattern: string,
    handler: (route: {
      abort(errorCode: "blockedbyclient"): Promise<void>;
      continue(): Promise<void>;
      fulfill(response: { body: string; contentType: string; status: number }): Promise<void>;
      request(): { url(): string };
    }) => Promise<void>,
  ): Promise<void>;
};

type WarmBrowser = {
  close(): Promise<void>;
  newContext(): Promise<WarmContext>;
};

type LaunchBrowser = () => Promise<WarmBrowser>;

function localOrigin(baseURL: string) {
  const origin = new URL(baseURL);
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1") {
    throw new Error("Playwright route prewarming is restricted to http://127.0.0.1");
  }
  return origin;
}

export function requestPolicyFor(origin: URL, requestURL: string): RequestPolicy {
  const url = new URL(requestURL);
  if (url.origin !== origin.origin) return { action: "abort" };

  const localApiMocks: Record<string, { body: unknown; status: number }> = {
    "/api/analysis-quota": {
      body: { error: "UNAUTHORIZED" },
      status: 401,
    },
    "/api/auth/session": {
      body: { user: null },
      status: 200,
    },
    "/api/trends": {
      body: { manifest: null },
      status: 200,
    },
  };
  const mock = localApiMocks[url.pathname];
  if (mock) {
    return {
      action: "fulfill",
      body: JSON.stringify(mock.body),
      status: mock.status,
    };
  }

  const allowedAssets = new Set([
    "/icon-192.png",
    "/icon-512.png",
    "/icon.svg",
    "/manifest.webmanifest",
  ]);
  const isApplicationRoute = APPLICATION_ROUTES.some((route) => route === url.pathname);
  if (isApplicationRoute || allowedAssets.has(url.pathname) || url.pathname.startsWith("/_next/")) {
    return { action: "continue" };
  }
  return { action: "abort" };
}

export async function prewarmApplicationRoutes(
  baseURL: string,
  fetchPage: FetchPage = fetch,
) {
  const origin = localOrigin(baseURL);

  await Promise.all(APPLICATION_ROUTES.map(async (route) => {
    const url = new URL(route, origin);
    const response = await fetchPage(url, {
      cache: "no-store",
      redirect: "manual",
    });
    if (!response.ok) {
      throw new Error(`Failed to prewarm ${url.pathname}: HTTP ${response.status}`);
    }
    await response.arrayBuffer();
  }));
}

export async function waitForRouteReadiness(page: WarmPage, route: ApplicationRoute) {
  if (route === "/") {
    await page.waitForRole("heading", { level: 1, name: "穿出今天的風格。" });
    await page.waitForTestIdHidden("trend-skeleton");
    return;
  }
  if (route === "/analyze") {
    await page.waitForRole("alertdialog", { name: "登入後開始分析" });
    return;
  }
  if (route === "/settings") {
    await page.waitForRole("heading", { level: 1, name: "設定" });
    await page.waitForRole("link", { name: "前往登入" });
    return;
  }

  await page.waitForRole("heading", { level: 1, name: "登入 AI StyleCue" });
  await page.waitForRole("button", { name: "使用 Google 登入" });
  await page.waitForReactHydration(".login-google-button");
}

async function launchPlaywrightBrowser(): Promise<WarmBrowser> {
  const browser = await chromium.launch();
  return {
    close: async () => browser.close(),
    async newContext() {
      const context = await browser.newContext();
      return {
        addCookies: async (cookies) => context.addCookies(cookies),
        close: async () => context.close(),
        async newPage() {
          const page = await context.newPage();
          return {
            async goto(url) {
              await page.goto(url);
            },
            async waitForRole(role, options) {
              if (role === "heading") {
                await page.getByRole("heading", options).waitFor({ state: "visible" });
                return;
              }
              await page.getByRole(role, options).waitFor({ state: "visible" });
            },
            async waitForReactHydration(selector) {
              await page.waitForFunction((targetSelector) => {
                const element = document.querySelector(targetSelector);
                return Boolean(element && Object.keys(element).some((key) => (
                  key.startsWith("__reactProps$") || key.startsWith("__reactFiber$")
                )));
              }, selector);
            },
            async waitForTestIdHidden(testId) {
              await page.getByTestId(testId).first().waitFor({ state: "hidden" });
            },
          };
        },
        async route(pattern, handler) {
          await context.route(pattern, async (route) => handler(route));
        },
      };
    },
  };
}

export async function prewarmApplicationBrowser(
  baseURL: string,
  launchBrowser: LaunchBrowser = launchPlaywrightBrowser,
) {
  const origin = localOrigin(baseURL);
  const browser = await launchBrowser();
  let context: WarmContext | undefined;

  try {
    context = await browser.newContext();
    await context.addCookies([{
      name: "NEXT_LOCALE",
      value: "zh-TW",
      url: origin.origin,
    }]);
    await context.route("**/*", async (route) => {
      const policy = requestPolicyFor(origin, route.request().url());
      if (policy.action === "abort") {
        await route.abort("blockedbyclient");
      } else if (policy.action === "fulfill") {
        await route.fulfill({
          body: policy.body,
          contentType: "application/json",
          status: policy.status,
        });
      } else {
        await route.continue();
      }
    });

    const page = await context.newPage();
    for (const route of APPLICATION_ROUTES) {
      await page.goto(new URL(route, origin).href);
      await waitForRouteReadiness(page, route);
    }
  } finally {
    try {
      await context?.close();
    } finally {
      await browser.close();
    }
  }
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for route prewarming");
  }

  await prewarmApplicationRoutes(baseURL);
  await prewarmApplicationBrowser(baseURL);
}
