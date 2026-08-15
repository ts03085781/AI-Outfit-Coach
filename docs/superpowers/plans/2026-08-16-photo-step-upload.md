# Photo Step Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate camera/library controls with one state-aware photo upload surface, show replacement and consent controls only after a prepared photo exists, and retain JPEG, PNG, and WebP support.

**Architecture:** `PhotoStep` owns one hidden file input and exposes it through native buttons for the empty and preview states. The existing `useOutfitFlow.choosePhoto` pipeline remains the source of truth for preparation, error handling, and consent reset; rendering is derived from `image` plus its local object URL. Focused Vitest and Playwright coverage exercise the state transitions without changing the analysis API.

**Tech Stack:** Next.js 15, React 19, strict TypeScript, next-intl, Vitest/Testing Library, Playwright, CSS.

## Global Constraints

- Keep `accept="image/jpeg,image/png,image/webp"` and display `JPG、PNG、WebP，單張照片` in zh-TW.
- Do not add a `capture` attribute or retain separate camera and library actions.
- Do not render consent until image preparation succeeds.
- Checking consent must continue to upload and start analysis immediately.
- Do not change image preparation, privacy, telemetry, or API contracts.
- Keep visible interactive targets at least 44 by 44 pixels and keyboard accessible.
- Use strict TypeScript, two-space indentation, semicolons, double quotes, and `@/` imports.

---

## File Structure

- Modify `src/features/outfit/components/PhotoStep.tsx`: own the shared file input, render the empty/preview states, and gate consent.
- Modify `src/features/outfit/components/OutfitFlowPage.tsx`: remove the redundant `hasPhoto` prop.
- Modify `src/app/globals.css`: replace obsolete picker styles with upload-surface, preview-overlay, focus, and responsive styles.
- Modify `src/messages/zh-TW.json`: add the approved Traditional Chinese upload copy.
- Modify `src/messages/en.json`: add equivalent English copy.
- Modify `src/messages/ja.json`: add equivalent Japanese copy.
- Modify `src/messages/ko.json`: add equivalent Korean copy.
- Modify `tests/unit/outfit-flow.test.tsx`: test rendering states, shared input behavior, replacement lifecycle, input reset for same-file reselection, and existing analysis behavior.
- Modify `tests/e2e/outfit-flow.spec.ts`: test the mobile empty, preview, replacement, rendered styles, and analysis flow through the shared input.

### Task 1: State-aware shared photo input

**Files:**
- Modify: `tests/unit/outfit-flow.test.tsx:46-135`
- Modify: `src/features/outfit/components/PhotoStep.tsx:3-98`
- Modify: `src/features/outfit/components/OutfitFlowPage.tsx:115-125`
- Modify: `src/messages/zh-TW.json:40-52`
- Modify: `src/messages/en.json:44-56`
- Modify: `src/messages/ja.json:37-49`
- Modify: `src/messages/ko.json:37-49`

**Interfaces:**
- Consumes: `image?: Blob`, `consented: boolean`, `error?: ImagePreparationErrorCode`, and the existing `onChoosePhoto(file?: File)`, `onConsentChange(consented: boolean)`, `onAnalyze()`, and `onBack()` callbacks.
- Produces: one `#outfit-photo` input accepting `image/jpeg,image/png,image/webp`; buttons named by `photo.addPhoto` and `photo.replacePhoto`; conditional consent rendering.

- [ ] **Step 1: Replace the old picker unit tests with failing state tests**

Replace the `source` parameter in the helper and the old separate-input tests with a shared-input helper and these expectations:

```tsx
function chooseOccasionAndPhoto(file = new File(["outfit"], "outfit.jpg", { type: "image/jpeg" })) {
  fireEvent.click(screen.getByRole("button", { name: "日常外出" }));
  fireEvent.change(document.querySelector("#outfit-photo") as HTMLInputElement, {
    target: { files: [file] },
  });
}

it("shows one upload surface and hides consent before a photo is prepared", () => {
  render(<HomePage />);
  fireEvent.click(screen.getByRole("button", { name: "日常外出" }));

  expect(screen.getByRole("button", { name: "加入一張全身照" })).toBeVisible();
  expect(screen.getByText("JPG、PNG、WebP，單張照片")).toBeVisible();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "拍照" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "選擇照片" })).not.toBeInTheDocument();

  const input = document.querySelector("#outfit-photo");
  expect(input).toHaveAttribute("type", "file");
  expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
  expect(input).not.toHaveAttribute("capture");
});

it("opens the shared file input from the empty upload surface", () => {
  const inputClick = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  render(<HomePage />);
  fireEvent.click(screen.getByRole("button", { name: "日常外出" }));

  fireEvent.click(screen.getByRole("button", { name: "加入一張全身照" }));

  expect(inputClick).toHaveBeenCalledTimes(1);
  inputClick.mockRestore();
});

it("shows replacement and consent controls only after preparation succeeds", async () => {
  render(<HomePage />);
  chooseOccasionAndPhoto();

  expect(await screen.findByRole("img", { name: "本機穿搭照片預覽" })).toHaveAttribute(
    "src",
    "blob:local-preview",
  );
  expect(screen.getByRole("button", { name: "更換照片" })).toBeVisible();
  expect(screen.getByRole("checkbox", { name: /勾選後會立即上傳並開始分析/ }))
    .not.toBeChecked();
  expect(screen.queryByRole("button", { name: "加入一張全身照" })).not.toBeInTheDocument();
});
```

