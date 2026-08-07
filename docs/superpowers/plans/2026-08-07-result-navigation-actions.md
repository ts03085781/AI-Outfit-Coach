# Result Navigation Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在正常 AI 結果頁底部加入「重新選擇照片」與「返回第一步驟」，並依規格清除或保留對應狀態。

**Architecture:** `useOutfitFlow` 擁有流程與資料重置責任；`ResultStep` 只呈現按鈕並呼叫 callbacks；`page.tsx` 負責 wiring。正常結果切換步驟會卸載 `ResultStep`，自然清除追問與回饋的元件內狀態。

**Tech Stack:** React 19、Next.js 15、TypeScript、Vitest、Testing Library、Playwright、CSS。

## Global Constraints

- 新按鈕只顯示於 `retake_required: false` 的正常結果。
- 「重新選擇照片」保留場合、天氣、地點環境與想呈現的感覺。
- 「返回第一步驟」清除本次所有流程資料。
- 兩個操作都清除照片、同意、分析結果、分析憑證與錯誤。
- 不自動開啟檔案選擇器，不新增確認對話框。
- 按鈕位於結果頁底部，採次要樣式，觸控目標至少 44×44 px且焦點可見。
- 嚴格 RED → GREEN → REFACTOR；不得使用真實 API。

---

### Task 1: 加入結果頁重新選擇與完整重置

**Files:**
- Modify: `src/features/outfit/useOutfitFlow.ts`
- Modify: `src/features/outfit/components/ResultStep.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/unit/outfit-flow.test.tsx`
- Modify: `tests/e2e/outfit-flow.spec.ts`

**Interfaces:**
- Produces: `useOutfitFlow().reselectPhoto(): void`，保留情境背景並回到 `photo`。
- Produces: `useOutfitFlow().restart(): void`，清除全部本次資料並回到 `occasion`。
- Extends: `ResultStepProps` 加入 `onReselectPhoto: () => void` 與 `onRestart: () => void`。

- [ ] **Step 1: 寫正常結果與重拍結果的失敗測試**

在 `tests/unit/outfit-flow.test.tsx` 加入：

```tsx
expect(screen.getByRole("button", { name: "重新選擇照片" })).toBeVisible();
expect(screen.getByRole("button", { name: "返回第一步驟" })).toBeVisible();
```

既有重拍測試補上：

```tsx
expect(screen.queryByRole("button", { name: "重新選擇照片" })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "返回第一步驟" })).not.toBeInTheDocument();
```

- [ ] **Step 2: 寫兩種重置行為的失敗測試**

第一個測試先填天氣、環境與想呈現感覺，完成 mock 分析後點「重新選擇照片」，斷言：

```tsx
expect(screen.getByRole("heading", { name: "拍下完整穿搭" })).toBeVisible();
expect(screen.queryByRole("heading", { name: "你的穿搭建議" })).not.toBeInTheDocument();
```

再選新照片並返回第一步驟檢查保留值。第二個測試完成分析後點「返回第一步驟」，斷言場合頁顯示，並確認天氣、環境與想呈現感覺回到空值。

- [ ] **Step 3: 執行測試確認 RED**

Run:

```bash
PATH=/Users/laiyilin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm test -- tests/unit/outfit-flow.test.tsx
```

Expected: FAIL，因兩個按鈕與 `restart` callback 尚不存在。

- [ ] **Step 4: 實作 hook 的兩種重置操作**

在 `useOutfitFlow.ts` 實作共用的分析狀態清除，並暴露：

```ts
const reselectPhoto = () => {
  setImage(undefined);
  setConsented(false);
  setPhotoError(undefined);
  setResult(undefined);
  setAnalysisToken(undefined);
  setAnalysisErrorCode(undefined);
  setState("photo");
};

const restart = () => {
  setOccasion(undefined);
  setWeather(undefined);
  setSetting(undefined);
  setDesiredFeel("");
  setImage(undefined);
  setConsented(false);
  setPhotoError(undefined);
  setResult(undefined);
  setAnalysisToken(undefined);
  setAnalysisErrorCode(undefined);
  setState("occasion");
};
```

既有重拍結果的 `retake` 可委派給與 `reselectPhoto` 相同的流程重置行為，但保留原公開名稱以免擴大變更。

- [ ] **Step 5: 實作正常結果頁底部按鈕與 wiring**

在正常結果 JSX 最後加入：

```tsx
<nav className="result-navigation" aria-label="重新開始">
  <button type="button" onClick={onReselectPhoto}>重新選擇照片</button>
  <button type="button" onClick={onRestart}>返回第一步驟</button>
</nav>
```

`page.tsx` 將 `flow.reselectPhoto` 與 `flow.restart` 傳入 `ResultStep`。重拍分支在此 nav 之前 return，因此不顯示新按鈕。

- [ ] **Step 6: 加入次要樣式與可及性斷言**

`globals.css` 為 `.result-navigation` 使用靠近結果底部的 grid／flex 版面；按鈕 `min-height: 44px`、次要邊框樣式與 `:focus-visible`。測試斷言 nav 的 accessible name，以及兩個按鈕的 class/style 規則。

- [ ] **Step 7: 加入 mock-only E2E**

在 `tests/e2e/outfit-flow.spec.ts` 加入正常結果操作：

```ts
await page.getByRole("button", { name: "重新選擇照片" }).click();
await expect(page.getByRole("heading", { name: "拍下完整穿搭" })).toBeVisible();
```

另一路點「返回第一步驟」，確認「今天要去哪裡？」出現。所有 API 維持 route interception，不使用金鑰。

- [ ] **Step 8: 執行完整驗證**

Run:

```bash
PATH=/Users/laiyilin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm test
PATH=/Users/laiyilin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm test:e2e
PATH=/Users/laiyilin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm typecheck
PATH=/Users/laiyilin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm lint
PATH=/Users/laiyilin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm build
```

Expected: 全部 PASS，無真實 OpenAI API 呼叫。

- [ ] **Step 9: 提交**

```bash
git add src/app/page.tsx src/app/globals.css src/features/outfit/useOutfitFlow.ts src/features/outfit/components/ResultStep.tsx tests/unit/outfit-flow.test.tsx tests/e2e/outfit-flow.spec.ts
git commit -m "feat: add result navigation actions"
```
