# Start Analysis Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the prepared-photo consent checkbox with a localized “開始分析” button that records consent and starts the existing analysis flow.

**Architecture:** Keep consent ownership and the fail-closed analysis guard in `useOutfitFlow`. Change only the photo-step presentation and caller interface: the new button synchronously records consent and invokes analysis, while existing privacy copy and API behavior remain intact.

**Tech Stack:** Next.js 15, React, TypeScript, next-intl, Vitest, Testing Library, Playwright, CSS

## Global Constraints

- The Traditional Chinese button text must be exactly `開始分析`.
- A photo must not be sent before the user presses the button.
- Existing provider and local privacy disclosures must remain visible before analysis.
- Preserve the existing fail-closed consent guard and reset consent when replacing a photo.
- Do not change the analysis API contract.

---

### Task 1: Specify the new photo action in unit tests

**Files:**
- Modify: `tests/unit/outfit-flow.test.tsx`

**Interfaces:**
- Consumes: rendered `HomePage` photo flow and the existing mocked `/api/analyze` boundary.
- Produces: regression coverage that targets `getByRole("button", { name: "開始分析" })` and rejects the old checkbox interaction.

- [ ] **Step 1: Update the focused rendering and interaction assertions**

Replace prepared-photo checkbox assertions and clicks with the new button. Keep the pre-photo assertion that no analysis action is present. Rename tests so they describe the button behavior, including:

```tsx
expect(screen.queryByRole("button", { name: "開始分析" })).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "開始分析" })).toBeVisible();
fireEvent.click(screen.getByRole("button", { name: "開始分析" }));
expect(screen.getByRole("status")).toHaveTextContent("正在分析你的穿搭");
```

Update the tap-target stylesheet assertion to cover `.primary-action` with `min-height: 52px` and a `:focus-visible` rule.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm test -- tests/unit/outfit-flow.test.tsx`

Expected: FAIL because `PhotoStep` still renders the consent checkbox and no “開始分析” button.

### Task 2: Implement the localized button

**Files:**
- Modify: `src/features/outfit/components/PhotoStep.tsx`
- Modify: `src/features/outfit/components/OutfitFlowPage.tsx`
- Modify: `src/messages/zh-TW.json`
- Modify: `src/messages/en.json`
- Modify: `src/messages/ja.json`
- Modify: `src/messages/ko.json`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `onConsentChange(consented: boolean): void`, `onAnalyze(): void`, and prepared-image rendering state.
- Produces: a localized `photo.startAnalysis` button that records consent before invoking analysis; removes the unused `consented` presentation prop.

- [ ] **Step 1: Replace the checkbox with the button**

Use this prepared-photo action in `PhotoStep`:

```tsx
<button
  className="primary-action photo-analyze"
  type="button"
  onClick={() => {
    onConsentChange(true);
    onAnalyze();
  }}
>
  {t("startAnalysis")}
</button>
```

Remove `consented` from `PhotoStepProps`, destructuring, and the `PhotoStep` call in `OutfitFlowPage`. Do not remove consent state from `useOutfitFlow`.

- [ ] **Step 2: Replace the obsolete localization key**

Set these values:

```json
"startAnalysis": "開始分析"
"startAnalysis": "Start analysis"
"startAnalysis": "分析を開始"
"startAnalysis": "분석 시작"
```

Remove `photo.consent` from each locale.

- [ ] **Step 3: Remove obsolete consent styles and add focus coverage**

Delete `.consent-label` rules. Include `.photo-analyze` in the existing visible focus rule, or add an equivalent `:focus-visible` rule while keeping the existing `.primary-action` dimensions.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `pnpm test -- tests/unit/outfit-flow.test.tsx`

Expected: PASS with no warnings.

### Task 3: Update the browser flows

**Files:**
- Modify: `tests/e2e/outfit-flow.spec.ts`

**Interfaces:**
- Consumes: the localized “開始分析” button, existing photo chooser, mocked analysis, telemetry, retry, and result actions.
- Produces: browser coverage for button-driven analysis and replacement without premature submission.

- [ ] **Step 1: Replace checkbox selectors and update replacement assertions**

Use this action throughout helpers and scenarios:

```ts
await page.getByRole("button", { name: "開始分析" }).click();
```

In the replacement test, assert the button is visible before and after replacement preparation, and keep the existing preview/replacement layout checks. Remove checkbox-specific checked state and label bounding-box assertions. Assert the analysis route is not called until “開始分析” is clicked where the existing mocks make that observable.

- [ ] **Step 2: Run the browser suite**

Run: `pnpm test:e2e`

Expected: PASS with all browser flows using the new button.

### Task 4: Verify the complete change

**Files:**
- Verify all files changed in Tasks 1–3.

**Interfaces:**
- Consumes: the completed implementation and test suite.
- Produces: evidence that the repository meets its test, type, lint, browser, and build gates.

- [ ] **Step 1: Run all unit and safety tests**

Run: `pnpm test`

Expected: PASS with zero failed tests.

- [ ] **Step 2: Run static verification**

Run: `pnpm typecheck`

Expected: exit code 0.

Run: `pnpm lint`

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 3: Run the production build**

Run: `pnpm build`

Expected: exit code 0.

- [ ] **Step 4: Review the final diff and requirement coverage**

Run: `git diff --check && git diff --stat && git status --short`

Expected: no whitespace errors; only the scoped component, caller, locale, style, tests, and design/plan files are changed.
