# Homepage Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the existing home page into the approved monochrome editorial experience while preserving its routing, weather, trend-link, privacy, and analysis behavior.

**Architecture:** Keep all runtime behavior in the existing page and home components. Add an existing-route CTA in the page, retain `WeatherCard` state/data handling, and scope the new visual tokens to home and navigation CSS so the outfit workflow and server boundaries are unchanged.

**Tech Stack:** Next.js 15, React 19, TypeScript, next-intl, Vitest, Testing Library, CSS.

**Spec:** `docs/superpowers/specs/2026-08-21-homepage-editorial-redesign-design.md`

## Global Constraints

- Use `DESIGN.md` tokens: Chivo-first typography, monochrome palette, flat surfaces, no decorative shadows, 20px mobile margin, 24px gutter, and 44px minimum touch targets.
- Preserve the existing weather API/permission/cache/retry logic, trend Google URLs, `/analyze` route, API behavior, analysis flow, privacy, and output safety logic.
- Do not add dependencies, mock personal photo data, or alter files under `src/app/api/` or `src/features/outfit/`.
- Use two-space indentation, semicolons, double quotes, and `@/` imports.

---

### Task 1: Define the homepage contract in tests

**Files:**
- Modify: `tests/unit/home-page.test.tsx`

**Interfaces:**
- Consumes: `HomePage` and localized Chinese messages.
- Produces: regression coverage for the new CTA plus retained weather, navigation, and trend behavior.

- [x] **Step 1: Write the failing test**

```tsx
expect(screen.getByRole("link", { name: "拍下我的穿搭" })).toHaveAttribute("href", "/analyze");
```

- [x] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/unit/home-page.test.tsx`

Expected: FAIL because the editorial CTA does not exist.

- [x] **Step 3: Implement the minimal page markup**

```tsx
<Link className="home-analysis-cta" href="/analyze">
  {t("cta")}
  <span aria-hidden="true">→</span>
</Link>
```

- [x] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/unit/home-page.test.tsx`

Expected: PASS.

### Task 2: Apply the approved editorial presentation

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/features/home/components/WeatherCard.tsx`
- Modify: `src/features/home/components/AppNavigation.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: the retained homepage test contract and current weather/navigation component behavior.
- Produces: a scoped mobile-first home presentation with unchanged link destinations and aria semantics.

- [x] **Step 1: Add concise structural classes and visual-only labels**

```tsx
<section aria-labelledby="home-title" className="home-hero">
  <p className="home-kicker">{t("eyebrow")}</p>
  <h1 id="home-title">{t("title")}</h1>
</section>
```

- [x] **Step 2: Style the homepage with `DESIGN.md` tokens**

```css
.home-shell { background: #f9f9f9; color: #000; padding: 24px 20px 116px; }
.home-analysis-cta { min-height: 52px; background: #000; border: 2px solid #000; color: #fff; }
```

- [x] **Step 3: Keep weather and navigation behavior unchanged while adding visual classes**

```tsx
<span className="app-navigation-label">{t(destination.key === "analyze" ? "analyzeOutfit" : destination.key)}</span>
```

- [x] **Step 4: Run focused tests**

Run: `./node_modules/.bin/vitest run tests/unit/home-page.test.tsx tests/unit/weather-card.test.tsx`

Expected: PASS.

### Task 3: Verify the complete UI change

**Files:**
- Modify: `docs/superpowers/plans/2026-08-21-homepage-editorial-redesign.md` (mark completed steps after verification)

**Interfaces:**
- Consumes: all homepage changes.
- Produces: a verified, lint-clean implementation with the same external behavior.

- [x] **Step 1: Run the full unit suite**

Run: `./node_modules/.bin/vitest run`

Expected: PASS.

- [x] **Step 2: Run static verification**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint .`

Expected: PASS with no errors.

- [x] **Step 3: Run the home browser flow**

Run: `./node_modules/.bin/playwright test tests/e2e/home.spec.ts`

Expected: PASS, or document a missing locally installed browser without changing product code.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/app/globals.css src/features/home/components/AppNavigation.tsx src/features/home/components/WeatherCard.tsx tests/unit/home-page.test.tsx docs/superpowers
git commit -m "feat: redesign editorial homepage"
```
