# AI Outfit Coach

免登入的手機 PWA：使用者選擇情境、提供一張穿搭照並同意後，取得固定格式的溫和穿搭建議。

## 安裝與啟動

本專案固定使用 Node 24 與 pnpm 11.9.0（`package.json` 已宣告）。

```bash
nvm use 24
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
cp .env.example .env.local
pnpm dev
```

在 `.env.local` 設定僅供伺服器使用的 `OPENAI_API_KEY`、`OPENAI_PHOTO_CHECK_MODEL`、`OPENAI_VISION_MODEL`、`RATE_LIMIT_SECRET` 與 `ANALYSIS_TOKEN_SECRET`。`OPENAI_PHOTO_CHECK_MODEL` 預設為 `gpt-5-nano`，供選取照片後的快速規格檢查使用；`OPENAI_VISION_MODEL` 則用於完整穿搭分析。兩個 secret 應各自使用至少 32 bytes 的隨機值。不要提交 `.env.local`，也不要把任何金鑰放在前端程式碼。

## 驗證

```bash
pnpm test
pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm build
rg -n "console\.(log|debug)|writeFile|createWriteStream|base64|data:image" src
```

Playwright 會啟動本機伺服器，攔截 `/api/photo-check`、分析、追問與遙測 API 並回傳固定假資料；它使用 `tests/fixtures/outfit-safe.png`（64×64、無真人的色塊服裝圖），不需金鑰，也不會將測試照片上傳到外部服務。測試涵蓋自動照片檢查、重拍、一次追問、回饋、錯誤重試、reload 清除狀態，以及 320／390／430px 版面。

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
