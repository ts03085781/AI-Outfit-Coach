# Google Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase Google authentication to AI StyleCue, requiring a signed-in user only when full outfit analysis starts and exposing account controls only in Settings.

**Architecture:** Supabase SSR maintains a PKCE cookie session across browser and server contexts. Public pages and photo precheck remain anonymous; a public session-summary endpoint drives client UI while reusable server-side guards independently protect analysis APIs. Google OAuth uses a full-page callback and never persists the selected outfit photo.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase Auth, `@supabase/ssr`, `@supabase/supabase-js`, next-intl, Vitest, Testing Library, Playwright, Vercel

**Spec:** `docs/superpowers/specs/2026-08-19-google-auth-design.md`

## Global Constraints

- The user-facing product name is exactly **AI StyleCue**; **AI Outfit Coach** remains only the repository name.
- `/`, `/analyze`, `/settings`, and `/login` are public pages.
- `/api/photo-check` stays public; `/api/analyze` and `/api/follow-up` fail closed with `401` unless Supabase verifies a user.
- Do not create profile, subscription, quota, photo, or analysis-history tables.
- Do not persist the selected photo to local storage, session storage, IndexedDB, Supabase, or temporary server storage.
- The required-login dialog has one “Go to sign in” action and no close, cancel, backdrop-dismiss, or Escape-dismiss behavior.
- Account identity and sign-out controls appear only on `/settings`.
- Never add the Google client secret, Supabase `service_role`, or Supabase secret key to source code or Vercel.
- Support `http://localhost:3000` and the exact production `*.vercel.app` origin; preview OAuth is out of scope.
- Add user-visible copy in Traditional Chinese, English, Japanese, and Korean.
- Follow test-driven development and keep every commit scoped.

---

### Task 1: Supabase session foundation

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/lib/auth/redirect.ts`
- Create: `src/lib/supabase/config.ts`
- Create: `src/lib/supabase/browser.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`
- Create: `middleware.ts`
- Test: `tests/unit/auth-redirect.test.ts`

**Interfaces:**
- Produces: `safeNextPath(value: string | string[] | undefined, fallback?: string): string`.
- Produces: `createBrowserSupabaseClient(): SupabaseClient` and `createServerSupabaseClient(): Promise<SupabaseClient>`.
- Produces: `updateSupabaseSession(request: NextRequest): Promise<NextResponse>` used by root middleware.
- Consumes: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; neither is secret.

- [ ] **Step 1: Add redirect-safety tests**

Create `tests/unit/auth-redirect.test.ts` with exact safe and unsafe cases:

```ts
import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/redirect";

