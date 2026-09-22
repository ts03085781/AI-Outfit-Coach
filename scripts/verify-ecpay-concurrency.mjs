import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

// Only the repository's local Docker database; never remote credentials or URLs.
const projectId = readFileSync("supabase/config.toml", "utf8").match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m)?.[1];
assert.ok(projectId);
const run = promisify(execFile);
async function sql(statement) {
  const { stdout } = await run("docker", ["exec", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atc", statement], { timeout: 30000 });
  return stdout.trim();
}
const userId = randomUUID();
const prefix = randomUUID().replaceAll("-", "").slice(0, 15);
const events = JSON.stringify([{ key: "1001", success: true, amount: 60, occurred_at: "2026-09-22T01:00:00Z", period_end: "2026-10-22T01:00:00Z", rtn_code: "1" }]);
try {
  await sql(`insert into auth.users(id) values ('${userId}');`);
  const rows = await Promise.all(Array.from({ length: 12 }, (_, i) => sql(`select merchant_trade_no from public.begin_ecpay_checkout('${userId}','${prefix}${i}','3002607');`)));
  assert.equal(new Set(rows).size, 1, "Concurrent checkout must reuse one pending order");
  const tradeNo = rows[0];
  await Promise.all(Array.from({ length: 12 }, () => sql(`select public.apply_ecpay_snapshot('${tradeNo}','3002607','1','${events}'::jsonb);`)));
  assert.equal(await sql(`select count(*) from public.ecpay_payment_events where merchant_trade_no='${tradeNo}';`), "1");
  await Promise.all(Array.from({ length: 12 }, (_, i) => sql(i % 2
    ? `select public.confirm_ecpay_cancellation('${tradeNo}','3002607');`
    : `select public.apply_ecpay_snapshot('${tradeNo}','3002607','1','${events}'::jsonb);`)));
  const final = JSON.parse(await sql(`select row_to_json(s) from public.get_subscription('${userId}') s;`));
  assert.equal(final.cancel_at_period_end, true);
  assert.equal(new Date(final.current_period_end).toISOString(), "2026-10-22T01:00:00.000Z");
  assert.equal(await sql(`select status from public.ecpay_orders where merchant_trade_no='${tradeNo}';`), "terminated");
  console.log("ECPay concurrent checkout, callback and cancellation checks passed");
} finally {
  await sql(`delete from public.ecpay_payment_events where merchant_trade_no in (select merchant_trade_no from public.ecpay_orders where user_id='${userId}'); delete from public.ecpay_orders where user_id='${userId}'; delete from auth.users where id='${userId}';`);
}
