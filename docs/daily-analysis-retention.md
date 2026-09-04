# 每日配額紀錄保留與清理

本功能只清理 `public.daily_analysis_usage`。既有扣次、預留與 Asia/Taipei 自然換日邏輯不變；清理停用或失敗時，舊紀錄不會計入今天配額。

## 條件與容量

- `usage_date < (台灣今天 - 2)` 且為 `completed`，或為 `reserved` 且 `expires_at <= 本批開始時間`。
- 例如台灣 9/4 執行，保留 9/2、9/3、9/4；有效 reserved 即使日期更舊也保留。不是滾動 72 小時，也不依 `created_at` 清理。
- 每天台灣 00:10，Cron 使用 UTC/GMT `10 16 * * *`。不更改資料庫或其他排程的時區；migration 檢查 Cron 時區，不符合 UTC/GMT 就拒絕套用。
- job 名稱：`ai-outfit-coach-daily-usage-retention-v1`。同名已存在時拒絕套用，避免 `cron.schedule` 靜默覆寫既有工作。
- 每次只跑 **一批 10,000 筆**，依 `usage_date, id` 從舊到新。使用 `FOR UPDATE SKIP LOCKED` 跳過正在操作的紀錄，下次再處理。
- 每個 Cron invocation 是獨立交易，沒有批次迴圈。SQL command 在刪除前設 `statement_timeout = 30s`、`lock_timeout = 2s`，僅限該交易。失敗整批回滾，下一天重新嘗試；沒有部分提交。
- 無新增資料且無鎖定/逾時時，100,005 筆積欠需 11 次每日執行。若每天新增過期筆數為 D，容量餘裕約為 10,000 - D；D >= 10,000 時無法靠每日單批消化積欠。發布前應確認每日量與積欠量；持續滿批或積欠增加時，另行核准容量調整。不要以一個 DO/函式迴圈手動包住多批。
- 新增 `(usage_date, id)` 索引支援跨使用者的日期範圍掃描；原索引以 `user_id` 開頭，不能有效服務全表清理。
- 函式放在不暴露給 Data API 的 `outfit_maintenance` schema，使用 SECURITY INVOKER，撤銷 PUBLIC、anon、authenticated、service_role 的呼叫權限。沒有日期、表名或批量參數可由 API 傳入。只有資料庫管理者／Cron 執行角色可呼叫。

## 雲端套用前（本次開發不執行）

1. 確認目標專案、備份／恢復方案與既有 quota migration 已套用，檢查實際每日資料量及清理積欠。資料保留的既有刪除不可逆。
2. 核對 `pg_cron` 可用、執行角色為管理者、Cron 的 `cron.timezone` 為 GMT/UTC、`cron.log_run` 與 `cron.launch_active_jobs` 啟用。若不符，先由管理者處理；不要為本功能改動整個資料庫時區。
3. 確認沒有同名 job，且 `outfit_maintenance` 未列入 Data API exposed schemas。檢查其他 migration 與 schema 名稱是否衝突。
4. 建索引會暫時阻擋寫入；migration 設定 2 秒鎖等待及 30 秒 statement timeout。大表若超時，先安排維護窗口／另行設計 concurrent index migration，不要移除限制盲目重試。
5. 經發布授權後，先閱讀當前 CLI `supabase db push --help`，使用團隊既有發布流程核對 dry-run，再套用新 migration。不要修改已發布的 quota migration。

```sql
select name, setting from pg_settings
where name in ('cron.timezone', 'cron.log_run', 'cron.launch_active_jobs');
select name, default_version, installed_version from pg_available_extensions where name = 'pg_cron';
select jobid, jobname, schedule, active, username, database
from cron.job where jobname = 'ai-outfit-coach-daily-usage-retention-v1';
```

## 套用後確認與查核

確認上面 job 查詢恰有一筆，`schedule = '10 16 * * *'`、`active = true`，執行角色有函式權限。Supabase Dashboard → Integrations → Cron → 該 job → History 可查核結果。等下一個台灣 00:10，查詢：

```sql
select r.runid, r.status, r.start_time, r.end_time, r.return_message
from cron.job_run_details r
join cron.job j using (jobid)
where j.jobname = 'ai-outfit-coach-daily-usage-retention-v1'
order by r.start_time desc limit 30;

-- 只回傳聚合數字；先設定合理逾時，勿匯出使用者紀錄。
select count(*) as eligible_backlog
from public.daily_analysis_usage
where usage_date < (current_timestamp at time zone 'Asia/Taipei')::date - 2
  and (status = 'completed' or (status = 'reserved' and expires_at <= current_timestamp));
```