describe("safeNextPath", () => {
  it.each(["/analyze", "/settings", "/analyze?login=success"])(
    "keeps safe same-origin path %s",
    (path) => expect(safeNextPath(path)).toBe(path),
  );

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "%2F%2Fevil.example",
    "javascript:alert(1)",
    ["/settings", "//evil.example"],
    undefined,
  ])("falls back for unsafe destination %j", (value) => {
    expect(safeNextPath(value)).toBe("/analyze");
  });
});
```

- [ ] **Step 2: Run the redirect test and verify the missing module failure**

Run: `pnpm test -- tests/unit/auth-redirect.test.ts`

Expected: FAIL because `@/lib/auth/redirect` does not exist.

- [ ] **Step 3: Implement strict same-origin path validation**

Create `src/lib/auth/redirect.ts`:

```ts
export function safeNextPath(
  value: string | string[] | undefined,
  fallback = "/analyze",
) {
  if (typeof value !== "string") return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\")) {
    return fallback;
  }
  return decoded;
}
```

- [ ] **Step 4: Install Supabase dependencies**

Run: `pnpm add @supabase/ssr @supabase/supabase-js`

Expected: `package.json` and `pnpm-lock.yaml` contain both packages without unrelated upgrades.

- [ ] **Step 5: Add environment validation and browser/server factories**

Create `src/lib/supabase/config.ts` with a function that reads and validates the two public variables at call time so tests can import modules without credentials:

```ts
export function supabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Missing public Supabase configuration");
  }
  return { url, publishableKey };
}
```

Create `src/lib/supabase/browser.ts` using `createBrowserClient(url, publishableKey)`. Create `src/lib/supabase/server.ts` using `createServerClient` and `await cookies()`, forwarding `getAll` and best-effort `setAll` exactly as required by Supabase SSR. Do not log cookie values or tokens.

- [ ] **Step 6: Add refresh-only middleware**

Create `src/lib/supabase/middleware.ts` so it creates a response with the incoming request, copies refreshed cookies to both request and response, calls `supabase.auth.getUser()`, and always returns the response without page redirects. Create root `middleware.ts`:

```ts
import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export function middleware(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

- [ ] **Step 7: Verify the foundation**

Run: `pnpm test -- tests/unit/auth-redirect.test.ts && pnpm typecheck && pnpm lint`

Expected: all commands PASS and no secret is present in the diff.

- [ ] **Step 8: Commit the foundation**

```bash
git add package.json pnpm-lock.yaml middleware.ts src/lib/auth/redirect.ts src/lib/supabase tests/unit/auth-redirect.test.ts
git commit -m "feat: add Supabase session foundation"
```

---

### Task 2: Server identity summary and API authorization

**Files:**
- Create: `src/lib/auth/user.ts`
- Create: `src/lib/auth/guard.ts`
- Create: `src/app/api/auth/session/route.ts`
- Modify: `src/app/api/analyze/route.ts`
- Modify: `src/app/api/follow-up/route.ts`
- Modify: `tests/unit/analyze-route.test.ts`
- Modify: `tests/unit/follow-up-route.test.ts`
- Test: `tests/unit/auth-guard.test.ts`
- Test: `tests/unit/auth-session-route.test.ts`

**Interfaces:**
- Produces: `BasicUser = { id: string; name: string | null; email: string | null; avatarUrl: string | null }`.
- Produces: `getCurrentUser(): Promise<User | null>` and `toBasicUser(user: User): BasicUser`.
- Produces: `withAuthenticatedUser(handler, getUser?): (request: Request) => Promise<Response>`.
- Produces: `GET /api/auth/session` response `{ user: BasicUser | null }` with `Cache-Control: private, no-store`.
- Consumes: `createServerSupabaseClient()` from Task 1.

- [ ] **Step 1: Write failing guard and identity tests**

Create `tests/unit/auth-guard.test.ts` that injects `async () => null` and expects status `401`, JSON `{ error: "AUTH_REQUIRED" }`, and zero downstream calls. Add an authenticated case using `{ id: "user-1" } as User` and expect the downstream `204` response.

Create `tests/unit/auth-session-route.test.ts` for these exact mappings:

```ts
expect(toBasicUser({
  id: "user-1",
  email: "dean@example.com",
  user_metadata: {
    full_name: "Dean",
    avatar_url: "https://lh3.googleusercontent.com/avatar",
  },
} as User)).toEqual({
  id: "user-1",
  name: "Dean",
  email: "dean@example.com",
  avatarUrl: "https://lh3.googleusercontent.com/avatar",
});
```

Also verify non-string metadata and non-HTTPS avatar URLs become `null` rather than throwing.

- [ ] **Step 2: Run the new tests and verify missing-module failures**

Run: `pnpm test -- tests/unit/auth-guard.test.ts tests/unit/auth-session-route.test.ts`

Expected: FAIL because the auth modules do not exist.

- [ ] **Step 3: Implement verified-user helpers and the session summary route**

Implement `getCurrentUser()` with `supabase.auth.getUser()`, returning `data.user` and failing closed to `null` on an Auth error. `toBasicUser()` must prefer `full_name`, then `name`, validate all metadata types, and accept avatar URLs only when `new URL(value).protocol === "https:"`.

Implement the session route with an injectable handler factory for deterministic tests:

```ts
export function createSessionHandler(getUser = getCurrentUser) {
  return async function GET() {
    const user = await getUser().catch(() => null);
    return Response.json(
      { user: user ? toBasicUser(user) : null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  };
}

export const GET = createSessionHandler();
```

- [ ] **Step 4: Implement the reusable API guard**

Implement `withAuthenticatedUser` so any missing, invalid, or failed Supabase lookup returns the same `401` response and never invokes the protected handler:

```ts
type PostHandler = (request: Request) => Promise<Response>;

export function withAuthenticatedUser(
  handler: PostHandler,
  getUser = getCurrentUser,
): PostHandler {
  return async (request) => {
    const user = await getUser().catch(() => null);
    if (!user) {
      return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    }
    return handler(request);
  };
}
```

- [ ] **Step 5: Protect the two full-analysis endpoints**

Export a testable route factory and wrap only the route-level handler:

```ts
export function createAuthenticatedAnalyzeRoute(getUser = getCurrentUser) {
  return withAuthenticatedUser(createAnalyzeHandler(defaultDependencies), getUser);
}

export const POST = createAuthenticatedAnalyzeRoute();
```

Export `createAuthenticatedFollowUpRoute(getUser = getCurrentUser)` with the same structure in `/api/follow-up`. Leave `/api/photo-check` untouched. Preserve the existing feature-level handler factories so their detailed tests remain focused on analysis behavior.

- [ ] **Step 6: Update route tests for the new boundary**

Add explicit unauthenticated route-factory assertions for analyze and follow-up by injecting `async () => null`. Change the existing missing-OpenAI-configuration assertion to call `createAuthenticatedAnalyzeRoute(async () => ({ id: "user-1" } as User))`, proving it passed authentication before reaching the existing provider failure. Do not weaken any existing analyzer, safety, payload, rate-limit, or token assertions.

- [ ] **Step 7: Run API and auth tests**

Run: `pnpm test -- tests/unit/auth-guard.test.ts tests/unit/auth-session-route.test.ts tests/unit/analyze-route.test.ts tests/unit/follow-up-route.test.ts`

Expected: PASS; `/api/photo-check` tests remain unchanged.

- [ ] **Step 8: Commit server authorization**

```bash
git add src/lib/auth src/app/api/auth/session src/app/api/analyze/route.ts src/app/api/follow-up/route.ts tests/unit/auth-guard.test.ts tests/unit/auth-session-route.test.ts tests/unit/analyze-route.test.ts tests/unit/follow-up-route.test.ts
git commit -m "feat: require authentication for analysis APIs"
```

---

### Task 3: Google login page and OAuth callback

**Files:**
- Create: `src/features/auth/components/LoginPanel.tsx`
- Create: `src/app/login/page.tsx`
- Create: `src/app/auth/callback/route.ts`
- Modify: `src/messages/zh-TW.json`
- Modify: `src/messages/en.json`
- Modify: `src/messages/ja.json`
- Modify: `src/messages/ko.json`
- Modify: `src/app/globals.css`
- Test: `tests/unit/login-panel.test.tsx`
- Test: `tests/unit/auth-callback.test.ts`
- Modify: `tests/unit/i18n.test.ts`

**Interfaces:**
- Produces: `<LoginPanel nextPath reason error />`.
- Produces: `createAuthCallbackHandler(exchangeCode): (request: Request) => Promise<Response>` for unit testing.
- Consumes: `safeNextPath()` and `createBrowserSupabaseClient()` from Task 1.

- [ ] **Step 1: Add failing login component tests**

Mock `@/lib/supabase/browser`. Render `LoginPanel` inside the existing `LocaleProvider` and verify:

```ts
expect(screen.getByRole("heading", { name: "登入 AI StyleCue" })).toBeVisible();
expect(screen.getByRole("button", { name: "使用 Google 登入" })).toBeEnabled();
```

Click the button and assert:

```ts
expect(signInWithOAuth).toHaveBeenCalledWith({
  provider: "google",
  options: {
    redirectTo: "http://localhost/auth/callback?next=%2Fanalyze",
    scopes: "openid email profile",
  },
});
```

Add cases for a provider error showing a localized alert and a pending request disabling the button.

- [ ] **Step 2: Add failing callback tests**

Test `/auth/callback?code=valid&next=/settings` redirects to `/settings`; missing code and rejected exchanges redirect to `/login?error=oauth`; `next=//evil.example` redirects only to `/analyze`. Assert redirect locations against the request origin.

- [ ] **Step 3: Run login and callback tests to verify failure**

Run: `pnpm test -- tests/unit/login-panel.test.tsx tests/unit/auth-callback.test.ts`

Expected: FAIL because the page, panel, and callback do not exist.

- [ ] **Step 4: Implement the client login panel**

Use `window.location.origin` for `redirectTo`, not `NEXT_PUBLIC_SITE_URL`. Call `signInWithOAuth` once per click, display only localized safe error text, and keep the basic-profile privacy statement visible. The page must not request Google APIs beyond `openid email profile`.

- [ ] **Step 5: Implement the server page and callback**

In the server page, await Next.js 15 `searchParams`, sanitize `next`, and pass only normalized `reason`/`error` flags to the client panel. In the callback, exchange `code` through `createServerSupabaseClient().auth.exchangeCodeForSession(code)`, append `login=success` to the safe destination, and fall back to the localized login error route without exposing exception text.

- [ ] **Step 6: Add four-locale login copy and styles**

Add a top-level `auth` namespace in all four JSON files with the same key shape:

```json
{
  "loginTitle": "登入 AI StyleCue",
  "loginDescription": "登入後即可開始穿搭分析。",
  "googleButton": "使用 Google 登入",
  "privacy": "我們只會取得你的姓名、Email 與 Google 個人頭像。",
  "loading": "正在前往 Google…",
  "oauthError": "登入未完成，請再試一次。"
}
```

Translate values naturally for English, Japanese, and Korean while preserving keys. Extend `tests/unit/i18n.test.ts` to assert the complete key shape for every locale. Add responsive `.login-shell`, `.login-card`, and visible focus/loading styles to `globals.css`.

- [ ] **Step 7: Run focused login verification**

Run: `pnpm test -- tests/unit/login-panel.test.tsx tests/unit/auth-callback.test.ts tests/unit/i18n.test.ts && pnpm typecheck && pnpm lint`

Expected: PASS.

- [ ] **Step 8: Commit login flow**

```bash
git add src/app/login src/app/auth/callback src/features/auth src/messages src/app/globals.css tests/unit/login-panel.test.tsx tests/unit/auth-callback.test.ts tests/unit/i18n.test.ts
git commit -m "feat: add Google login flow"
```

---

### Task 4: Required-login dialog at “Start analysis”

**Files:**
- Create: `src/features/auth/components/RequiredLoginDialog.tsx`
- Modify: `src/app/analyze/page.tsx`
- Modify: `src/features/outfit/components/PhotoStep.tsx`
- Modify: `src/features/outfit/components/OutfitFlowPage.tsx`
- Modify: `src/features/outfit/useOutfitFlow.ts`
- Modify: `src/messages/zh-TW.json`
- Modify: `src/messages/en.json`
- Modify: `src/messages/ja.json`
- Modify: `src/messages/ko.json`
- Modify: `src/app/globals.css`
- Modify: `tests/unit/outfit-flow.test.tsx`

**Interfaces:**
- Produces: `<RequiredLoginDialog />` with one link to `/login?next=/analyze&reason=analysis`.
- Changes: `PhotoStep` receives `analysisDisabled: boolean` and no longer records consent itself.
- Changes: `useOutfitFlow.analyze(): Promise<"completed" | "unauthorized">`.
- Consumes: `GET /api/auth/session` from Task 2.

- [ ] **Step 1: Add unauthenticated-gate tests before implementation**

Extend `tests/unit/outfit-flow.test.tsx` so its default fetch mock returns `{ user: { id: "user-1" } }` for `/api/auth/session`, preserving existing successful-flow tests. Add a signed-out case returning `{ user: null }`; after photo precheck passes and “開始分析” is clicked, assert:

```ts
expect(await screen.findByRole("alertdialog", { name: "登入後開始分析" })).toBeVisible();
expect(screen.getAllByRole("link")).toEqual([
  screen.getByRole("link", { name: "前往登入" }),
]);
expect(screen.queryByRole("button", { name: /取消|關閉|稍後/ })).not.toBeInTheDocument();
expect(fetch).not.toHaveBeenCalledWith("/api/analyze", expect.anything());
```

Add a test that the login-check pending state disables “開始分析”. Add a test where session summary is authenticated but `/api/analyze` returns `401`; expect the same dialog and no generic AI error.

- [ ] **Step 2: Run the focused flow tests and verify failure**

Run: `pnpm test -- tests/unit/outfit-flow.test.tsx`

Expected: new dialog, pending-state, and `401` assertions FAIL.

- [ ] **Step 3: Move consent behind authentication**

Remove `onConsentChange` from `PhotoStep`. Its click now only calls `onAnalyze`; `OutfitFlowPage.handleAnalyze` first fetches `/api/auth/session` with `{ cache: "no-store" }`. Only an authenticated response may call `flow.setConsented(true)` followed by `flow.analyze()`.

Treat network failure or an invalid session-summary response as signed out and open the dialog. Keep a local `isCheckingAuth` guard and pass it as `analysisDisabled` so repeat clicks cannot issue duplicate checks.

- [ ] **Step 4: Make server `401` an explicit hook outcome**

In `useOutfitFlow.analyze`, detect `response.status === 401` before generic error parsing:

```ts
if (response.status === 401) {
  setState("photo");
  return "unauthorized" as const;
}
```

Return `"completed"` for all other handled paths. Have `handleAnalyze` open the required-login dialog when it receives `"unauthorized"`. Route the existing error-screen retry button through the same `handleAnalyze` function.

- [ ] **Step 5: Implement the non-dismissible accessible dialog**

Render a modal layer only when required. Use `role="alertdialog"`, `aria-modal="true"`, labelled title and description, and a single anchor. On mount, focus that anchor. Add a dialog-level `keydown` handler that prevents the default Tab/Shift+Tab behavior and restores focus to that single anchor; do not prevent Escape by closing anything. Do not add backdrop click handlers, Escape dismissal, close controls, or a cancel callback. The component API therefore exposes no dismissal function.

- [ ] **Step 6: Add localized dialog copy and styles**

Add these `auth` keys in all locales: `requiredTitle`, `requiredDescription`, `goToLogin`, `loginSuccess`. Traditional Chinese values are:

```json
{
  "requiredTitle": "登入後開始分析",
  "requiredDescription": "你尚未登入 AI StyleCue，請先登入才能開始穿搭分析。",
  "goToLogin": "前往登入",
  "loginSuccess": "登入成功，請重新選擇照片開始分析。"
}
```

Change `src/app/analyze/page.tsx` to await its Next.js 15 `searchParams` and pass `loginSucceeded={searchParams.login === "success"}` to `OutfitFlowPage`. Render `loginSuccess` as a status message without restoring any prior image. Add fixed modal/backdrop styles, visible focus, and mobile sizing to `globals.css`.

- [ ] **Step 7: Run flow, type, and lint checks**

Run: `pnpm test -- tests/unit/outfit-flow.test.tsx tests/unit/i18n.test.ts && pnpm typecheck && pnpm lint`

Expected: PASS and existing photo/result tests remain green.

- [ ] **Step 8: Commit the analysis gate**

```bash
git add src/app/analyze/page.tsx src/features/auth/components/RequiredLoginDialog.tsx src/features/outfit src/messages src/app/globals.css tests/unit/outfit-flow.test.tsx tests/unit/i18n.test.ts
git commit -m "feat: gate outfit analysis behind login"
```

---

### Task 5: Settings account section and sign-out

**Files:**
- Create: `src/features/auth/components/AccountSection.tsx`
- Modify: `src/app/settings/page.tsx`
- Modify: `src/messages/zh-TW.json`
- Modify: `src/messages/en.json`
- Modify: `src/messages/ja.json`
- Modify: `src/messages/ko.json`
- Modify: `src/app/globals.css`
- Modify: `tests/unit/settings-page.test.tsx`
- Modify: `tests/unit/i18n.test.ts`

**Interfaces:**
- Produces: `<AccountSection />`, which loads `GET /api/auth/session` and signs out through `createBrowserSupabaseClient().auth.signOut()`.
- Consumes: `BasicUser` JSON shape from Task 2 and browser factory from Task 1.

- [ ] **Step 1: Add failing signed-out and signed-in settings tests**

Mock `/api/auth/session` as signed out and assert “尚未登入” plus a `/login?next=/settings` link. Mock a signed-in response and assert name, email, safe avatar alt text, and “登出”. Add a missing-metadata case that renders a neutral placeholder without broken text.

Mock `auth.signOut()` and assert clicking “登出” calls it once, leaves the Settings heading visible, and changes the account section to signed out. Add an error case that shows localized `signOutError` and retains the signed-in identity.

- [ ] **Step 2: Run the settings test and verify failure**

Run: `pnpm test -- tests/unit/settings-page.test.tsx`

Expected: new account-section assertions FAIL.

- [ ] **Step 3: Implement the account section**

Load session data on mount with an abort guard. Render loading, signed-out, and signed-in states. Render the already-sanitized HTTPS avatar with fallback initials; never use email as an authorization identifier. On successful `signOut()`, set local user state to `null` and remain on `/settings`. Disable sign-out during the request.

- [ ] **Step 4: Place account UI only in Settings**

Add `<AccountSection />` below the existing language section in `src/app/settings/page.tsx`. Do not modify `AppNavigation`, the home page, or the analysis header to show identity.

- [ ] **Step 5: Add four-locale account copy and styles**

Add `settings.accountTitle`, `accountLoading`, `signedOut`, `signIn`, `name`, `email`, `avatarAlt`, `signOut`, `signingOut`, and `signOutError` to all locale files. Keep existing Settings and language keys unchanged. Add `.account-card`, avatar, metadata, action, error, and focus styles.

- [ ] **Step 6: Run focused settings verification**

Run: `pnpm test -- tests/unit/settings-page.test.tsx tests/unit/i18n.test.ts && pnpm typecheck && pnpm lint`

Expected: PASS.

- [ ] **Step 7: Commit Settings account UI**

```bash
git add src/features/auth/components/AccountSection.tsx src/app/settings/page.tsx src/messages src/app/globals.css tests/unit/settings-page.test.tsx tests/unit/i18n.test.ts
git commit -m "feat: add account controls to settings"
```

---

### Task 6: Browser coverage, deployment documentation, and full verification

**Files:**
- Modify: `tests/e2e/outfit-flow.spec.ts`
- Create: `tests/e2e/auth.spec.ts`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes all production behavior from Tasks 1–5.
- Produces deterministic browser tests that do not contact Google or a live Supabase project.

- [ ] **Step 1: Make existing E2E flows explicitly authenticated**

In the existing Playwright `beforeEach`, route `**/api/auth/session` to return a mock user so current successful-analysis tests continue to exercise analysis rather than OAuth:

```ts
await page.route("**/api/auth/session", async (route) => {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      user: {
        id: "e2e-user",
        name: "E2E User",
        email: "e2e@example.com",
        avatarUrl: null,
      },
    }),
  });
});
```

Keep analysis, photo-check, telemetry, accessibility, and navigation assertions unchanged.

- [ ] **Step 2: Add anonymous authentication browser scenarios**

Create `tests/e2e/auth.spec.ts` with mocked session responses. Verify the home, analyze, and settings pages load while signed out. Complete photo precheck, press “開始分析”, and assert the alert dialog has exactly one “前往登入” link and no `/api/analyze` request. Verify `/settings` shows the sign-in link when signed out and basic identity plus sign-out only when signed in.

Do not click the Google button in Playwright and do not contact a real consent screen. For `/login`, assert AI StyleCue branding, introduction, privacy copy, and the enabled Google button. The exact `signInWithOAuth` request remains covered by `tests/unit/login-panel.test.tsx`.

- [ ] **Step 3: Run E2E tests and correct only behavior-related regressions**

Run: `pnpm test:e2e`

Expected: PASS with no external Google or Supabase request.

- [ ] **Step 4: Finalize environment and setup documentation**

Ensure `.env.example` documents the two required public values without values or secrets:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

If `NEXT_PUBLIC_SITE_URL` remains because it was already configured, label it optional and state that OAuth callback generation uses the browser's current origin. Update `README.md` with these manual dashboard steps:

1. Enable Google provider in Supabase Auth.
2. Configure the Google Web OAuth redirect URI as `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Set Supabase Site URL to the exact production Vercel origin.
4. Allow redirects for `http://localhost:3000/auth/callback` and the exact production `/auth/callback`.
5. Put the Google client ID and secret only in Supabase; never add the secret to Vercel.
6. Set the public Supabase URL and publishable key locally and in Vercel Production.

- [ ] **Step 5: Run the complete verification suite**

Run each command separately and preserve its output:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm test:e2e
pnpm build
```

Expected: every command exits `0`. Confirm `git diff --check` exits `0`, `git status --short` contains no `.env.local`, and `rg -n "service_role|GOOGLE_CLIENT_SECRET|SUPABASE_SECRET" src tests README.md .env.example` finds no committed secret value.

- [ ] **Step 6: Commit tests and deployment documentation**

```bash
git add tests/e2e .env.example README.md
git commit -m "test: cover Google authentication flow"
```

- [ ] **Step 7: Review the branch diff**

Run: `git diff master...HEAD --stat && git log --oneline master..HEAD`

Expected: only Google-auth design, implementation, tests, dependency, environment-example, and README changes appear; `.env.local` remains untracked by Git and no user secret is included.
