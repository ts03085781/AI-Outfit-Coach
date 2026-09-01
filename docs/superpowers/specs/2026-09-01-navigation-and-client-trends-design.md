# Persistent App Navigation and Client-Loaded Trends Design

**Date:** 2026-09-01

## Goal

Reduce the perceived delay when navigating among the home, analysis, and settings pages by keeping the application navigation mounted, removing public page navigations from the synchronous Supabase middleware path, and preventing trend storage reads from blocking the initial home page response.

## Scope

This change covers three related areas:

1. Persist one `AppNavigation` instance across `/`, `/analyze`, and `/settings`.
2. Restrict Supabase session-refresh middleware to routes that actually require an authenticated or refreshed session.
3. Load the home-page trend manifest from a public internal API after the home shell renders.

The following are out of scope:

- Changing the visual design of the navigation or trend cards.
- Adding optimistic or pending navigation styling.
- Changing the login, sign-out, outfit-analysis, or follow-up authorization policy.
- Making the entire application statically rendered. The root layout may remain dynamic because it resolves the locale from request cookies and headers.

## Routing Architecture

Create an `src/app/(app)/` route group containing the three application pages. Route groups do not alter public URLs, so the routes remain `/`, `/analyze`, and `/settings`.

The target structure is:

```text
src/app/
├── layout.tsx
├── login/page.tsx
├── auth/callback/route.ts
└── (app)/
    ├── layout.tsx
    ├── page.tsx
    ├── analyze/page.tsx
    └── settings/page.tsx
```

`src/app/(app)/layout.tsx` renders `AppNavigation` once and then renders the current page as its child. Each page removes its page-local `AppNavigation` import and element. Existing page shell classes remain responsible for top or bottom navigation spacing, so the layout does not introduce an additional content wrapper solely for styling.

The root `LocaleProvider` remains above the route-group layout. `AppNavigation` therefore continues to receive translations and can update its active state through `usePathname()` without being remounted when navigating between the three sibling pages.

Login and callback routes stay outside the route group and do not gain the application navigation.

## Middleware Boundary

Public page RSC requests for `/`, `/analyze`, and `/settings` must no longer call `supabase.auth.getUser()` in middleware. Authentication remains authoritative at server API boundaries.

The middleware matcher will be changed from a catch-all page matcher to this explicit set of session-sensitive endpoints:

- `/api/auth/session`
- `/api/analyze`
- `/api/follow-up`
- `/api/auth/login-notification`

The remaining API routes stay outside the matcher: photo checking and telemetry use their existing abuse controls, the trend cron uses its own secret, and the new trends endpoint is public.

This optimization must not replace server-side authorization. `/api/analyze` and `/api/follow-up` continue to call their existing authenticated wrappers and reject anonymous users. Client state, route visibility, and the analysis page's session summary are never accepted as proof of authorization.

`/api/trends` is public and must remain outside the Supabase middleware matcher.

## Trends API

Add `GET /api/trends` as the browser-facing trend source. It calls the existing `readLatestTrendManifest()` server function, so Blob credentials and storage operations remain server-only.

The success response contract is `{ manifest: TrendManifest }`, where `TrendManifest` is the existing strict Zod-validated domain type containing exactly five trend items.

If Blob storage is not configured or no latest manifest exists, the endpoint returns HTTP 200 with:

```json
{ "manifest": null }
```

If a configured storage read fails or returns invalid data, the endpoint logs only structured, non-sensitive error metadata and returns HTTP 503 with:

```json
{ "error": "TRENDS_UNAVAILABLE" }
```

The handler sets public CDN caching appropriate for trend freshness. Successful manifest responses use `public, s-maxage=300, stale-while-revalidate=86400`. A null-manifest response uses `public, s-maxage=60, stale-while-revalidate=300` so newly configured data becomes visible promptly. Failure responses use `no-store`.

The existing Zod schemas remain the source of truth for validating Blob data. No Blob token, internal pathname, or provider error text is exposed to the browser.

## Home-Page Data Flow

The home page server component stops importing and awaiting `readLatestTrendManifest()`. It renders `HomeContent` without trend data, allowing the page shell, hero, navigation, and weather area to render independently of Vercel Blob.

`HomeContent` owns an explicit trend-loading state with three outcomes:

- `loading`: render five deterministic skeleton rows matching the trend list layout.
- `success`: store the validated manifest and localize its items using the current app locale.
- `fallback`: render the existing localized fallback trends when the API returns `manifest: null`, returns a non-OK response, sends an invalid payload, or the browser request fails.

The browser issues one `/api/trends` request when `HomeContent` mounts. It uses an `AbortController` so an obsolete request does not update an unmounted component. Changing the application locale does not refetch the manifest; the already downloaded multilingual manifest is re-localized in memory.

The client validates `payload.manifest` with the existing `TrendManifestSchema` before treating it as a `TrendManifest`. The home client already imports the same domain module for localization, so this keeps one source of truth instead of introducing a second response guard.

The skeleton must not contain animated motion that conflicts with reduced-motion preferences. It must preserve roughly the final list height to avoid a large layout shift. The fallback path keeps the homepage useful instead of replacing the section with an error-only state.

## Error Handling

- Trend storage errors do not fail the home page navigation.
- API errors do not expose provider messages or secrets.
- Client fetch errors transition from skeletons to existing fallback trends.
- Session middleware changes do not weaken authenticated API rejection behavior.
- Moving pages into a route group must not change any public URL, login redirect, or callback destination.

## Testing

Focused unit tests will cover:

- The application layout renders a single `AppNavigation` around its children.
- Individual home, analysis, and settings pages no longer render their own navigation.
- `GET /api/trends` returns a manifest, returns `null` when unconfigured or empty, returns a sanitized 503 on storage failure, and emits the intended cache headers.
- `HomeContent` initially renders skeleton rows, replaces them with localized API trends, re-localizes without refetching, and falls back after null, invalid, non-OK, or rejected responses.
- Middleware matching excludes public pages and `/api/trends` while covering the session-sensitive endpoints.
- Existing authenticated analyze and follow-up route tests continue to reject anonymous users.

Playwright coverage will navigate `/` → `/analyze` → `/settings` using the navigation links and verify that the same navigation DOM instance remains mounted. It will also verify that the home shell is visible while a delayed trend response is pending and that trend content appears after the response completes.

## Verification

Run:

```text
pnpm test
pnpm typecheck
pnpm lint
pnpm test:e2e
pnpm build
```

The production build should continue to expose the same public page URLs. The home RSC response must no longer depend on a Vercel Blob read, and browser navigation among the three application pages must retain the route-group navigation instance.

## Acceptance Criteria

1. `/`, `/analyze`, and `/settings` share one persistent `AppNavigation` through a route-group layout.
2. Login and auth callback behavior and URLs remain unchanged.
3. Public page navigations do not execute Supabase `getUser()` middleware work.
4. Authenticated APIs still validate the user on the server and reject anonymous requests.
5. The home shell renders without waiting for trend storage.
6. The trend section shows five skeleton rows during the client request and renders live or fallback trends afterward.
7. Trend storage credentials and raw errors never reach the browser.
8. Relevant unit, browser, type, lint, and production-build checks pass.
