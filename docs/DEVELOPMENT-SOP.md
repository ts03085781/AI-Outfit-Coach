# AI Outfit Coach 開發 SOP

## 1. 每次開始工作

1. 閱讀 `docs/superpowers/specs/2026-08-07-ai-outfit-coach-design.md`。
2. 確認目前執行計畫與 Task 範圍。
3. 執行 `git status --short`，不得覆蓋不相關修改。
4. 執行現有測試，確認基準狀態。
5. 使用 Node 24 與 pnpm 11.9.0；若系統有多個 Node，先以 `node --version` 確認為 `v24.x`。

## 2. 實作循環

1. 一次只處理一個 Task。
2. 先寫能描述需求的失敗測試。
3. 執行測試，確認失敗原因正確。
4. 實作讓測試通過的最小變更。
5. 執行單元測試、型別檢查與 lint。
6. 檢查 diff，不提交照片、金鑰、`.env*` 或個人資料。
7. 以單一目的提交 Git commit。

## 3. AI 與隱私規則

- `OPENAI_API_KEY` 只放在伺服器環境變數；不得寫入原始碼或提交。
- 照片只存在瀏覽器與單次 API 請求記憶體。
- 不記錄照片、data URL、自由文字、完整 AI 回覆或追問。
- 模型或供應商更換前，重新核對訓練使用、人工審查與保存期限。
- `store: false` 只停用 Responses application-state 保存；部署前仍須確認供應商的 abuse-monitoring 保存是否符合核准的 ZDR／Modified Abuse Monitoring 設定。程式碼本身不能保證供應商端零保存。
- 公開隱私文字必須符合供應商實際政策，不宣稱無法證明的「立即刪除」。
- `ANALYSIS_TOKEN_SECRET` 只用於短期 stateless analysis token；`RATE_LIMIT_SECRET` 只用於 HMAC client signal。兩者不得共用、記錄或傳到前端。
- 分析與追問輸出都必須通過 deterministic fail-closed safety validator；不得因 JSON Schema 已通過就略過安全檢查。
- consent 必須揭露供應商可能依 abuse-monitoring 政策短期保留，且實際期限上線前仍待確認；不得暗示已驗證 ZDR。

## 4. 測試門檻

每個 Task：

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

發布前另執行：

```bash
pnpm test:e2e
rg -n "console\.(log|debug)|writeFile|createWriteStream|base64|data:image" src
```

E2E 必須使用 route interception 的固定回應；fixture 僅可用無真人、無個人資料的圖片。測試不得需要金鑰，也不得讓測試照片離開本機測試流程。

隱私掃描只允許 OpenAI adapter 在單次請求記憶體中建立 data URL；若出現其他結果，停止發布並先確認沒有請求／結果記錄或檔案寫入。

並以 320、390、430px 寬度及至少一台真機驗證相機流程。

mock-only Playwright 的 320／390／430px 檢查是瀏覽器自動化證據，不取代真機相機、權限拒絕／允許與 gallery 行為。

## 5. AI 品質抽查

每次提示或模型變更，都要重新跑安全案例：外貌評分、敏感特徵推測、羞辱、極端節食、購物壓力、低光、遮擋、多人與非穿搭照。任何敏感推測或羞辱輸出都阻擋發布。

`tests/evals/safety.test.ts` 只驗證靜態提示與結構化契約，不呼叫真實模型，因此不得宣稱它已驗證模型公平性。模型或提示變更的發布前抽查必須在獲核准的測試環境執行，使用已同意、無個資的測試圖片；相同服裝而外觀不同的成對案例，建議不得有與衣物無關的差異。

## 6. 發布檢查

1. 所有品質指令通過。
2. 確認部署環境已設定金鑰與模型名稱。
3. 確認日誌與錯誤追蹤採欄位白名單。
4. 確認圖片大小、速率限制與 30 秒逾時生效。
5. 真機完成：選情境、拍照、同意、分析、重拍、追問、回饋。
6. 核對隱私告知與實際供應商保存政策一致。
7. 真機逐一確認相機權限拒絕與允許、重新拍照、離開／重新整理後無法復原照片與結果，以及 320／390／430px 版面。
8. 確認平台層分散式 rate limit／quota、endpoint 成本上限與 cost alerts 已啟用；application memory limiter 不能作為多 instance production 的唯一防線。
9. 確認 production access log、error tracking 與 analytics 均不保留 request body、內容、raw IP 或持久識別碼。

### Application abuse guard 基準

- `/api/analyze`：burst 3 次／10 秒、sustained 20 次／10 分鐘。
- `/api/follow-up`：burst 6 次／10 秒、sustained 60 次／10 分鐘。
- 兩 endpoint 共用全域 6 個 active requests concurrency 上限。
- 超限回 `429` 與 `Retry-After`；cross-site browser request 在 body buffering 與 provider client 前拒絕。
- key 只保存 HMAC digest 與短期 counter；不得寫入 raw IP、device ID、照片或內容。

以上數字是單 instance 的應用層防濫用基準，不是 production 分散式容量保證。上線前依部署拓撲、預算與實際流量設定平台規則與成本告警。

## 7. 發生問題時

- 測試失敗：保留失敗輸出，先找根因再修改。
- AI 格式錯誤：保留錯誤分類，不記錄原始內容；只自動重試一次。
- 隱私疑慮：立即停止發布，確認是否有資料殘留，再修復與補回歸測試。
- 供應商故障：回傳中性可重試訊息，不保留使用者照片。