Cron history 記錄狀態、時間與 SQL command；`SELECT 1` 代表函式回傳一列，**不是刪除一筆**。函式回傳實際刪除數，但 pg_cron 不保存 SELECT 結果集；積欠查詢用於核對清理進度。command 為固定 SQL，無 user_id、照片或分析內容；不新增個資日誌。失敗／缺少預期執行紀錄時，查看 History 的錯誤與 Cron 設定。此 migration 不新增通知服務，也不清理其他 job 的歷史。

## 停用

由管理者執行，僅針對此 job：

```sql
select cron.alter_job(jobid, active := false)
from cron.job where jobname = 'ai-outfit-coach-daily-usage-retention-v1';
```

停用阻止後續排程，不會中止已開始的交易，**不會還原已刪除資料**。重新啟用用 `active := true`，仍由最舊資料逐批處理。不要停用整個 pg_cron extension 或更改其他 job。

## 本機驗證

使用專案固定 Node 24、pnpm 11.9.0、Supabase CLI 2.116.0。只操作 `daily-analysis-quota` 專用本機服務（5532x ports）。不要將測試連到正式資料庫。

```bash
pnpm exec supabase test db --local
pnpm test:db:retention
pnpm test:db:concurrency
pnpm exec supabase db advisors --local --level warn
pnpm exec supabase migration list --local
pnpm test
pnpm typecheck
pnpm lint
```

pgTAP 覆蓋台灣午夜、跨月／年／閏月、session timezone、三日保留、expired/live reservations、權限、空表、重跑與 10,005 筆分批。原配額 SQL 測試照常執行。獨立 script 額外驗證跨連線提交、後批回滾不影響前批、SKIP LOCKED，以及真實 Cron 2 秒鎖逾時、失敗歷史、成功歷史與積欠恢復。

script 要求本機配額表為空且不得與其他 DB tests 同時執行。測試只建立隨機測試帳號與暫時 job，最後移除；不修改每日 job 的時間。不使用 `--linked`。必要時 `supabase db reset --local --no-seed` 會刪除**本專案本機資料**，只能在確認可拋棄的隔離環境執行。

開發時 CLI `db query --local --file` 對多 statement SQL 回報 `cannot insert multiple commands into a prepared statement`；因此用同一本機容器的 `psql -v ON_ERROR_STOP=1` 迭代，最後以 CLI reset 重播 migrations 驗證。Migration 檔名由 `supabase migration new` 建立；Cron job 是資料設定，需保留明確的 `cron.schedule`，不能只靠 schema diff 匯出。

2026-09-04 本機驗證結果：

- 新測試在實作前因缺少 maintenance schema／函式而失敗；實作後 pgTAP 兩檔合計 **78 項通過**。
- `db reset --local --no-seed` 從頭套用兩份 migrations 成功；`migration list --local` 顯示兩版一致（CLI 輸出欄位雖稱 remote，此指令目標仍為本機）。
- `test:db:retention`、`test:db:concurrency` 通過；advisors `--local --level warn --fail-on warn` 無問題。
- `pnpm test`：44 檔、**544 項通過**；typecheck、lint、build 通過。Build 首次在沙箱內因 Google Fonts DNS 被限制失敗，允許網路後成功；沒有修改前端或執行 Playwright。
- 最後確認 Cron 為 GMT、log_run=on、每日 job 恰一筆且 active，測試帳號與 quota rows 均為 0；其他專案容器未被停止或重建。
- 尚未 push、合併、部署或操作雲端資料庫；雲端檢查與發布仍需另行授權。

## 官方依據

- [Supabase Cron](https://supabase.com/docs/guides/cron)：job 與 execution history，建議每次小於 10 分鐘。
- [Cron Quickstart](https://supabase.com/docs/guides/cron/quickstart)：GMT 排程、同名 job 覆寫、查核與停用。
- [pg_cron](https://github.com/citusdata/pg_cron)：`cron.timezone`、`cron.log_run`、`cron.alter_job`。
- [Cron table 更新限制](https://supabase.com/changelog/19298-directly-updating-rows-in-the-cron-job-table-is-no-longer-allowed)：透過函式管理 job，不直接更新 cron.job。
- [Extension 版本規則](https://supabase.com/changelog/extension-version-pinning-ignored)：不指定 extension version。
