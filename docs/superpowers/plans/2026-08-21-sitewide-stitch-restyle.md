# Sitewide Stitch Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every user-facing route with the monochrome, Chivo-based, editorial design system defined in `DESIGN.md` without changing application behavior.

**Architecture:** Put semantic visual tokens and reusable primitive classes in `src/app/globals.css`, then migrate page shells and feature components to those primitives in route-sized increments. Preserve current React state, requests, accessibility semantics, localization, and server boundaries; use DOM and CSS-contract tests to guard the design migration and Playwright for complete-flow verification.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, CSS custom properties, Vitest, Testing Library, Playwright, pnpm 11.9.0

**Spec:** `docs/superpowers/specs/2026-08-21-sitewide-stitch-restyle-design.md`

## Global Constraints

- `DESIGN.md` and Google Stitch project `4771117903189315119` are the visual source of truth.
- Use Chivo throughout the interface.
- Keep the application achromatic; reserve `#ba1a1a` for error feedback.
- Use semantic design tokens instead of isolated literal values in components.
- Do not add a runtime UI dependency.
- Do not change API contracts, authentication behavior, safety validation, telemetry contracts, model prompts, weather behavior, or existing localized copy.
- Preserve semantic headings, live regions, alert roles, dialog focus handling, input labels, and `prefers-reduced-motion` behavior.
- Interactive targets must be at least 44px square, and the layout must not scroll horizontally at 320px.
- Keep user photography color-accurate and visually dominant.

---

## File Map

- `src/app/globals.css`: owns global tokens, resets, shared visual primitives, all route compositions, responsive rules, and state styling.
- `src/app/layout.tsx`: loads Chivo with `next/font/google` and exposes its CSS variable on `<body>`.
- `src/app/page.tsx`: owns Home editorial structure only.
- `src/app/settings/page.tsx`: owns Settings page structure and field grouping.
- `src/features/home/components/AppNavigation.tsx`: owns shared destination navigation and active state.
- `src/features/home/components/WeatherCard.tsx`: owns weather state markup.
- `src/features/auth/components/LoginPanel.tsx`: owns Login composition and OAuth action.
- `src/features/auth/components/AccountSection.tsx`: owns account loading, signed-out, signed-in, and error markup.
- `src/features/auth/components/RequiredLoginDialog.tsx`: owns modal semantics and required-login composition.
- `src/features/outfit/components/OutfitFlowPage.tsx`: owns workflow shell, step header, occasion, analyzing, and error compositions.
- `src/features/outfit/components/PhotoStep.tsx`: owns photo upload, preview, precheck status, and analyze action.
- `src/features/outfit/components/ResultStep.tsx`: owns result hierarchy, advice, feedback, and restart controls.
- `tests/unit/design-system.test.ts`: guards token presence, Chivo wiring, and removal of legacy visual literals.
- `tests/unit/home-page.test.tsx`, `tests/unit/login-panel.test.tsx`, `tests/unit/settings-page.test.tsx`, `tests/unit/outfit-flow.test.tsx`: guard stable semantic/class hooks introduced by each migration.
- `tests/e2e/home.spec.ts`, `tests/e2e/auth.spec.ts`, `tests/e2e/outfit-flow.spec.ts`: guard responsive shells and complete user flows.

### Task 1: Establish the shared design-token foundation

**Files:**
- Create: `tests/unit/design-system.test.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `--font-chivo` from `next/font/google`; semantic CSS properties `--color-canvas`, `--color-surface`, `--color-ink`, `--color-muted`, `--color-outline`, `--color-error`, `--radius-control`, `--radius-card`, `--space-page`, and `--content-max`; shared classes `.editorial-page`, `.editorial-label`, `.button-primary`, `.button-secondary`, `.button-ghost`, `.field-control`, `.editorial-card`.

- [ ] **Step 1: Write the failing design-system contract test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");

describe("Stitch design system", () => {
  it("defines the shared monochrome tokens and Chivo font", () => {
    expect(css).toContain("--color-canvas: #f9f9f9");
    expect(css).toContain("--color-ink: #000000");
    expect(css).toContain("--radius-control: 8px");
    expect(css).toContain("--content-max: 1200px");
    expect(layout).toContain('import { Chivo } from "next/font/google"');
    expect(layout).toContain("chivo.variable");
  });

  it("does not retain legacy brand colors or Georgia", () => {
    for (const legacy of ["#176b87", "#f4dfbf", "#3d2d1c", "Georgia"]) {
      expect(css.toLowerCase()).not.toContain(legacy.toLowerCase());
    }
  });
});
```

- [ ] **Step 2: Run the contract test and verify that it fails**

Run: `pnpm vitest run tests/unit/design-system.test.ts`

Expected: FAIL because the shared token declarations and Chivo layout wiring do not exist and legacy literals remain.

