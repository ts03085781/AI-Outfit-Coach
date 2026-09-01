# Persistent Navigation and Client-Loaded Trends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep one navigation instance mounted across the three application pages, remove public page transitions from synchronous Supabase middleware work, and load home-page trends after the shell renders.

**Architecture:** Put `/`, `/analyze`, and `/settings` under an `(app)` route-group layout that owns `AppNavigation`. Replace the catch-all middleware matcher with an explicit session-sensitive API list, expose Blob-backed trends through a cached public API handler, and let `HomeContent` transition from deterministic skeleton rows to validated live or fallback trends.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, next-intl, Supabase SSR, Vercel Blob, Zod, Vitest, Testing Library, Playwright

**Spec:** `docs/superpowers/specs/2026-09-01-navigation-and-client-trends-design.md`

## Global Constraints

- Public URLs remain `/`, `/analyze`, and `/settings`; route groups must not alter redirects or callback destinations.
- Login and auth callback routes stay outside the application-navigation layout.
- `/api/analyze`, `/api/follow-up`, and login notification authorization remain server-authoritative.
- `/api/trends` is public and must never expose Blob credentials, provider errors, or internal storage paths.
- A trends failure must not fail home-page navigation; the client falls back to the existing localized trend content.
- Use strict TypeScript, two-space indentation, semicolons, double quotes, and `@/` imports.
- Keep all network/model behavior deterministic in tests.

---

### Task 1: Persistent application route layout

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Move: `src/app/page.tsx` → `src/app/(app)/page.tsx`
- Move: `src/app/analyze/page.tsx` → `src/app/(app)/analyze/page.tsx`
- Move: `src/app/settings/page.tsx` → `src/app/(app)/settings/page.tsx`
- Modify: `src/features/home/components/HomeContent.tsx`
- Modify: `src/features/outfit/components/OutfitFlowPage.tsx`
- Create: `tests/unit/app-layout.test.tsx`
- Modify: `tests/unit/home-page.test.tsx`
- Modify: `tests/unit/settings-page.test.tsx`

**Interfaces:**
- Consumes: root `LocaleProvider` from `src/app/layout.tsx`; existing `AppNavigation` component.
- Produces: default `AppLayout({ children }: { children: ReactNode })` that renders exactly one `AppNavigation` followed by `children`.

- [ ] **Step 1: Write the failing layout test and update page imports**

Create `tests/unit/app-layout.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import AppLayout from "@/app/(app)/layout";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

it("renders one shared application navigation around route content", () => {
  render(
    <LocaleProvider initialLocale="zh-TW">
      <AppLayout><div>route content</div></AppLayout>
    </LocaleProvider>,
  );

  expect(screen.getAllByTestId("app-navigation")).toHaveLength(1);
  expect(screen.getByText("route content")).toBeVisible();
});
```

Change the settings test import to:

```ts
import SettingsPage from "@/app/(app)/settings/page";
```

In `tests/unit/home-page.test.tsx`, remove assertions that expect navigation elements from `HomeContent`; those assertions now belong to the layout test.

- [ ] **Step 2: Run focused tests and verify the new layout is missing**

Run: `pnpm test tests/unit/app-layout.test.tsx tests/unit/home-page.test.tsx tests/unit/settings-page.test.tsx`

Expected: FAIL because `@/app/(app)/layout` and the moved settings module do not exist.

- [ ] **Step 3: Create the route-group layout and move the pages**

Create `src/app/(app)/layout.tsx`:

```tsx
import type { ReactNode } from "react";

import { AppNavigation } from "@/features/home/components/AppNavigation";

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <>
    <AppNavigation />
    {children}
  </>;
}
```

Move the three page modules into `(app)` without changing their default exports. Remove the `AppNavigation` import and element from `HomeContent`, `OutfitFlowPage`, and settings page. Keep each page's existing `app-page-with-nav` class so fixed-navigation spacing remains unchanged.

- [ ] **Step 4: Run focused tests**

