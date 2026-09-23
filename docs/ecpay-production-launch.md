# 綠界正式上線檢查

## 本次驗證與目前狀態（2026-09-22）

- 使用者已確認綠界 stage 手動付款與取消測試通過。收尾時再次直接查詢綠界：成功扣款 1 次，`ExecStatus=0`，已停止續扣。
- 本次 `localhost.run` 通道、3040 測試站與 3041 回呼代理已關閉；暫存環境憑證檔已移除。本機測試交易紀錄保留供核對。
- 正式 API 端點已重新核對官方規格：`https://payment.ecpay.com.tw`，路徑與 stage 相同。
- 唯讀部署檢查：Vercel 正式版本為 `b1de7e1`（`master`），正式 Supabase 尚無 `ecpay_orders` 與 `ecpay_payment_events`。
- 公開端點檢查：正式站三個 `/api/ecpay/*` 路徑目前均回傳 HTTP 404，需部署新版本後重跑 `--public` 檢查。
- 本次沒有推送、部署、更新正式資料庫、設定正式憑證或進行真實扣款。
- 本機驗證：616 項單元／元件測試通過；2 項真實本機資料庫 REST 整合測試（stage/production，綠界使用 fixture）通過；164 項資料庫 assertions 通過；3 項部署檢查與 3 項回呼代理測試通過；44 項瀏覽器測試通過；typecheck、lint、build 通過。

## 2026-09-23 正式資料庫更新

使用者已確認定期定額開通，並已在 Vercel 設定正式憑證。兩份 migration 已透過 Supabase migration API 套用至正式 project `slvinuyhidfzihercold`；本機檔名同步為遠端實際 migration 版本，避免後續重複套用。套用前正式 ECPay 訂閱數為 0。已確認六個 ECPay RPC 僅 service_role 可執行，anon/authenticated 無執行權限。

## 1. 商店資格與環境變數

在綠界確認正式特店已核准「信用卡定期定額」。API 格式測試不能代替商店資格確認。

在 Vercel 的 **Production** 環境設定以下項目；HashKey、HashIV、Supabase secret、CRON_SECRET 不得設成 NEXT_PUBLIC，也不要貼在聊天或提交至 Git。

```dotenv
ECPAY_ENABLED=false
ECPAY_ENV=production
ECPAY_MERCHANT_ID=<正式特店編號>
ECPAY_HASH_KEY=<正式 HashKey>
ECPAY_HASH_IV=<正式 HashIV>
ECPAY_PUBLIC_BASE_URL=https://stylecue.website
SUBSCRIPTION_MOCK_ENABLED=false
CRON_SECRET=<至少 32 字元隨機密鑰>
```

保留正確的正式 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 與 `SUPABASE_SECRET_KEY`。Preview 不得使用正式金流憑證。程式拒絕 production 搭配公開測試帳號/金鑰，及在 Vercel preview 啟用 production。

## 2. 資料庫遷移

先確認正式資料庫備份／可還原點。依序套用：

1. `supabase/migrations/20260923044349_ecpay_subscriptions.sql`
2. `supabase/migrations/20260923044404_ecpay_production_environment.sql`

使用 Supabase 部署流程先檢查 migration 差異與目標 project ref；不要執行 `db reset`，也不要把本機測試資料搬到正式站。原本已部署的訂閱 migration 不需重複套用。第二份 migration 保留既有資料，更新 RPC 簽名並加入環境隔離與唯讀 readiness 函式。

本機迭代使用直接 SQL，**本機 migration history 未代表正式已部署狀態**。正式是否套用應以正式 migration history 為準。若正式已有無 environment 的歷史 ECPay 記錄，先核對來源，不能直接將未知記錄標為 production。

## 3. 部署與不扣款檢查

完成 commit、合併至 `master`、push 後，確認 Vercel 實際部署該 commit。此時保持 `ECPAY_ENABLED=false`。

在具有正式伺服器環境變數的受信任環境執行：

```sh
pnpm check:ecpay
pnpm check:ecpay --public
```

指令不自動讀取 `.env.local`。需要環境檔時可在 Node 24 使用以下方式，檔案應位於 Git 以外並限制權限，完成後刪除：

```sh
node --env-file=/absolute/private/path/production.env scripts/check-ecpay-deployment.mjs --public
```

檢查包含正式設定、DB schema v2、私有資料表、異環境／未知環境資料、既有訂單特店編號、每日批次容量及公開回呼路徑。只輸出檢查結果，不輸出金鑰；對外測試只送偽造回呼（應得到 `0|ERROR`），不會建立、扣款或取消任何訂單。這不保證檢查環境與 Vercel 實際環境完全一致，也不驗證正式憑證是否已獲綠界授權。

公開路徑必須不被登入保護、防火牆或重新導向攔截：

- POST `/api/ecpay/payment`
- POST `/api/ecpay/period`
- POST `/api/ecpay/return`（303 返回同一正式網域的設定頁）

## 4. 對帳排程與營運容量

`vercel.json` 每天 22:15 UTC 執行 `/api/cron/subscriptions`，每次最多 20 筆（包含最近終止的訂單）。啟用前確認 Vercel Cron 設定、`CRON_SECRET` 與執行紀錄；只看到 route 存在不代表排程已執行。

若每日待查筆數會超過 20，須先設定方案允許的較高執行頻率或擴充批次／排程，避免遺漏通知的訂單長時間等待。綠界每期回呼只有一次，不能只靠 webhook。監控 cron 的 HTTP 503、`failed` 計數及待處理量；超過一個排程週期仍未核對的訂單應調查。

## 5. 啟用與正式驗收

全部檢查通過，並確認價格、自動續扣與取消條款後，將 `ECPAY_ENABLED=true` 並重新部署。經明確授權，以真實卡做 NT$60 訂閱驗收（會實際扣款）：

1. 未收到驗證付款時保持 pending；確認付款後才授權。
2. 原始回呼與對帳查詢都能更新，同一授權不得重複延長。
3. 取消後綠界 `ExecStatus=0`，原本到期日不變，不自動退款。
4. 驗證排程實際有執行，之後觀察第一期真實月扣；短時間測試不代表已驗證下個月的扣款。

## 6. 異常處置

`ECPAY_ENABLED=false` 可暫停應用程式金流功能，但 **不會停止綠界既有定期扣款**，也會停用自助取消與對帳。已有正式訂閱時不能把關閉開關當作取消；必須保留可運作的取消管道，或透過綠界商家後台處理並核對。不要回滾到只支援 stage 的舊程式，也不要刪除帳務資料表。優先修正部署並保留付款紀錄與已付費權益。

官方規格：[建單](https://developers.ecpay.com.tw/2868.md)、[查詢](https://developers.ecpay.com.tw/2892.md)、[取消](https://developers.ecpay.com.tw/2900.md)。