Update every direct `screen.getByLabelText("選擇照片")` upload in this test file to change `document.querySelector("#outfit-photo") as HTMLInputElement`. Preserve each test's existing file and assertions.

- [ ] **Step 2: Run the focused test and verify the new expectations fail**

Run:

```bash
pnpm test -- tests/unit/outfit-flow.test.tsx
```

Expected: FAIL because `加入一張全身照`, `#outfit-photo`, and `更換照片` do not exist, and consent is currently rendered in the empty state.

- [ ] **Step 3: Add exact localized copy in all four message files**

Replace the unused `empty`, `chosen`, `camera`, and `library` keys with these keys while preserving `back`, `title`, `description`, `preview`, privacy copy, and consent copy:

```json
// src/messages/zh-TW.json
"addPhoto": "加入一張全身照",
"fileHint": "JPG、PNG、WebP，單張照片",
"replacePhoto": "更換照片",

// src/messages/en.json
"addPhoto": "Add a full-body photo",
"fileHint": "JPG, PNG, WebP, one photo",
"replacePhoto": "Replace photo",

// src/messages/ja.json
"addPhoto": "全身写真を追加",
"fileHint": "JPG、PNG、WebP、写真1枚",
"replacePhoto": "写真を変更",

// src/messages/ko.json
"addPhoto": "전신 사진 추가",
"fileHint": "JPG, PNG, WebP, 사진 1장",
"replacePhoto": "사진 변경",
```

The comments above identify files and are not added to JSON.

- [ ] **Step 4: Implement the shared input and mutually exclusive visual states**

Refactor `PhotoStep.tsx` around one input ref and one change handler:

```tsx
import { useEffect, useRef, useState, type ChangeEvent } from "react";

type PhotoStepProps = {
  image?: Blob;
  consented: boolean;
  error?: ImagePreparationErrorCode;
  onChoosePhoto: (file?: File) => void;
  onConsentChange: (consented: boolean) => void;
  onAnalyze: () => void;
  onBack: () => void;
};

const inputRef = useRef<HTMLInputElement>(null);
const hasPreview = Boolean(image && previewUrl);
const openPhotoPicker = () => inputRef.current?.click();
const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = "";
  onChoosePhoto(file);
};
```

Render the input and two states inside the section after any error:

```tsx
<input
  ref={inputRef}
  id="outfit-photo"
  className="photo-file-input"
  type="file"
  accept="image/jpeg,image/png,image/webp"
  onChange={handlePhotoChange}
/>
{hasPreview ? (
  <div className="photo-preview-shell">
    {/* The source is a local object URL and never leaves the browser through this element. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="photo-preview" src={previewUrl} alt={t("preview")} />
    <button className="photo-replace" type="button" onClick={openPhotoPicker}>
      {t("replacePhoto")}
    </button>
  </div>
) : (
  <button className="photo-upload-empty" type="button" onClick={openPhotoPicker}>
    <span className="photo-upload-plus" aria-hidden="true">+</span>
    <span className="photo-upload-title">{t("addPhoto")}</span>
    <span className="photo-upload-hint">{t("fileHint")}</span>
  </button>
)}
{hasPreview ? (
  <label className="consent-label">
    <input
      type="checkbox"
      checked={consented}
      onChange={(event) => {
        const nextConsented = event.target.checked;
        onConsentChange(nextConsented);
        if (nextConsented) onAnalyze();
      }}
    />
    {t("consent")}
  </label>
) : null}
```

Keep the existing object-URL creation and cleanup effect. Remove `hasPhoto` from the props type, destructuring, commented markup, and the `<PhotoStep>` call in `OutfitFlowPage.tsx`.

- [ ] **Step 5: Run the focused unit test and verify behavior passes**

Run:

```bash
pnpm test -- tests/unit/outfit-flow.test.tsx
```

Expected: PASS, including existing privacy, consent-to-analysis, back-navigation, stale preparation, and replacement tests after their selectors use `#outfit-photo`.

- [ ] **Step 6: Commit the behavior and localization change**