Run: `pnpm test tests/unit/app-layout.test.tsx tests/unit/home-page.test.tsx tests/unit/settings-page.test.tsx tests/unit/outfit-flow.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the persistent-layout change**

```bash
git add src/app src/features/home/components/HomeContent.tsx src/features/outfit/components/OutfitFlowPage.tsx tests/unit/app-layout.test.tsx tests/unit/home-page.test.tsx tests/unit/settings-page.test.tsx
git commit -m "perf: persist app navigation across pages"
```

---

### Task 2: Restrict session-refresh middleware to authenticated APIs

**Files:**
- Modify: `src/middleware.ts`
- Modify: `tests/unit/middleware-entrypoint.test.ts`
- Verify: `tests/unit/analyze-route.test.ts`
- Verify: `tests/unit/follow-up-route.test.ts`
- Verify: `tests/unit/login-notification.test.ts`

**Interfaces:**
- Consumes: `updateSupabaseSession(request: NextRequest)`.
- Produces: `config.matcher` containing only `/api/auth/session`, `/api/analyze`, `/api/follow-up`, and `/api/auth/login-notification`.

- [ ] **Step 1: Change the middleware test to require the explicit matcher**

Replace the matcher assertion with:

```ts
expect(config.matcher).toEqual([
  "/api/auth/session",
  "/api/analyze",
  "/api/follow-up",
  "/api/auth/login-notification",
]);
expect(config.matcher).not.toContain("/");
expect(config.matcher).not.toContain("/api/trends");
```

Use `/api/auth/session` for the test request URL so the entrypoint test represents a matched route.

- [ ] **Step 2: Run the middleware test and verify it fails on the catch-all matcher**

Run: `pnpm test tests/unit/middleware-entrypoint.test.ts`

Expected: FAIL showing the existing catch-all matcher.

- [ ] **Step 3: Replace the catch-all matcher**

Set the middleware config to:

```ts
export const config = {
  matcher: [
    "/api/auth/session",
    "/api/analyze",
    "/api/follow-up",
    "/api/auth/login-notification",
  ],
};
```

Do not change `updateSupabaseSession()` or any authenticated route wrapper.

- [ ] **Step 4: Verify middleware and authenticated API behavior**

Run: `pnpm test tests/unit/middleware-entrypoint.test.ts tests/unit/analyze-route.test.ts tests/unit/follow-up-route.test.ts tests/unit/login-notification.test.ts`

Expected: PASS, including anonymous rejection cases in the authenticated API tests.

- [ ] **Step 5: Commit the matcher change**

```bash
git add src/middleware.ts tests/unit/middleware-entrypoint.test.ts
git commit -m "perf: scope session middleware to authenticated APIs"
```

---

### Task 3: Public cached trends API

**Files:**
- Create: `src/features/trends/trends-route.ts`
- Create: `src/app/api/trends/route.ts`
- Create: `tests/unit/trends-route.test.ts`

**Interfaces:**
- Consumes: `readLatestTrendManifest(): Promise<TrendManifest | null>`.
- Produces: `createTrendsHandler(dependencies?): () => Promise<Response>` and `GET /api/trends`.
- Response: `{ manifest: TrendManifest }`, `{ manifest: null }`, or HTTP 503 `{ error: "TRENDS_UNAVAILABLE" }`.

- [ ] **Step 1: Write failing handler tests**

Create `tests/unit/trends-route.test.ts` with a valid five-item manifest and these cases:

```ts
// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { createTrendsHandler } from "@/features/trends/trends-route";

const copy = {
  "zh-TW": { name: "薄透風衣", description: "適合台灣換季。" },
  en: { name: "Sheer jacket", description: "For changing weather." },
  ja: { name: "シアージャケット", description: "季節の変わり目に。" },
  ko: { name: "시어 재킷", description: "환절기에 어울립니다." },
};

const manifest = {
  schemaVersion: 1 as const,
  runId: "run-current",
  generatedAt: "2026-08-26T22:00:00.000Z",
  market: "TW" as const,
  items: Array.from({ length: 5 }, (_, index) => ({
    id: `trend-${index + 1}`,
    imageUrl: `https://store.public.blob.vercel-storage.com/trend-${index + 1}.png`,
    translations: copy,
    sources: [{ title: "Source", url: `https://example.com/${index + 1}` }],
  })),
};

