# Analyzing Loading Icon Design

## Goal

在 `OutfitFlowPage` 的 analyzing 狀態中顯示持續旋轉的 loading icon，讓使用者清楚知道分析仍在進行。

## Design

- 使用專案既有的 `react-icons` 套件提供 loading icon，不新增相依套件。
- icon 放在 analyzing 區塊的標題與說明文字之後。
- 使用專用容器搭配 flex，讓 icon 水平與垂直置中於容器。
- 使用 CSS `@keyframes` 建立持續旋轉動畫，並以專用 class 套用動畫與尺寸。
- icon 屬於裝飾性內容，設為 `aria-hidden="true"`；既有 `role="status"` 與 `aria-live="polite"` 繼續負責向輔助技術傳達分析狀態。

## Testing

- 元件測試應驗證 analyzing 狀態會呈現 loading icon 與置中容器 class。
- 執行相關 Vitest 測試、TypeScript typecheck 與 ESLint。

## Scope

僅修改 analyzing 狀態的視覺回饋與必要測試，不變更分析流程、文案或 API 行為。
