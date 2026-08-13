# Analyzing Loading Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在穿搭分析進行中顯示持續旋轉、以 flex 置中的 loading icon。

**Architecture:** 在既有 `OutfitFlowPage` analyzing 狀態中加入 `react-icons` 的 `ImSpinner8`，並以專用容器和 icon class 隔離版面及動畫樣式。既有狀態文字維持可存取性，icon 本身標記為裝飾性。

**Tech Stack:** Next.js 15、React 19、TypeScript、react-icons、CSS、Vitest、Testing Library

## Global Constraints

- 不新增相依套件。
- 僅修改 analyzing 狀態的視覺回饋與必要測試。
- 不變更分析流程、文案或 API 行為。
- 保留既有 `role="status"` 與 `aria-live="polite"`，icon 使用 `aria-hidden="true"`。

---

### Task 1: Analyzing Spinner

**Files:**
- Modify: `tests/unit/outfit-flow.test.tsx`
- Modify: `src/features/outfit/components/OutfitFlowPage.tsx:1-132`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `flow.state === "analyzing"` 與 `ImSpinner8` React icon component。
- Produces: `.analyzing-loader` flex 容器及 `.analyzing-spinner` 旋轉 icon 樣式。

- [ ] **Step 1: Write the failing test**

在既有 pending analysis 測試中，取得 status 區塊並驗證其中包含裝飾性 SVG，其父元素具有 `analyzing-loader` class，SVG 具有 `analyzing-spinner` class：

```tsx
const status = screen.getByRole("status");
const spinner = status.querySelector("svg[aria-hidden='true']");
expect(spinner).toHaveClass("analyzing-spinner");
expect(spinner?.parentElement).toHaveClass("analyzing-loader");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/outfit-flow.test.tsx`

Expected: FAIL，因 analyzing status 尚未包含 spinner SVG。

- [ ] **Step 3: Write minimal implementation**

在 `OutfitFlowPage.tsx` 匯入並呈現 icon：

```tsx
import { ImSpinner8 } from "react-icons/im";

<div className="analyzing-loader">
  <ImSpinner8 className="analyzing-spinner" aria-hidden="true" />
</div>
```

在 `globals.css` 加入置中與動畫：

```css
.analyzing-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 96px;
}

.analyzing-spinner {
  width: 32px;
  height: 32px;
  animation: analyzing-spinner-rotation 0.8s linear infinite;
}

@keyframes analyzing-spinner-rotation {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 4: Run focused test to verify it passes**

Run: `pnpm test -- tests/unit/outfit-flow.test.tsx`

Expected: PASS。

- [ ] **Step 5: Run project verification**

Run: `pnpm typecheck`

Expected: PASS。

Run: `pnpm lint`

Expected: PASS。

- [ ] **Step 6: Review the diff without committing unrelated changes**

Run: `git diff -- tests/unit/outfit-flow.test.tsx src/features/outfit/components/OutfitFlowPage.tsx src/app/globals.css`

Expected: 僅新增 spinner 測試、icon markup 與置中旋轉樣式；既有使用者修改保持原樣。
