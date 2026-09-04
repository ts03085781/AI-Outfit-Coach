import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

// Deliberately no remote URL/container override: only this project's local stack.
const container = "supabase_db_daily-analysis-quota";
const args = ["exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
function sql(query) {
  return execFileSync("docker", args, { input: query, encoding: "utf8" }).trim();
}
async function until(check, message) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
async function lock(query) {
  const process = spawn("docker", args, { stdio: ["pipe", "pipe", "inherit"] });
  let output = "";
  process.stdout.on("data", (chunk) => { output += chunk; });
  const done = new Promise((resolve, reject) => {
    process.on("error", reject);
    process.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Lock session exited ${code}`)));
  });
  process.stdin.write(`begin; ${query}; select 'LOCKED';\n`);
  try {
    await until(() => output.includes("LOCKED"), "Could not acquire fixture lock");
  } catch (error) {
    process.stdin.end("rollback;\n");
    await done;
    throw error;
  }
  return async () => { process.stdin.end("rollback;\n"); await done; };
}

const userId = randomUUID();
const jobName = `outfit-retention-local-test-${randomUUID()}`;
let jobId;
let unlock;
const fixture = `insert into public.daily_analysis_usage(user_id, usage_date, status, expires_at, completed_at)
  select '${userId}', (now() at time zone 'Asia/Taipei')::date - 10, 'completed', now(), now()
  from generate_series(1, 10005);`;
const count = () => Number(sql(`select count(*) from public.daily_analysis_usage where user_id = '${userId}';`));
assert.equal(sql("select count(*) from public.daily_analysis_usage;"), "0",
  "Integration test requires an empty isolated local quota table");
try {
  sql(`insert into auth.users(id) values ('${userId}'); ${fixture}`);
  assert.equal(sql("select outfit_maintenance.cleanup_daily_analysis_usage();"), "10000");
  assert.equal(count(), 5, "first batch committed independently");
  sql("begin; select outfit_maintenance.cleanup_daily_analysis_usage(); rollback;");
  assert.equal(count(), 5, "rollback of later batch cannot undo prior committed batch");
  unlock = await lock(`select id from public.daily_analysis_usage where user_id = '${userId}' limit 1 for update`);
  assert.equal(sql("select outfit_maintenance.cleanup_daily_analysis_usage();"), "4", "locked row is skipped");
  await unlock(); unlock = undefined;
  assert.equal(sql("select outfit_maintenance.cleanup_daily_analysis_usage();"), "1", "next run retries skipped row");

  // A temporary local job executes the exact production command. Never alter another job.
  sql(fixture);
  unlock = await lock("lock table public.daily_analysis_usage in access exclusive mode");
  jobId = Number(sql(`select cron.schedule('${jobName}', '1 second', command)
    from cron.job where jobname = 'ai-outfit-coach-daily-usage-retention-v1';`));
  assert.ok(Number.isSafeInteger(jobId) && jobId > 0);
  await until(() => sql(`select count(*) from cron.job_run_details where jobid = ${jobId} and status = 'failed';`) !== "0",
    "Cron should record lock-timeout failure");
  sql(`select cron.alter_job(${jobId}, active := false);`);
  await until(() => sql(`select count(*) from cron.job_run_details where jobid = ${jobId} and status in ('running','starting');`) === "0",
    "Cron failed invocation should finish within lock timeout");
  await unlock(); unlock = undefined;
  assert.equal(count(), 10005, "failed Cron batch rolled back completely");
  assert.equal(sql(`select remaining_count from public.get_daily_analysis_quota('${userId}');`), "3",
    "failure does not prevent new-day quota");
  assert.match(sql(`select return_message from cron.job_run_details where jobid = ${jobId} and status = 'failed' limit 1;`),
    /lock timeout/, "configured two-second lock timeout is enforced by Cron");
  sql(`select cron.alter_job(${jobId}, active := true);`);
  await until(() => count() === 0, "Cron should drain backlog across independent invocations");
  sql(`select cron.alter_job(${jobId}, active := false);`);
  await until(() => sql(`select count(*) from cron.job_run_details where jobid = ${jobId} and status in ('running','starting');`) === "0",
    "Cron successful invocation should finish");
  assert.ok(Number(sql(`select count(*) from cron.job_run_details where jobid = ${jobId} and status = 'succeeded';`)) >= 2,
    "Cron records successful bounded batches");
  console.log("PASS: independent commits, rollback, locked-row retry, real Cron failure/history, quota after failure, backlog recovery");
} finally {
  if (jobId) sql(`select cron.unschedule(${jobId});`);
  if (unlock) await unlock();
  sql(`delete from auth.users where id = '${userId}';`);
  if (jobId) sql(`delete from cron.job_run_details where jobid = ${jobId};`);
}
