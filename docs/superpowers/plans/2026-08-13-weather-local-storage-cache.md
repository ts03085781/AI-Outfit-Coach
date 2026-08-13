# Weather LocalStorage Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 快取首頁天氣資料，讓 60 分鐘內且移動未超過 5 公里的使用者不重複呼叫 Open-Meteo API。

**Architecture:** `weather.ts` 提供快取的資料型別、讀寫與更新判斷。`WeatherCard` 先顯示有效結構的 LocalStorage 快取，再背景取得定位；僅在無快取、超過時間門檻或移動超過距離門檻時刷新。取得定位或 API 失敗時保留已顯示的快取。

**Tech Stack:** Next.js 15、React 19、TypeScript、Vitest、Testing Library、LocalStorage、Geolocation API。

## Global Constraints

- 快取有效期固定為 `60 * 60 * 1000` 毫秒，距離門檻為 5 公里。
- 快取記錄包含 `snapshot`、`latitude`、`longitude`、`cachedAt`；timestamp 使用 `Date.now()` 毫秒值。
- 不因跨日刷新；僅無快取、超過 60 分鐘或移動超過 5 公里時自動呼叫 API。
- LocalStorage 僅在 client component 執行；無效 JSON／結構不可造成 UI 例外。
- 不新增依賴，維持 strict TypeScript、雙空白縮排、雙引號與分號。

---

## File structure

- Modify `src/features/home/weather.ts`: 快取型別、解析、寫入、距離與期限判斷。
- Modify `src/features/home/components/WeatherCard.tsx`: 快取優先顯示與刷新編排。
- Modify `tests/unit/weather.test.ts`: 快取領域測試。
- Modify `tests/unit/weather-card.test.tsx`: 卡片快取流程測試。
- Modify `tests/unit/home-page.test.tsx`: 清除跨測試 LocalStorage。

### Task 1: 天氣快取領域函式

**Files:** Modify `src/features/home/weather.ts`; test `tests/unit/weather.test.ts`.

**Interfaces:** 產出 `WeatherCoordinates = { latitude: number; longitude: number }`、`CachedWeather = WeatherCoordinates & { snapshot: WeatherSnapshot; cachedAt: number }`、`WEATHER_CACHE_KEY = "ai-outfit-coach.weather"`、`WEATHER_CACHE_TTL_MS = 60 * 60_000`、`WEATHER_CACHE_DISTANCE_KM = 5`，以及 `readCachedWeather(storage)`, `writeCachedWeather(storage, cachedWeather)`, `shouldRefreshWeather(cachedWeather, coordinates, now)`。

- [ ] **Step 1: Write the failing test**

在 `weather.test.ts` 建立固定 `CachedWeather`（台北雨天，`cachedAt: 1_000_000`）。測試寫入後可讀回相同物件；`"{bad-json"` 與僅 `{ cachedAt: 1 }` 的 JSON 皆讀為 `undefined`；相同座標在 `4_600_000` 不刷新、`4_600_001` 刷新；座標 `(25.03, 121.62)` 在原 timestamp 也刷新。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/weather.test.ts`  
Expected: FAIL，因快取 exports 尚不存在。

- [ ] **Step 3: Write minimal implementation**

在 `weather.ts` 新增上述型別／常數。`readCachedWeather` 以 `try/catch` 解析 `storage.getItem(WEATHER_CACHE_KEY)`，並驗證座標、timestamp、五個 snapshot 欄位均為有限數字，`condition` 是既有七種 `WeatherCondition` 之一；否則回傳 `undefined`。`writeCachedWeather` 用 `JSON.stringify` 寫入。以 Haversine 公里公式計算距離；`shouldRefreshWeather` 只在 `now - cachedAt > WEATHER_CACHE_TTL_MS` 或距離嚴格大於 5 時回傳 true，兩個等號邊界都保留快取。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/weather.test.ts`  
Expected: PASS，包含既有 API 回應轉換案例。

- [ ] **Step 5: Commit**

