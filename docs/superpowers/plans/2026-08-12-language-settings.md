# Language Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, immediately applied language selector to settings and remove it from the first two analysis steps.

**Architecture:** Reuse `LocaleProvider`'s `persistLocale(locale)` and `useAppLocale()` context. `SettingsPage` becomes the sole UI entry point; `OutfitFlowPage` consumes its active locale without providing a competing selector.

**Tech Stack:** Next.js 15, React 19, TypeScript, next-intl, Vitest, Testing Library, Playwright.

## Global Constraints

- Use Node 24 and pnpm 11.9.0; do not add dependencies.
- Save `NEXT_LOCALE` in both cookie and localStorage; localStorage failures must not prevent a change.
- Support exactly `zh-TW`, `en`, `ja`, and `ko`.
- Keep analysis and follow-up request locale behavior unchanged.

---

### Task 1: Settings language preference

**Files:**
- Modify: `src/app/settings/page.tsx`, `src/messages/zh-TW.json`, `src/messages/en.json`, `src/messages/ja.json`, `src/messages/ko.json`
- Test: `tests/unit/settings-page.test.tsx`

**Interfaces:**
- Consumes: `useAppLocale(): { locale: AppLocale; setLocale(locale: AppLocale): void }` and `persistLocale(locale: AppLocale): void`.
- Produces: a labelled `<select>` whose change persists and immediately applies the selected `AppLocale`.

- [ ] **Step 1: Write a failing settings-page test**

```tsx
render(<SettingsPage />);
fireEvent.change(screen.getByLabelText("選擇語言"), { target: { value: "en" } });
expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
expect(localStorage.getItem("NEXT_LOCALE")).toBe("en");
expect(document.cookie).toContain("NEXT_LOCALE=en");
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm test -- tests/unit/settings-page.test.tsx`

Expected: FAIL because the settings page has no language select.

- [ ] **Step 3: Implement the smallest selector and translations**

```tsx
const { locale, setLocale } = useAppLocale();
const changeLocale = (value: AppLocale) => {
  persistLocale(value);
  setLocale(value);
};
```

Use `locales.map()` for options and add localized `settings.language` copy to all message files.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm test -- tests/unit/settings-page.test.tsx`

Expected: PASS; content updates immediately and both stores contain the selected locale.

### Task 2: Remove analysis-step selector

**Files:**
- Modify: `src/features/outfit/components/OutfitFlowPage.tsx`, `src/app/globals.css`, `tests/unit/outfit-flow.test.tsx`, `tests/e2e/outfit-flow.spec.ts`

**Interfaces:**
- Consumes: `useLocale()` active locale, unchanged.
- Produces: first and second analysis steps with no language preference control or reserved selector spacing.

- [ ] **Step 1: Update unit and E2E expectations for the removed control**

```tsx
render(<AnalyzePage />);
expect(screen.queryByLabelText("選擇語言")).not.toBeInTheDocument();
expect(document.querySelector(".flow-card")).not.toHaveClass("has-language-select");
```

```ts
await page.goto("/settings");
await page.getByLabel("選擇語言").selectOption("en");
await page.goto("/analyze");
await expect(page.getByRole("heading", { name: "Where are you going today?" })).toBeVisible();
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `pnpm test -- tests/unit/outfit-flow.test.tsx && pnpm test:e2e -- outfit-flow.spec.ts`

Expected: FAIL because the analysis page currently renders the selector.

- [ ] **Step 3: Remove selector-only implementation and CSS**

Remove `LanguageSelect`, its i18n imports, conditional markup, `has-language-select`, and `.language-select` rules. Leave the active locale and form-data locale logic unchanged.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `pnpm test -- tests/unit/outfit-flow.test.tsx && pnpm test:e2e -- outfit-flow.spec.ts`

Expected: PASS; settings sets the interface language and analysis steps do not expose a selector.

### Task 3: Full verification

**Files:**
- Verify: modified implementation and tests.

- [ ] **Step 1: Run project checks**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`

Expected: PASS.

- [ ] **Step 2: Review final diff and commit**

Run: `git diff --check && git status --short`

Commit:

```bash
git add docs/superpowers/specs/2026-08-12-language-settings-design.md docs/superpowers/plans/2026-08-12-language-settings.md src/app/settings/page.tsx src/app/globals.css src/features/outfit/components/OutfitFlowPage.tsx src/messages tests/unit/settings-page.test.tsx tests/unit/outfit-flow.test.tsx tests/e2e/outfit-flow.spec.ts
git commit -m "feat: add settings language preference"
```
