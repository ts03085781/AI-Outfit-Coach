# 首頁編輯式重設計

## 目標

依根目錄 `DESIGN.md` 與 Stitch「Smart Style AI」的手機畫面，將首頁重設計為黑白、平面、時尚編輯風格；保留所有既有首頁資料來源、路由與互動行為。

## 範圍與不可變條件

- 僅調整首頁的 UI 與其使用的底部導覽外觀。
- 保留 `WeatherCard` 的定位、快取、天氣 API 與失敗重試行為。
- 保留既有趨勢 Google 搜尋連結、`/analyze` 路由、登入門檻、分析 API、照片隱私、輸出安全與遙測邏輯。
- 不新增假資料、服裝照片、收藏或日誌功能。
- 不修改 API route、`src/features/outfit/` 的分析流程或任何安全驗證。

## 首頁體驗

頁面以「Daily Edit」小標、強烈的中英文都可容納的標題與 `/analyze` CTA 起始。CTA 是唯一的反白主按鈕，讓使用者可直接開始既有分析流程。天氣資料改以帶細框的資訊型卡片呈現，保持天氣請求／重試語意與可存取名稱。趨勢改成有編號、色材質 swatch、標題與描述的 editorial 清單，維持每張卡片原本的外部搜尋連結。

## 視覺系統

- 僅使用 `DESIGN.md` 的中性色：`#f9f9f9` 畫布、白色 surface、黑色文字／結構、`#e0e0e0` 細框。
- 使用 Chivo 優先字型堆疊；headline 為 700–900 粗體、tight tracking，正文保有易讀行高。
- 首頁為行動優先，20px 外距、24px 內容間距、64px 主區段間距。
- 不使用陰影，以 0.5–1px 外框、黑白反轉與充足留白表現層次。
- 所有可操作元素保留至少 44px 高度與清楚的鍵盤 focus state。

## 元件邊界

- `src/app/page.tsx` 只組合 hero、既有 `WeatherCard`、趨勢清單與既有 `AppNavigation`；CTA 使用 `next/link` 導向 `/analyze`。
- `WeatherCard` 保留資料邏輯，只增補可供編輯式版面使用的語意結構／class。
- `AppNavigation` 保留目的地、路由與 aria-current 邏輯，只調整可渲染的標籤結構與外觀。
- `src/app/globals.css` 將首頁專屬樣式以 `.home-*` 與其子元件 scope 隔離，避免改變分析、登入與設定頁的功能行為。

## 驗證

- 首頁單元測試驗證 CTA 指向 `/analyze`、既有天氣重試按鈕、底部導覽與趨勢搜尋連結仍存在。
- 執行 `vitest`、TypeScript、ESLint 與 Playwright 首頁流程；若執行環境無法下載瀏覽器，明確記錄限制。