- [ ] **Step 3: Wire Chivo through the root layout**

```tsx
import { Chivo } from "next/font/google";

const chivo = Chivo({
  subsets: ["latin"],
  variable: "--font-chivo",
  weight: ["300", "400", "700", "900"],
});

// Keep the existing locale resolution unchanged.
<body className={chivo.variable}>
  <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
</body>
```

- [ ] **Step 4: Replace the legacy global palette with tokens and primitives**

```css
:root {
  --color-canvas: #f9f9f9;
  --color-surface: #ffffff;
  --color-surface-low: #f3f3f4;
  --color-surface-high: #e8e8e8;
  --color-ink: #000000;
  --color-text: #1a1c1c;
  --color-muted: #4c4546;
  --color-outline: #e0e0e0;
  --color-outline-strong: #7e7576;
  --color-error: #ba1a1a;
  --radius-control: 8px;
  --radius-container: 12px;
  --radius-card: 16px;
  --space-page: 20px;
  --content-max: 1200px;
}

body {
  margin: 0;
  color: var(--color-text);
  background: var(--color-canvas);
  font-family: var(--font-chivo), Arial, sans-serif;
}

.button-primary,
.button-secondary {
  min-height: 44px;
  padding: 12px 16px;
  border-radius: var(--radius-control);
  font: inherit;
  font-weight: 700;
}

.button-primary { color: #fff; background: var(--color-ink); border: 2px solid var(--color-ink); }
.button-secondary { color: var(--color-ink); background: var(--color-surface); border: 1px solid var(--color-ink); }
.field-control { min-height: 44px; background: var(--color-surface); border: .5px solid var(--color-outline); border-radius: var(--radius-control); }
.editorial-card { background: var(--color-surface); border: .5px solid var(--color-outline); border-radius: var(--radius-card); }
```

Remove all superseded selector blocks instead of appending another override layer. Keep the reduced-motion keyframes and safe-area behavior.

- [ ] **Step 5: Run the design contract and existing smoke tests**

Run: `pnpm vitest run tests/unit/design-system.test.ts tests/unit/smoke.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the design foundation**

```bash
git add src/app/layout.tsx src/app/globals.css tests/unit/design-system.test.ts
git commit -m "style: establish Stitch design foundation"
```

### Task 2: Normalize Home and shared navigation

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/features/home/components/AppNavigation.tsx`
- Modify: `src/features/home/components/WeatherCard.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/unit/home-page.test.tsx`
- Modify: `tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes: shared tokens and primitives from Task 1.
- Produces: `.home-shell`, `.home-hero`, `.home-weather-section`, `.trend-section`, and `.app-navigation` using only shared tokens; `data-testid="app-navigation"` for responsive verification.

- [ ] **Step 1: Add failing semantic and responsive assertions**

```tsx
expect(screen.getByRole("main")).toHaveClass("editorial-page", "home-shell");
expect(screen.getByRole("navigation")).toHaveAttribute("data-testid", "app-navigation");
```

```ts
await page.setViewportSize({ width: 320, height: 800 });
await page.goto("/");
await expect(page.getByTestId("app-navigation")).toBeVisible();
expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
```

- [ ] **Step 2: Run focused Home tests and verify failure**

Run: `pnpm vitest run tests/unit/home-page.test.tsx`

Expected: FAIL because the shared page class and navigation test id are absent.

- [ ] **Step 3: Apply shared page and navigation hooks**

```tsx
<main className="editorial-page home-shell app-page-with-nav">
```

```tsx
<nav aria-label={t("navigation")} className="app-navigation" data-testid="app-navigation">
```

Keep destinations, translated labels, icons, `aria-current`, external trend searches, and WeatherCard behavior unchanged.

- [ ] **Step 4: Consolidate Home CSS onto shared tokens**

Define the hero at `font-size: clamp(3rem, 15vw, 4.5rem)`, weight 900, and tight tracking; use 64px section gaps; use a white outlined weather card; render trends as border-separated rows; and keep bottom navigation white with a 1px black top border and a 2px active marker. Delete the former `--home-*` aliases.

- [ ] **Step 5: Run Home unit and browser tests**

Run: `pnpm vitest run tests/unit/home-page.test.tsx tests/unit/weather-card.test.tsx`

Run: `pnpm test:e2e -- tests/e2e/home.spec.ts`

Expected: PASS at the existing viewport plus the new 320px overflow check.

- [ ] **Step 6: Commit the Home migration**

```bash
git add src/app/page.tsx src/features/home/components/AppNavigation.tsx src/features/home/components/WeatherCard.tsx src/app/globals.css tests/unit/home-page.test.tsx tests/e2e/home.spec.ts
git commit -m "style: align home and navigation with Stitch"
```

### Task 3: Restyle Login, Settings, Account, and required-login dialog

**Files:**
- Modify: `src/app/settings/page.tsx`
- Modify: `src/features/auth/components/LoginPanel.tsx`
- Modify: `src/features/auth/components/AccountSection.tsx`
- Modify: `src/features/auth/components/RequiredLoginDialog.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/unit/login-panel.test.tsx`
- Modify: `tests/unit/settings-page.test.tsx`
- Modify: `tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `.editorial-page`, `.editorial-label`, action, field, and card primitives.
- Produces: editorial auth/settings shells without changing OAuth, locale persistence, session fetching, sign-out, or dialog focus behavior.

