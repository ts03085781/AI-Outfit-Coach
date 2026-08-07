# AI Outfit Coach

免登入的手機 PWA：使用者選擇情境、提供一張穿搭照並同意後，取得固定格式的溫和穿搭建議。

## 安裝與啟動

本專案使用 Node 24 與 pnpm。

```bash
nvm use 24
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
cp .env.example .env.local
pnpm dev
```

在 `.env.local` 設定僅供伺服器使用的 `OPENAI_API_KEY` 與 `OPENAI_VISION_MODEL`。不要提交 `.env.local`，也不要把金鑰放在前端程式碼。

## 驗證

```bash
pnpm test
pnpm test:e2e
pnpm typecheck
pnpm lint
rg -n "console\.(log|debug)|writeFile|createWriteStream|base64|data:image" src
```

Playwright 會啟動本機伺服器，並攔截 `/api/analyze` 回傳固定假資料；它使用 `tests/fixtures/outfit-safe.png`（64×64、無真人的色塊服裝圖），不需金鑰，也不會把測試照片送到外部服務。

## 安全驗收範圍

`tests/evals/safety.test.ts` 是可重複執行的靜態驗收：它檢查十個安全／影像品質案例都有明確輸出條件、系統提示含安全限制，並檢查重拍與完整分析的結構化契約。它不呼叫真實模型，**不能**證明模型公平性或實際遵循率。

提示或模型變更後，發布前仍須在獲核准的測試環境，以已同意且不含個人資料的測試圖進行真實模型抽查；依 `tests/evals/safety-cases.ts` 的案例逐筆確認，特別是相同服裝、不同外觀人物的成對結果。