describe("trends route", () => {
  it("returns a cached trend manifest", async () => {
    const readManifest = vi.fn().mockResolvedValue(manifest);
    const response = await createTrendsHandler({
      isConfigured: () => true,
      readManifest,
      logError: vi.fn(),
    })();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ manifest });
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=86400",
    );
  });

  it.each([false, true])("returns a short-cached null manifest for empty state", async (configured) => {
    const readManifest = vi.fn().mockResolvedValue(null);
    const response = await createTrendsHandler({
      isConfigured: () => configured,
      readManifest,
      logError: vi.fn(),
    })();

    await expect(response.json()).resolves.toEqual({ manifest: null });
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=300",
    );
    expect(readManifest).toHaveBeenCalledTimes(configured ? 1 : 0);
  });

  it("sanitizes configured storage failures", async () => {
    const logError = vi.fn();
    const response = await createTrendsHandler({
      isConfigured: () => true,
      readManifest: vi.fn().mockRejectedValue(new Error("secret provider detail")),
      logError,
    })();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "TRENDS_UNAVAILABLE" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("secret provider detail");
  });
});
```

- [ ] **Step 2: Run the route test and verify the module is missing**

Run: `pnpm test tests/unit/trends-route.test.ts`

Expected: FAIL because `trends-route.ts` does not exist.

- [ ] **Step 3: Implement the injectable handler**

Implement this dependency boundary in `src/features/trends/trends-route.ts`:

```ts
import { readLatestTrendManifest } from "./blob-storage";
import type { TrendManifest } from "./domain";

type TrendsHandlerDependencies = {
  isConfigured: () => boolean;
  readManifest: () => Promise<TrendManifest | null>;
  logError: (metadata: { event: "trend_read_failed"; errorName: string }) => void;
};

const dependencies: TrendsHandlerDependencies = {
  isConfigured: () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
  readManifest: readLatestTrendManifest,
  logError: (metadata) => console.warn(JSON.stringify(metadata)),
};