- [ ] **Step 1: Add failing shared-class assertions**

```tsx
expect(screen.getByRole("main")).toHaveClass("editorial-page", "login-shell");
expect(screen.getByRole("button", { name: /Google/i })).toHaveClass("button-primary");
```

```tsx
expect(screen.getByRole("main")).toHaveClass("editorial-page", "settings-shell");
expect(screen.getByRole("combobox")).toHaveClass("field-control");
```

- [ ] **Step 2: Run focused auth/settings tests and verify failure**

Run: `pnpm vitest run tests/unit/login-panel.test.tsx tests/unit/settings-page.test.tsx`

Expected: FAIL because the shared primitive classes have not been attached.

- [ ] **Step 3: Restructure markup into readable editorial groups**

Apply `editorial-page` to Login and Settings, `editorial-label` to eyebrow and field labels, `editorial-card` to login/account/dialog surfaces, `field-control` to the locale selector, and action classes to Google sign-in, sign-in/out, and required-login controls. Reformat `settings/page.tsx` from its current single-line return while preserving all event handlers.

- [ ] **Step 4: Replace auth/settings legacy styles**

Use centered readable columns capped near 32rem, 32–64px vertical group gaps, 16px outlined cards, an overlay of `rgb(0 0 0 / 45%)`, `rgb(255 255 255 / 90%)` dialog background, and `backdrop-filter: blur(10px)`. Error boxes use `--color-error` text and border on `#ffdad6`; ordinary success/loading states remain neutral.

- [ ] **Step 5: Run auth/settings tests**

Run: `pnpm vitest run tests/unit/login-panel.test.tsx tests/unit/settings-page.test.tsx`

Run: `pnpm test:e2e -- tests/e2e/auth.spec.ts`

Expected: PASS, including OAuth redirect, locale persistence, account states, modal focus, and navigation.

- [ ] **Step 6: Commit the auth/settings migration**

```bash
git add src/app/settings/page.tsx src/features/auth/components/LoginPanel.tsx src/features/auth/components/AccountSection.tsx src/features/auth/components/RequiredLoginDialog.tsx src/app/globals.css tests/unit/login-panel.test.tsx tests/unit/settings-page.test.tsx tests/e2e/auth.spec.ts
git commit -m "style: restyle auth and settings surfaces"
```

### Task 4: Restyle occasion, context, photo, analyzing, and error states

**Files:**
- Modify: `src/features/outfit/components/OutfitFlowPage.tsx`
- Modify: `src/features/outfit/components/PhotoStep.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/unit/outfit-flow.test.tsx`
- Modify: `tests/e2e/outfit-flow.spec.ts`

**Interfaces:**
- Consumes: shared page, action, form, card, label, error, and focus styles.
- Produces: `.analyze-shell`, `.occasion-grid`, `.photo-upload-empty`, `.photo-preview-shell`, `.analysis-status`, and step-progress states that preserve all `useOutfitFlow` actions.

- [ ] **Step 1: Add failing workflow class and 320px assertions**

```tsx
expect(screen.getByRole("main")).toHaveClass("editorial-page", "analyze-shell");
expect(screen.getByRole("button", { name: /日常外出/i })).toHaveClass("occasion-option");
```

```ts
await page.setViewportSize({ width: 320, height: 800 });
await page.goto("/analyze");
expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
```

- [ ] **Step 2: Run focused workflow tests and verify failure**

Run: `pnpm vitest run tests/unit/outfit-flow.test.tsx`

Expected: FAIL on the new class contracts while existing behavior assertions remain green.

- [ ] **Step 3: Apply editorial workflow structure**

Add `editorial-page analyze-shell` to the main element; keep a compact header and three progress segments; attach `occasion-option` to occasion buttons, `field-control` to optional controls, `button-ghost` to Back/Replace, `button-secondary` to photo-check retry, and `button-primary` to Analyze/Retry. Rename the analyzing wrapper class to `analysis-status` while preserving `role="status"` and `aria-live="polite"`.

- [ ] **Step 4: Implement the mobile-first workflow CSS**

Use a readable flow column capped near 44rem; black current progress segments; two-column occasion tiles that collapse to one column below 340px; an outlined upload frame with a minimum 18rem image area; full-bleed preview using `object-fit: contain` without filters; neutral checking/passed messages; explicit red error text; and full-width primary actions on mobile.

