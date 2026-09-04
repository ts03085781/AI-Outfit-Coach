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

在 `.env.local` 設定僅供伺服器使用的 `OPENAI_API_KEY`、`OPENAI_PHOTO_CHECK_MODEL`、`OPENAI_VISION_MODEL`、`OPENAI_TRENDS_MODEL`、`OPENAI_IMAGE_MODEL`、`RATE_LIMIT_SECRET`、`ANALYSIS_TOKEN_SECRET`、`CRON_SECRET` 與 `SUPABASE_SECRET_KEY`，以及公開的 `NEXT_PUBLIC_SUPABASE_URL` 與 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。`OPENAI_PHOTO_CHECK_MODEL` 預設為 `gpt-5-nano`，供選取照片後的快速規格檢查使用；`OPENAI_VISION_MODEL` 則用於完整穿搭分析。Secret 應各自使用至少 32 bytes 的隨機值。`SUPABASE_SECRET_KEY` 必須設定在本機與 Vercel Preview／Production 的伺服器環境，絕不可改用 `NEXT_PUBLIC_` 名稱、寫入前端 bundle 或出現在 build log。不要提交 `.env.local`，也不要把任何金鑰放在前端程式碼。

## 每日免費分析額度

登入使用者每日可取得 3 次成功穿搭分析，日期邊界固定為 IANA 時區 `Asia/Taipei` 的 00:00。資料庫以台灣日期分列紀錄，因此午夜不需要 cron 或批次重置。只有通過輸出結構與安全檢查、可交付給使用者的完整分析才消耗一次；照片規格不符、重拍、逾時、供應商或驗證失敗都不扣次數。

分析開始前會保留一個最長 2 分鐘的額度 reservation。請求終止時 reservation 會到期並自動恢復可用額度。Supabase 只保存使用者 ID、台灣日期、reservation 狀態與時間欄位，不保存照片、prompt、分析內容或分析歷史。若額度服務無法確認狀態，分析會 fail-closed 並在呼叫 OpenAI 前停止。

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

### 本機 Supabase 額度資料庫

Supabase CLI 固定為專案 `devDependencies` 中的 `2.116.0`；一律透過 `pnpm exec` 或下列 package scripts 執行，不使用全域版本。Docker 執行中後可用：

```bash
pnpm install --frozen-lockfile
pnpm supabase:start
pnpm supabase:reset
pnpm test:db
pnpm test:db:concurrency
pnpm test:db:retention
pnpm exec supabase db advisors --local --level error --fail-on error
pnpm exec supabase migration list --local
```

本機服務使用 `supabase/config.toml` 的 5532x port，避免干擾其他專案。若 pinned CLI 在特定機器遇到 profile 存取問題，先保存錯誤輸出並依 `docs/DEVELOPMENT-SOP.md` 的 fallback 驗證，不要停止或刪除其他專案的 Supabase containers。

每日配額清理由 Supabase Cron 在台灣 00:10 執行，每次最多 10,000 筆，保留最近 3 個台灣日曆日與仍有效的 reservation。清理不參與配額換日。詳見[保留規則、容量限制、查核與停用](docs/daily-analysis-retention.md)。`test:db:retention` 只允許本專案本機容器且要求配額表為空；它會建立暫時的每秒 Cron 測試工作並於結束時移除。

正式發布必須先把 `supabase/migrations/` 套用至目標 Supabase 專案，再部署相依的應用程式碼；不得反向部署。Preview 與 Production 均需分別設定 server-only `SUPABASE_SECRET_KEY`。

## 驗證

```bash
pnpm test
pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm build
rg -n "console\.(log|debug)|writeFile|createWriteStream|base64|data:image" src
```

Playwright 會啟動本機伺服器，攔截 `/api/photo-check`、`/api/auth/session`、`/api/analysis-quota`、分析與遙測 API 並回傳固定假資料；它使用 `tests/fixtures/outfit-safe.png`（64×64、無真人的色塊服裝圖），不需金鑰，也不會將測試照片上傳到外部服務。測試涵蓋登入／匿名登入閘門、額度已滿進頁、第三次成功後再分析、自動照片檢查、重拍、回饋、錯誤重試、reload 清除狀態，以及 320／390／430px 版面。

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
