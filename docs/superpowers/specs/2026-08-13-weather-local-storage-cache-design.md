# Weather LocalStorage Cache Design

## Goal

降低首頁重複呼叫天氣 API 的頻率，同時讓使用者開啟頁面時能立即看見最近一次的天氣資料。

## Cache record

以單一 LocalStorage key 儲存下列 JSON：

```ts
type CachedWeather = {
  snapshot: WeatherSnapshot;
  latitude: number;
  longitude: number;
  cachedAt: number;
};
```

`cachedAt` 使用 `Date.now()` 的毫秒 Unix timestamp。讀取時會驗證 JSON 結構、有限數值與既有 `WeatherSnapshot` 欄位；缺漏、格式錯誤或過期不合法資料一律視為無快取，且不讓錯誤傳出 UI。

## Refresh policy

1. `WeatherCard` 掛載後先同步讀取快取；有效資料立即以 `ready` 狀態顯示。
2. 接著在背景取得瀏覽器定位，僅用來判斷是否需要更新。
3. 以下任一條件成立時，呼叫 Open-Meteo API：沒有有效快取、`Date.now() - cachedAt` 大於 60 分鐘、或目前定位與快取座標相距超過 5 公里。
4. API 成功時，使用最新快照、目前座標與新 timestamp 覆寫 LocalStorage，並更新畫面。
5. 若定位或 API 失敗而已有快取，保留快取畫面；沒有快取時，維持目前的無法取得／定位被拒絕重試介面。

不依跨日強制更新；資料是否刷新只由上述 60 分鐘與 5 公里規則決定。

## Boundaries

- `weather.ts`：保留 API 回應轉換，新增純粹、可單元測試的快取序列化、解析、期限和座標距離判斷。
- `WeatherCard.tsx`：編排初始快取顯示、定位取得、刷新條件與 UI 狀態，不直接解析 LocalStorage JSON。
- 不新增套件、不改 API 合約，也不將 LocalStorage 用於伺服器端。

## Testing

- 驗證合法快取可讀寫；毀損或結構不合法資料會安全忽略。
- 驗證 60 分鐘邊界與 5 公里距離邊界的刷新判斷。
- 元件測試涵蓋：優先顯示有效快取、不符合刷新條件時不呼叫 API、符合時間或距離條件時更新並寫回、刷新失敗時保留快取。