Run: `git add src/features/home/weather.ts tests/unit/weather.test.ts`  
Run: `git commit -m "feat: add weather cache helpers"`

### Task 2: WeatherCard cache-first refresh behavior

**Files:** Modify `src/features/home/components/WeatherCard.tsx`; test `tests/unit/weather-card.test.tsx`.

**Interfaces:** 使用 Task 1 的 `CachedWeather`、`readCachedWeather`、`writeCachedWeather`、`shouldRefreshWeather` 和既有 `fetchWeatherSnapshot`；產出 cache-first UI，retry 一律強制刷新。

- [ ] **Step 1: Write the failing test**

在 `weather-card.test.tsx` 的 `beforeEach` 加 `localStorage.clear()`。新增四個案例：(1) 寫入 `Date.now()` 的雨天快取與相同座標，render 後顯示雨天 icon 且 API 未呼叫；(2) 寫入 `Date.now() - 60 * 60_000 - 1` 的快取，mock API 回傳晴天，顯示晴天並確認 LocalStorage snapshot 已覆寫；(3) 寫入新鮮快取但 geolocation 回傳相距超過 5 km 的座標，確認 API 呼叫；(4) 有過期雨天快取但 API reject，確認仍顯示雨天 icon 且不顯示 retry button。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/weather-card.test.tsx`  
Expected: FAIL，因目前元件總是呼叫 API 且不管理快取。

- [ ] **Step 3: Write minimal implementation**

把 `requestWeather` 改成 `requestWeather(force = false)`。開始時讀 `localStorage`：有快取立即設為 `ready`，無快取才設 `loading`。定位成功後組成 `coordinates`；若有快取且未 force 且 `shouldRefreshWeather` 為 false 就 return。否則呼叫 API，以 `writeCachedWeather(localStorage, { ...coordinates, snapshot, cachedAt: Date.now() })` 覆寫，再設 `ready`。API 或定位失敗時僅無快取才設定既有 `unavailable`／`blocked` 狀態。保留現有 geolocation options，且 retry button 改為 `onClick={() => requestWeather(true)}`。禁止在 render 階段存取 `localStorage`。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/weather-card.test.tsx`  
Expected: PASS，包含既有 icon／UV 與新增四個快取案例。

- [ ] **Step 5: Commit**

Run: `git add src/features/home/components/WeatherCard.tsx tests/unit/weather-card.test.tsx`  
Run: `git commit -m "feat: cache homepage weather"`

### Task 3: Regression isolation and verification

**Files:** Modify `tests/unit/home-page.test.tsx`.

**Interfaces:** 消耗 JSDOM `localStorage`；產出不受前序測試快取資料影響的首頁測試。

- [ ] **Step 1: Write the failing test setup**

在 `home-page.test.tsx` 的 `beforeEach` 開頭加上 `localStorage.clear()`，再執行原有 `navigator.geolocation` stub；保留其拒絕定位的行為。

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm test tests/unit/home-page.test.tsx`  
Expected: PASS，仍顯示 retryable weather，點 retry 後定位函式共呼叫兩次。

- [ ] **Step 3: Run all static and unit verification**

Run: `pnpm test && pnpm typecheck && pnpm lint`  
Expected: 三個命令皆以 exit 0 結束。

- [ ] **Step 4: Run affected browser flow**

Run: `pnpm test:e2e`  
Expected: Playwright scenarios 全部以 exit 0 結束。

- [ ] **Step 5: Commit**

Run: `git add tests/unit/home-page.test.tsx`  
Run: `git commit -m "test: isolate weather cache state"`

## Self-review

- Spec coverage：Task 1 包含快取結構、安全讀寫與兩個門檻；Task 2 包含顯示、刷新、寫回、失敗回退；Task 3 包含隔離與完整驗證。
- Placeholder scan：沒有待定需求或籠統測試步驟。
- Type consistency：`CachedWeather` 是唯一持久化結構；`WeatherCoordinates` 同時服務距離判斷與 API 呼叫；UI 只使用 `WeatherSnapshot`。
