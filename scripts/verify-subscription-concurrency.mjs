import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

// Use only this repository's local Docker database. No remote URLs or credentials.
const projectId = readFileSync("supabase/config.toml", "utf8").match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m)?.[1];
assert.ok(projectId, "Local Supabase project ID is required");
const run = promisify(execFile);
async function sql(statement) {
  const { stdout } = await run("docker", ["exec", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atc", statement], { timeout: 60000 });
  return stdout.trim();
}
const id = randomUUID();
async function rpc(name) {
  assert.ok(["activate_mock_subscription", "cancel_mock_subscription", "get_subscription"].includes(name));
  return JSON.parse(await sql(`select row_to_json(s) from public.${name}('${id}'::uuid) s;`));
}
try {
  await sql(`insert into auth.users(id) values ('${id}'::uuid);`);
  const activated = await Promise.all(Array.from({ length: 12 }, () => rpc("activate_mock_subscription")));
  assert.equal(new Set(activated.map((row) => row.id)).size, 1);
  assert.equal(new Set(activated.map((row) => row.current_period_end)).size, 1);
  const end = activated[0].current_period_end;
  await Promise.all(Array.from({ length: 12 }, (_, index) => rpc(index % 2 ? "cancel_mock_subscription" : "activate_mock_subscription")));
  const final = await rpc("get_subscription");
  assert.equal(final.cancel_at_period_end, true);
  assert.equal(final.current_period_end, end);
  assert.equal(final.status, "active");
  const canceled = await Promise.all(Array.from({ length: 6 }, () => rpc("cancel_mock_subscription")));
  assert.ok(canceled.every((row) => row.cancel_requested_at === final.cancel_requested_at));
  console.log("Subscription concurrent activation/cancellation checks passed");
} finally {
  await sql(`delete from auth.users where id = '${id}'::uuid;`);
}
