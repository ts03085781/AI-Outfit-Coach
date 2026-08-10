# Merge Photo and Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the outfit flow from four displayed steps to three by showing photo preview and consent immediately after photo selection.

**Architecture:** Keep the current `photo` state as the combined selection and confirmation screen. Move preview and consent UI into `PhotoStep`; checking consent submits the existing analysis request immediately. The result state remains the third and final displayed step.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Testing Library, Playwright.

## Global Constraints

- Use Node 24 and pnpm 11.9.0; do not add dependencies.
- The photo must remain local until the user checks explicit consent.
- The checkbox label must state that checking it immediately uploads the photo and starts analysis.
- Preserve the existing image preparation, API contract, output safety, telemetry, and result navigation behavior.
- Keep mobile controls keyboard-accessible with a 44px minimum tap target.

---

### Task 1: Combined photo confirmation flow

**Files:**
- Modify: `src/app/page.tsx`, `src/features/outfit/useOutfitFlow.ts`, `src/features/outfit/components/PhotoStep.tsx`, `src/app/globals.css`
- Delete: `src/features/outfit/components/ConsentStep.tsx`
- Modify: `tests/unit/outfit-flow.test.tsx`, `tests/e2e/outfit-flow.spec.ts`

**Interfaces:**
- `useOutfitFlow` produces `backToOccasion(): void`; it preserves occasion and optional context, clears the selected photo and consent, then sets state to `occasion`.
- `PhotoStep` consumes `image?: Blob`, `consented: boolean`, `onConsentChange(consented: boolean): void`, `onAnalyze(): void`, and `onBack(): void` in addition to its current selection props.

- [ ] **Step 1: Write failing unit and browser tests**

```ts
// After selecting a file, expect the local preview and the consent checkbox in step 2.
expect(screen.getByRole("img", { name: "本機穿搭照片預覽" })).toBeVisible();
fireEvent.click(screen.getByRole("checkbox", { name: /勾選後會立即上傳並開始分析/ }));
expect(screen.getByRole("status")).toHaveTextContent("正在分析你的穿搭");
```

```ts
// Playwright: set the photo, check consent, and expect the mocked result without a "繼續" click.
await page.setInputFiles("input[type=file]", fixture);
await page.getByRole("checkbox", { name: /勾選後會立即上傳並開始分析/ }).check();
await expect(page.getByText(analysis.summary)).toBeVisible();
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `pnpm test -- tests/unit/outfit-flow.test.tsx`

Expected: FAIL because the preview and consent UI remain in the separate third step and consent does not initiate analysis.

- [ ] **Step 3: Implement the minimal combined flow**

```ts
// page.tsx: steps are occasion=1, photo=2, and all later states=3.
const step = flow.state === "occasion" ? 1 : flow.state === "photo" ? 2 : 3;

// PhotoStep: after the existing picker, render local preview, safety copy, the explicit checkbox,
// and call onConsentChange(true); onAnalyze() from that checkbox's change handler.
```

Remove the now-unused `consent` state and `ConsentStep` component. Reset consent to `false` when a new photo is chosen, and give the combined screen a top-left `返回` button that calls `backToOccasion`.

- [ ] **Step 4: Run focused unit and browser tests**

Run: `pnpm test -- tests/unit/outfit-flow.test.tsx && pnpm test:e2e`

Expected: PASS; selection displays preview before upload, consent starts one analysis request, and result/retry flows remain functional.

- [ ] **Step 5: Run quality checks and commit**

Run: `pnpm typecheck && pnpm lint && pnpm build`

Commit:

```bash
git add src/app/page.tsx src/app/globals.css src/features/outfit/useOutfitFlow.ts src/features/outfit/components/PhotoStep.tsx src/features/outfit/components/ConsentStep.tsx tests/unit/outfit-flow.test.tsx tests/e2e/outfit-flow.spec.ts
git commit -m "feat: merge photo and consent steps"
```