- [ ] **Step 5: Run flow unit and Playwright tests**

Run: `pnpm vitest run tests/unit/outfit-flow.test.tsx`

Run: `pnpm test:e2e -- tests/e2e/outfit-flow.spec.ts`

Expected: PASS for occasion/context selection, image preparation, photo precheck, auth gate, loading, retry, and 320px overflow.

- [ ] **Step 6: Commit the workflow migration**

```bash
git add src/features/outfit/components/OutfitFlowPage.tsx src/features/outfit/components/PhotoStep.tsx src/app/globals.css tests/unit/outfit-flow.test.tsx tests/e2e/outfit-flow.spec.ts
git commit -m "style: redesign outfit analysis flow"
```

### Task 5: Restyle results, advice, feedback, and result navigation

**Files:**
- Modify: `src/features/outfit/components/ResultStep.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/unit/outfit-flow.test.tsx`
- Modify: `tests/e2e/outfit-flow.spec.ts`

**Interfaces:**
- Consumes: all shared tokens and primitives plus the workflow shell from Task 4.
- Produces: `.result-step`, `.result-photo`, `.result-summary`, `.result-strengths`, `.fit-label`, `.primary-suggestion`, `.suggestion-list`, `.feedback-actions`, and `.result-navigation` in a responsive editorial hierarchy.

- [ ] **Step 1: Add failing result hierarchy assertions**

After reaching the mocked result in the existing test harness, assert:

```tsx
expect(screen.getByRole("article")).toHaveClass("editorial-card", "result-summary");
expect(screen.getByRole("navigation", { name: /結果|navigation/i })).toHaveClass("result-navigation");
```

- [ ] **Step 2: Run the focused result tests and verify failure**

Run: `pnpm vitest run tests/unit/outfit-flow.test.tsx -t "result"`

Expected: FAIL because `result-summary` and the shared card class are absent.

- [ ] **Step 3: Apply result section classes and action hierarchy**

Rename `summary-card` to `editorial-card result-summary`; wrap strengths in `result-strengths`; add `feedback-actions` around helpful/not-helpful buttons; apply secondary actions to feedback and reselect; apply the primary action to restart; retain existing photo object URL lifecycle, telemetry, retake behavior, and disabled handling.

- [ ] **Step 4: Implement editorial result CSS**

Use a 16px image frame with no filter; an outlined white summary; indexed or border-separated strengths and suggestions; black/white fit classification treatment; no colored advice panels; and 12px action gaps. At desktop widths, allow the image and analysis content to form two balanced columns while keeping headings and controls in DOM reading order.

- [ ] **Step 5: Run result and full outfit-flow tests**

Run: `pnpm vitest run tests/unit/outfit-flow.test.tsx`

Run: `pnpm test:e2e -- tests/e2e/outfit-flow.spec.ts`

Expected: PASS for result photo, recommendations, feedback telemetry, retake, reselect, restart, and responsive navigation.

- [ ] **Step 6: Commit the result migration**

```bash
git add src/features/outfit/components/ResultStep.tsx src/app/globals.css tests/unit/outfit-flow.test.tsx tests/e2e/outfit-flow.spec.ts
git commit -m "style: present outfit results editorially"
```

### Task 6: Complete repository and visual verification

**Files:**
- Modify only files required to correct failures found by this task.

**Interfaces:**
- Consumes: completed sitewide restyle.
- Produces: a verified build with no legacy style literals, regressions, overflow, or inaccessible interactive states.

- [ ] **Step 1: Run the legacy-style scan**

Run: `rg -n '#176b87|#f4dfbf|#3d2d1c|Georgia|box-shadow' src/app src/features`

Expected: no matches. If a platform-required shadow remains, replace it with an outline or document why it is required before continuing.

- [ ] **Step 2: Run all static and unit checks**

Run: `pnpm test && pnpm typecheck && pnpm lint`

Expected: all commands exit 0.

- [ ] **Step 3: Run production and browser verification**

Run: `pnpm build && pnpm test:e2e`

Expected: production build and all Playwright tests pass.

- [ ] **Step 4: Inspect representative pages in a real browser**

Start with `pnpm dev`, then inspect `/`, `/analyze`, `/login`, and `/settings` at 320×800, 390×844, 768×1024, and 1440×1000. Verify no horizontal overflow, fixed navigation safe areas, visible keyboard focus, 44px targets, neutral disabled/loading states, readable dialogs, full-bleed unfiltered images, and deliberate desktop whitespace.

- [ ] **Step 5: Commit verification corrections**

```bash
git add src tests
git commit -m "fix: polish responsive Stitch restyle"
```

Skip this commit only if Step 1–4 required no corrections.