```bash
git add src/features/outfit/components/PhotoStep.tsx src/features/outfit/components/OutfitFlowPage.tsx src/messages/zh-TW.json src/messages/en.json src/messages/ja.json src/messages/ko.json tests/unit/outfit-flow.test.tsx
git commit -m "feat: simplify photo selection states"
```

### Task 2: Replacement lifecycle and reference-matched styling

**Files:**
- Modify: `tests/unit/outfit-flow.test.tsx:212-235`
- Modify: `src/app/globals.css:238-259`
- Modify: `src/app/globals.css:274-298`

**Interfaces:**
- Consumes: `.photo-file-input`, `.photo-upload-empty`, `.photo-preview-shell`, `.photo-preview`, `.photo-replace`, and `.consent-label` emitted by Task 1.
- Produces: an empty selection surface matching the supplied visual direction, a top-right preview overlay, explicit focus treatment, 44-pixel minimum targets, and a cleared input value that permits same-file reselection.

- [ ] **Step 1: Add failing replacement and input-reset behavior tests**

Keep the existing deferred replacement test, switch both uploads to `#outfit-photo`, and assert the empty state during preparation:

```tsx
const input = document.querySelector("#outfit-photo") as HTMLInputElement;
fireEvent.change(input, {
  target: { files: [new File(["new"], "new.jpg", { type: "image/jpeg" })] },
});

await waitFor(() => {
  expect(screen.getByRole("button", { name: "加入一張全身照" })).toBeVisible();
  expect(screen.queryByRole("img", { name: "本機穿搭照片預覽" })).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
```

Add an input-reset regression test. Overriding the JSDOM instance value simulates the browser's non-empty file-input state before the change handler runs:

```tsx
it("clears the shared input so the same file can be selected again", () => {
  render(<HomePage />);
  fireEvent.click(screen.getByRole("button", { name: "日常外出" }));
  const input = document.querySelector("#outfit-photo") as HTMLInputElement;
  const file = new File(["outfit"], "outfit.jpg", { type: "image/jpeg" });
  Object.defineProperty(input, "value", {
    configurable: true,
    writable: true,
    value: "C:\\fakepath\\outfit.jpg",
  });

  fireEvent.change(input, { target: { files: [file] } });

  expect(input).toHaveValue("");
});
```

- [ ] **Step 2: Run the focused tests and verify the new behavior fails**

Run:

```bash
pnpm test -- tests/unit/outfit-flow.test.tsx
```

Expected: FAIL because replacement does not yet switch to the empty state as specified, or because the shared input value is not cleared.

- [ ] **Step 3: Replace obsolete picker CSS with the approved visual treatment**

Remove `.photo-picker`, `.photo-picker-options`, their hover rules, and their transition entry. Add these focused rules, adjusting only if browser verification identifies overflow:

```css
.photo-file-input { display: none; }

.photo-upload-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 22rem;
  gap: 14px;
  margin: 18px 0;
  padding: 28px;
  color: #506f6d;
  background: #f3f7f6;
  border: 2px dashed #b4c8c8;
  border-radius: 36px;
  cursor: pointer;
  text-align: center;
}

.photo-upload-plus { font-size: 3rem; font-weight: 300; line-height: 1; }
.photo-upload-title { font-size: 1.35rem; font-weight: 750; }
.photo-upload-hint { color: #748b89; font-size: .95rem; }
.photo-preview-shell { position: relative; margin: 18px 0; }
.photo-preview { display: block; width: 100%; height: 22rem; margin: 0; object-fit: contain; background: #f4dfbf; border-radius: 13px; }

.photo-replace {
  position: absolute;
  top: 12px;
  right: 12px;
  min-width: 44px;
  min-height: 44px;
  padding: 10px 14px;
  color: #493629;
  background: rgba(255, 253, 250, .94);
  border: 1px solid #eadfd4;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(23, 32, 42, .16);
  cursor: pointer;
  font-weight: 700;
}

.photo-upload-empty:hover,
.photo-replace:hover { border-color: #506f6d; }

.photo-upload-empty:focus-visible,
.photo-replace:focus-visible { outline: 3px solid #f3a66b; outline-offset: 3px; }
```

Update the reduced-motion block to transition `.photo-upload-empty` and `.photo-replace` with buttons, without reintroducing `.photo-picker`.

- [ ] **Step 4: Run the focused unit test and static checks**

Run:

```bash
pnpm test -- tests/unit/outfit-flow.test.tsx
pnpm typecheck
pnpm lint
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit styling and lifecycle coverage**

```bash
git add src/app/globals.css tests/unit/outfit-flow.test.tsx
git commit -m "styles: add photo upload and replacement states"
```

### Task 3: Mobile browser flow migration

**Files:**
- Modify: `tests/e2e/outfit-flow.spec.ts:44-104`

**Interfaces:**
- Consumes: `#outfit-photo`, the localized visible actions `加入一張全身照` and `更換照片`, the preview alt `本機穿搭照片預覽`, and the unchanged consent checkbox.
- Produces: Playwright coverage for empty-state visibility, upload, replacement, consent gating, and successful mocked analysis at the existing 390-by-844 viewport.

