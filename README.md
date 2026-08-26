# AI Outfit Coach

需要 Google 登入的手機 PWA：使用者選擇情境、提供一張穿搭照並同意後，取得固定格式的溫和穿搭建議。

## 安裝與啟動

本專案固定使用 Node 24 與 pnpm 11.9.0（`package.json` 已宣告）。

```bash
nvm use 24
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
cp .env.example .env.local
pnpm dev
```

在 `.env.local` 設定僅供伺服器使用的 `OPENAI_API_KEY`、`OPENAI_PHOTO_CHECK_MODEL`、`OPENAI_VISION_MODEL`、`OPENAI_TRENDS_MODEL`、`OPENAI_IMAGE_MODEL`、`RATE_LIMIT_SECRET`、`ANALYSIS_TOKEN_SECRET` 與 `CRON_SECRET`，以及公開的 `NEXT_PUBLIC_SUPABASE_URL` 與 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。`OPENAI_PHOTO_CHECK_MODEL` 預設為 `gpt-5-nano`，供選取照片後的快速規格檢查使用；`OPENAI_VISION_MODEL` 則用於完整穿搭分析。Secret 應各自使用至少 32 bytes 的隨機值。不要提交 `.env.local`，也不要把任何金鑰放在前端程式碼。

## 每日流行單品更新

首頁會優先顯示 Vercel Blob 中最新成功發布的 5 筆台灣流行單品；尚未建立 Blob 或讀取失敗時，改顯示內建的四語 fallback。正式部署前：

1. 在 Vercel 專案建立並連結 Blob store，讓 Production 自動取得 Blob 憑證；本機需要操作同一 store 時才設定 `BLOB_READ_WRITE_TOKEN`。
2. 設定支援 Responses API Web Search 的 `OPENAI_TRENDS_MODEL` 與支援圖片生成的 `OPENAI_IMAGE_MODEL`。
3. 在 Vercel Production 設定強隨機值 `CRON_SECRET`。Vercel Cron 會自動用 `Authorization: Bearer <CRON_SECRET>` 呼叫 Route。
4. `vercel.json` 每天 UTC 22:00 呼叫 `/api/cron/trends`，即台北時間隔日 06:00。Cron 只會在 Production deployment 執行。

每次執行會先搜尋趨勢與來源、產生 5 張無人物／品牌／文字的商品照，接著以版本化路徑上傳圖片與 manifest，最後才覆寫 `fashion-trends/latest.json`。成功後保留最新與前一個成功版本，其餘版本會刪除；未完成且超過 48 小時的 orphan 檔案也會清除。清理失敗只寫入 Vercel Functions Runtime Logs，下一次執行會再嘗試，不會撤回已發布版本。

## Supabase 與 Google OAuth 部署設定

請在 Supabase 與 Google Cloud Dashboard 完成以下手動設定：

1. 在 Supabase Auth 啟用 Google provider。
2. 將 Google Web OAuth redirect URI 設為 `https://<project-ref>.supabase.co/auth/v1/callback`。
3. 將 Supabase Site URL 設為正式 Vercel origin 的完整網址。
4. 在 Supabase Redirect URLs 加入 `http://localhost:3000/auth/callback` 與正式環境完整的 `/auth/callback` 網址。
5. Google client ID 與 client secret 僅設定在 Supabase，絕不可將 secret 加入 Vercel。
6. 在本機 `.env.local` 與 Vercel Production 設定公開的 Supabase URL 與 publishable key。

## 驗證

```bash
pnpm test
pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm build
rg -n "console\.(log|debug)|writeFile|createWriteStream|base64|data:image" src
```

Playwright 會啟動本機伺服器，攔截 `/api/photo-check`、`/api/auth/session`、分析與遙測 API 並回傳固定假資料；它使用 `tests/fixtures/outfit-safe.png`（64×64、無真人的色塊服裝圖），不需金鑰，也不會將測試照片上傳到外部服務。測試涵蓋登入／匿名登入閘門、自動照片檢查、重拍、回饋、錯誤重試、reload 清除狀態，以及 320／390／430px 版面。

若本機的預設 port 3000 已被其他開發伺服器使用，可改用 `PLAYWRIGHT_PORT=3100 pnpm test:e2e`。明確指定 `PLAYWRIGHT_PORT` 時，Playwright 會啟動對應 port 的新伺服器而不重用既有程序，確保驗證的是目前 worktree。

## 安全與營運邊界

- 選取照片後會先自動上傳給 AI 供應商進行規格檢查；只有通過檢查並按下「開始分析」後，照片才會送出完整穿搭分析。檢查與完整分析都只在請求期間於記憶體處理照片，不寫入檔案、資料庫、遙測或日誌。
- 照片檢查、分析與追問 Route Handler 在讀取 body、解碼圖片或建立 AI client 前執行 same-origin、分 endpoint burst／sustained 與全域 concurrency guard。client signal 只會以 `RATE_LIMIT_SECRET` 做 HMAC，memory map 不保存 raw IP 或裝置 ID。
- 目前 limiter 是單一 Node instance 的 TTL memory limiter，**不適合多 instance production 當唯一防線**。公開上線前仍須設定平台層分散式 rate limit／quota、endpoint 成本上限與 cost alerts。
- 分析成功會簽發短期 stateless HMAC token；追問必須連同原分析驗證 token。分析與追問輸出都經 deterministic fail-closed safety validator。
- `/api/telemetry` 只接受嚴格 discriminated events；不接受照片、自由文字、AI 回覆、raw IP 或識別碼。production hosting/access log/error tracking 的實際欄位白名單仍需獨立確認。

## 安全驗收範圍

`tests/evals/safety.test.ts` 是可重複執行的靜態驗收：它檢查十個安全／影像品質案例都有明確輸出條件、系統提示含安全限制，並檢查重拍與完整分析的結構化契約。它不呼叫真實模型，**不能**證明模型公平性或實際遵循率。

提示或模型變更後，發布前仍須在獲核准的測試環境，以已同意且不含個人資料的測試圖進行真實模型抽查；依 `tests/evals/safety-cases.ts` 的案例逐筆確認，特別是相同服裝、不同外觀人物的成對結果。

目前未完成且不得宣稱通過：live-model 安全／公平評估、真機相機權限與完整流程、供應商 ZDR／Modified Abuse Monitoring／保留期限、production 分散式 rate limit 與成本告警，以及 production 日誌政策驗證。
