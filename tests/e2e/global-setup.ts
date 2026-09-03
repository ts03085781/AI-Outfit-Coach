import { chromium, type FullConfig } from "@playwright/test";

export const APPLICATION_ROUTES = ["/", "/analyze", "/settings", "/login"] as const;

type FetchPage = (url: URL, options: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export async function prewarmApplicationRoutes(
  baseURL: string,
  fetchPage: FetchPage = fetch,
) {
  const origin = new URL(baseURL);
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1") {
    throw new Error("Playwright route prewarming is restricted to http://127.0.0.1");
  }

  await Promise.all(APPLICATION_ROUTES.map(async (route) => {
    const url = new URL(route, origin);
    if (url.origin !== origin.origin) {
      throw new Error(`Refusing to prewarm an external URL: ${url}`);
    }

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

async function prewarmApplicationBrowser(baseURL: string) {
  const origin = new URL(baseURL);
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext();
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin.origin) {
        await route.abort("blockedbyclient");
        return;
      }

      if (url.pathname === "/api/auth/session") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ user: null }),
        });
        return;
      }

      if (url.pathname === "/api/trends") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ manifest: null }),
        });
        return;
      }

      await route.continue();
    });

    const page = await context.newPage();
    for (const route of APPLICATION_ROUTES) {
      await page.goto(new URL(route, origin).href, { waitUntil: "networkidle" });
    }
  } finally {
    await browser.close();
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