export function createTrendsHandler(overrides: Partial<TrendsHandlerDependencies> = {}) {
  const resolved = { ...dependencies, ...overrides };
  return async function GET() {
    if (!resolved.isConfigured()) {
      return Response.json({ manifest: null }, {
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
      });
    }

    try {
      const manifest = await resolved.readManifest();
      return Response.json({ manifest }, {
        headers: {
          "Cache-Control": manifest
            ? "public, s-maxage=300, stale-while-revalidate=86400"
            : "public, s-maxage=60, stale-while-revalidate=300",
        },
      });
    } catch (error) {
      resolved.logError({
        event: "trend_read_failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return Response.json(
        { error: "TRENDS_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}
```

Create `src/app/api/trends/route.ts`:

```ts
import { createTrendsHandler } from "@/features/trends/trends-route";

export const runtime = "nodejs";
export const GET = createTrendsHandler();
```

- [ ] **Step 4: Run focused trend tests**

Run: `pnpm test tests/unit/trends-route.test.ts tests/unit/trends-storage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the trends API**

```bash
git add src/app/api/trends/route.ts src/features/trends/trends-route.ts tests/unit/trends-route.test.ts
git commit -m "feat: expose cached trends API"
```

---

### Task 4: Client-loaded trends and stable skeletons

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/features/home/components/HomeContent.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/unit/home-page.test.tsx`

**Interfaces:**
- Consumes: `GET /api/trends`, `TrendManifestSchema`, `getLocalizedTrend()`, and `getFallbackTrends()`.
- Produces: a home trend section with `loading`, `success`, and `fallback` states; five elements marked `data-testid="trend-skeleton"` while loading.

- [ ] **Step 1: Replace prop-based home tests with fetch-state tests**

Stub `fetch` in `beforeEach` and render `<HomeContent />` without a `trendManifest` prop. Add a deferred-response test:

```tsx
it("renders the home shell and five trend skeletons before trends resolve", () => {
  fetchMock.mockReturnValue(new Promise(() => undefined));

  render(<LocaleProvider initialLocale="zh-TW"><HomeContent /></LocaleProvider>);

  expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
  expect(screen.getAllByTestId("trend-skeleton")).toHaveLength(5);
});
```

Update the Blob manifest test to resolve:

```ts
fetchMock.mockResolvedValue(new Response(JSON.stringify({ manifest })));
```

Then await localized content with `findAllByRole`. Add table-driven fallback coverage for `{ manifest: null }`, HTTP 503, an invalid manifest, and a rejected fetch. Each case must eventually show the existing five fallback headings.

Use these concrete fallback cases:

```tsx
it.each([
  ["null manifest", () => Promise.resolve(new Response(JSON.stringify({ manifest: null })))],
  ["non-OK response", () => Promise.resolve(new Response(null, { status: 503 }))],
  ["invalid manifest", () => Promise.resolve(new Response(JSON.stringify({ manifest: { items: [] } })))],
  ["rejected request", () => Promise.reject(new Error("offline"))],
])("uses fallback trends after %s", async (_name, response) => {
  fetchMock.mockImplementation(response);
  render(<LocaleProvider initialLocale="zh-TW"><HomeContent /></LocaleProvider>);

  expect(await screen.findByRole("link", { name: /透氣亞麻寬褲/ })).toBeVisible();
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(5);
});
```

For locale switching, add a test-only control:

```tsx
function LocaleControl() {
  const { setLocale } = useAppLocale();
  return <button type="button" onClick={() => setLocale("en")}>English</button>;
}
```

Render `HomeContent` and `LocaleControl` under the same provider, wait for the Chinese API trend name, click `English`, then expect the English API trend name while `fetchMock` has still been called once.

- [ ] **Step 2: Run the home test and verify the old prop contract fails**

Run: `pnpm test tests/unit/home-page.test.tsx`

Expected: FAIL because `HomeContent` still requires `trendManifest` and does not render skeletons or fetch `/api/trends`.

- [ ] **Step 3: Remove the server-side Blob read from the home page**

Replace `src/app/(app)/page.tsx` with:

```tsx
import { HomeContent } from "@/features/home/components/HomeContent";

export default function HomePage() {
  return <HomeContent />;
}
```

- [ ] **Step 4: Implement the client state machine and request validation**

In `HomeContent`, import `useEffect` and `useState`, remove the `trendManifest` prop, and define:

```ts
type TrendState =
  | { status: "loading" }
  | { status: "success"; manifest: TrendManifest }
  | { status: "fallback" };
```

Initialize it to `loading` and use this mount-only effect:

```tsx
const [trendState, setTrendState] = useState<TrendState>({ status: "loading" });

useEffect(() => {
  const controller = new AbortController();

  async function loadTrends() {
    try {
      const response = await fetch("/api/trends", { signal: controller.signal });
      const payload: unknown = response.ok ? await response.json() : null;
      if (controller.signal.aborted) return;

      if (!payload || typeof payload !== "object" || !("manifest" in payload)) {
        setTrendState({ status: "fallback" });
        return;
      }

      const candidate = (payload as { manifest?: unknown }).manifest;
      if (candidate === null) {
        setTrendState({ status: "fallback" });
        return;
      }

      const parsed = TrendManifestSchema.safeParse(candidate);
      setTrendState(parsed.success
        ? { status: "success", manifest: parsed.data }
        : { status: "fallback" });
    } catch {
      if (!controller.signal.aborted) setTrendState({ status: "fallback" });
    }
  }

  void loadTrends();
  return () => controller.abort();
}, []);
```

Derive localized trends on every locale render:

```ts
const trends = trendState.status === "success"
  ? trendState.manifest.items.map((item) => getLocalizedTrend(item, locale))
  : getFallbackTrends(locale);
```

While `status === "loading"`, render this deterministic branch inside `.trend-list`; otherwise render the existing live/fallback card markup:

```tsx
{trendState.status === "loading"
  ? Array.from({ length: 5 }, (_, index) => (
    <article aria-hidden="true" data-testid="trend-skeleton" key={index}>
      <span className="trend-skeleton-swatch" />
      <span className="trend-skeleton-copy">
        <span className="trend-skeleton-line" />
        <span className="trend-skeleton-line" />
      </span>
    </article>
  ))
  : trends.map((item, index) => (
    <article key={item.id}>
      {item.imageUrl ? (
        <Image
          alt=""
          className="trend-image"
          height={96}
          sizes="72px"
          src={item.imageUrl}
          width={96}
        />
      ) : (
        <span aria-hidden="true" className={`trend-swatch trend-swatch-${index + 1}`} />
      )}
      <div className="trend-copy">
        <h3>
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(item.name)}`}
            rel="noreferrer"
            target="_blank"
          >
            {item.name}
          </a>
        </h3>
        <p>{item.description}</p>
        {item.sources.length > 0 && (
          <a className="trend-source" href={item.sources[0].url} rel="noreferrer" target="_blank">
            {t("trends.source")}: {item.sources[0].title} ↗
          </a>
        )}
      </div>
    </article>
  ))}
```

- [ ] **Step 5: Add stable skeleton styles**

Add non-animated styles that preserve the final row geometry:

```css
.trend-skeleton-swatch,
.trend-skeleton-line { background: var(--color-surface-high); }
.trend-skeleton-swatch { width: 60px; height: 60px; border: 1px solid var(--color-outline); border-radius: var(--radius-control); }
.trend-skeleton-copy { display: grid; gap: 10px; }
.trend-skeleton-line { display: block; width: 72%; height: 12px; border-radius: var(--radius-control); }
.trend-skeleton-line:last-child { width: 94%; }
```

Do not add a shimmer animation.

- [ ] **Step 6: Run focused home tests**

Run: `pnpm test tests/unit/home-page.test.tsx tests/unit/weather-card.test.tsx tests/unit/weather.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit client-side trend loading**

```bash
git add src/app/'(app)'/page.tsx src/features/home/components/HomeContent.tsx src/app/globals.css tests/unit/home-page.test.tsx
git commit -m "perf: load homepage trends after render"
```

---

### Task 5: Browser persistence coverage and complete verification

**Files:**
- Modify: `tests/e2e/home.spec.ts`
- Verify: all files changed in Tasks 1–4

**Interfaces:**
- Consumes: persistent route-group navigation and `/api/trends` browser fetch.
- Produces: regression coverage proving the navigation DOM survives sibling route changes and the home shell renders before delayed trends.

- [ ] **Step 1: Add a navigation persistence assertion**

In the existing home-to-analysis-to-settings flow, mark the navigation before clicking:

```ts
await page.getByTestId("app-navigation").evaluate((navigation) => {
  navigation.dataset.persistenceProbe = "same-instance";
});
```

After each navigation, assert:

```ts
await expect(page.getByTestId("app-navigation")).toHaveAttribute(
  "data-persistence-probe",
  "same-instance",
);
```

This fails if the navigation element is removed and reconstructed.

- [ ] **Step 2: Add a delayed-trends browser test**

Add this helper and test to `tests/e2e/home.spec.ts`:

```ts
function browserTrendManifest() {
  const translations = {
    "zh-TW": { name: "API 薄透風衣", description: "適合台灣換季。" },
    en: { name: "API sheer jacket", description: "For changing weather." },
    ja: { name: "API シアージャケット", description: "季節の変わり目に。" },
    ko: { name: "API 시어 재킷", description: "환절기에 어울립니다." },
  };
  return {
    schemaVersion: 1,
    runId: "e2e-run",
    generatedAt: "2026-08-26T22:00:00.000Z",
    market: "TW",
    items: Array.from({ length: 5 }, (_, index) => ({
      id: `e2e-trend-${index + 1}`,
      imageUrl: `https://store.public.blob.vercel-storage.com/e2e-${index + 1}.png`,
      translations,
      sources: [{ title: "Source", url: `https://example.com/${index + 1}` }],
    })),
  };
}

test("renders the home shell before delayed trends arrive", async ({ page }) => {
  let releaseResponse: (() => void) | undefined;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route("**/api/trends", async (route) => {
    await responseGate;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ manifest: browserTrendManifest() }),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("trend-skeleton")).toHaveCount(5);

  releaseResponse?.();
  await expect(page.getByRole("heading", { name: "API 薄透風衣" }).first()).toBeVisible();
  await expect(page.getByTestId("trend-skeleton")).toHaveCount(0);
});
```

- [ ] **Step 3: Run the focused browser suite**

Run: `pnpm test:e2e tests/e2e/home.spec.ts`

Expected: PASS.

- [ ] **Step 4: Run the complete verification suite**

Run in order:

```text
pnpm test
pnpm typecheck
pnpm lint
pnpm test:e2e
pnpm build
```

Expected: all commands exit 0. Confirm build output still lists `/`, `/analyze`, and `/settings`, lists `/api/trends`, and does not introduce a public route containing `(app)`.

- [ ] **Step 5: Inspect the final diff for scope and sensitive-data regressions**

Run:

```text
git diff HEAD~4 --check
git status --short
git diff HEAD~4 -- src middleware.ts tests
```

Confirm no `.env` files, secrets, generated build files, provider error text, unrelated refactors, or pending placeholders are present.

- [ ] **Step 6: Commit final browser coverage if it was not included earlier**

```bash
git add tests/e2e/home.spec.ts
git commit -m "test: cover persistent navigation and trend loading"
```