- [ ] **Step 1: Rewrite the browser helper and old picker tests**

Use the one shared input in `reachPhotoStep`:

```ts
async function reachPhotoStep(page: Page, occasion = "日常外出") {
  await page.goto("/analyze");
  await page.getByRole("button", { name: occasion }).click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "加入一張全身照" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(fixture);
  await expect(page.getByRole("img", { name: "本機穿搭照片預覽" })).toBeVisible();
}
```

Replace the separate-camera/library scenarios with these tests:

```ts
test("shows one empty upload surface before photo selection", async ({ page }) => {
  await page.goto("/analyze");
  await page.getByRole("button", { name: "日常外出" }).click();

  await expect(page.getByRole("button", { name: "加入一張全身照" })).toBeVisible();
  await expect(page.getByText("JPG、PNG、WebP，單張照片")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.locator("#outfit-photo")).toHaveAttribute(
    "accept",
    "image/jpeg,image/png,image/webp",
  );
  await expect(page.locator("#outfit-photo")).not.toHaveAttribute("capture");
});

test("replaces a prepared photo and restores consent only when ready", async ({ page }) => {
  await reachPhotoStep(page);

  await expect(page.getByRole("button", { name: "更換照片" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /勾選後會立即上傳並開始分析/ }))
    .not.toBeChecked();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "更換照片" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(fixture);
  await expect(page.getByRole("img", { name: "本機穿搭照片預覽" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /勾選後會立即上傳並開始分析/ }))
    .not.toBeChecked();
});
```

Leave the occasion loop and mocked analysis assertions intact; they now call the revised helper without a `source` argument.

- [ ] **Step 2: Run the focused browser spec**

Run:

```bash
pnpm test:e2e -- tests/e2e/outfit-flow.spec.ts
```

Expected: PASS for the 390-by-844 mobile viewport, including all existing retake, retry, navigation, privacy, and analysis scenarios.

- [ ] **Step 3: Inspect the rendered states at the mobile viewport**

Start the app and inspect `/analyze` at 390 by 844 pixels:

```bash
pnpm dev
```

Verify both states against the supplied reference:

- The empty surface has a pale background, rounded dashed outline, centered plus/title/hint, no consent, and no old buttons.
- The selected image does not overflow the card; `更換照片` remains in its top-right corner and is readable on the fixture.
- Keyboard focus is visible on both upload actions.
- Consent appears only after the preview and retains a comfortable 44-pixel target.

Use Playwright's rendered DOM instead of source-text assertions. Add these checks to the two state tests:

```ts
const upload = page.getByRole("button", { name: "加入一張全身照" });
const uploadBox = await upload.boundingBox();
expect(uploadBox?.height).toBeGreaterThanOrEqual(352);
await expect(upload).toHaveCSS("border-top-style", "dashed");
await upload.focus();
await expect(upload).toBeFocused();
expect(await upload.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");

const replace = page.getByRole("button", { name: "更換照片" });
const replaceBox = await replace.boundingBox();
expect(replaceBox?.height).toBeGreaterThanOrEqual(44);
await replace.focus();
await expect(replace).toBeFocused();
expect(await replace.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
```

Stop the development server after inspection.

- [ ] **Step 4: Commit the browser coverage**

```bash
git add tests/e2e/outfit-flow.spec.ts
git commit -m "test: cover shared photo upload flow"
```

### Task 4: Full verification

**Files:**
- Verify only; modify a task-owned file above only if a command reveals a regression attributable to this feature.

**Interfaces:**
- Consumes: the completed UI, localization, CSS, unit coverage, and browser coverage from Tasks 1-3.
- Produces: a clean verification record for the requested behavior and all repository quality gates.

- [ ] **Step 1: Run the complete unit and safety suite**

```bash
pnpm test
```

Expected: all Vitest suites pass.

- [ ] **Step 2: Run strict TypeScript validation**

```bash
pnpm typecheck
```

Expected: exit 0 with no diagnostics.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: exit 0 with no warnings or errors introduced by the change.

- [ ] **Step 4: Run the complete Playwright suite**

```bash
pnpm test:e2e
```

Expected: all browser scenarios pass.

- [ ] **Step 5: Run the production build**

```bash
pnpm build
```

Expected: Next.js production build completes successfully.

- [ ] **Step 6: Review the final diff and repository state**

```bash
git diff --check
git status --short
git log -4 --oneline
```

Expected: no whitespace errors; only intentional task files are changed or committed; the three feature commits are visible after the design commit.
