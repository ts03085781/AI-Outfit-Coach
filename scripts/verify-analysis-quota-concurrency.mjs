import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const output = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "env"], { encoding: "utf8" });
const local = Object.fromEntries(output.trim().split("\n").map((line) => { const [name, ...rawValue] = line.split("="); return [name, rawValue.join("=").replace(/^\"|\"$/g, "")]; }));
assert.ok(local.API_URL, "Supabase local API_URL is required");
assert.ok(local.SERVICE_ROLE_KEY, "Supabase local SERVICE_ROLE_KEY is required");
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const databaseContainer = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_daily-analysis-quota";

function databaseScalar(sql) {
  return execFileSync(
    "docker",
    ["exec", databaseContainer, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

async function waitForAdvisoryWaiters(expected) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const count = Number(databaseScalar("select count(*) from pg_stat_activity where wait_event = 'advisory'"));
    if (count >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${expected} advisory-lock waiters`);
}

function taiwanDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts();
  const value = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function createTestUser(label) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `quota-${label}-${randomUUID()}@example.test`,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("Test user was not created");
  return data.user;
}

const users = [];
try {
  const allocationUser = await createTestUser("allocation");
  users.push(allocationUser);
  const reservations = Array.from({ length: 4 }, () => randomUUID());
  const results = await Promise.all(reservations.map((reservationId) => admin.rpc("reserve_daily_analysis", {
    p_user_id: allocationUser.id,
    p_reservation_id: reservationId,
  })));
  const outcomes = results.map(({ data, error }) => {
    if (error) throw error;
    return data[0]?.outcome;
  });
  assert.equal(outcomes.filter((value) => value === "reserved").length, 3);
  assert.equal(outcomes.filter((value) => value === "slots_busy").length, 1);

  const transitionUser = await createTestUser("transition");
  users.push(transitionUser);
  const transitionReservation = randomUUID();
  const { data: reservationData, error: reservationError } = await admin.rpc("reserve_daily_analysis", {
    p_user_id: transitionUser.id,
    p_reservation_id: transitionReservation,
  });
  if (reservationError) throw reservationError;
  assert.equal(reservationData[0]?.outcome, "reserved");

  const lockKey = `${transitionUser.id}:${taiwanDate()}`;
  const blocker = spawn(
    "docker",
    ["exec", "-i", databaseContainer, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { stdio: ["pipe", "pipe", "inherit"] },
  );
  let blockerOutput = "";
  blocker.stdout.setEncoding("utf8");
  blocker.stdout.on("data", (chunk) => { blockerOutput += chunk; });
  blocker.stdin.write(`begin; select pg_advisory_xact_lock(hashtextextended('${lockKey}', 0)); select 'LOCKED';\n`);
  const lockDeadline = Date.now() + 5_000;
  while (!blockerOutput.includes("LOCKED") && Date.now() < lockDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.match(blockerOutput, /LOCKED/, "test transaction acquired the quota lock");

  const completion = Promise.resolve(admin.rpc("complete_daily_analysis", {
    p_user_id: transitionUser.id,
    p_reservation_id: transitionReservation,
  }));
  await waitForAdvisoryWaiters(1);
  const release = Promise.resolve(admin.rpc("release_daily_analysis", {
    p_user_id: transitionUser.id,
    p_reservation_id: transitionReservation,
  }));
  await waitForAdvisoryWaiters(2);
  blocker.stdin.end("commit;\n");

  const [{ data: completionData, error: completionError }, { data: releaseData, error: releaseError }] = await Promise.all([
    completion,
    release,
  ]);
  if (completionError) throw completionError;
  if (releaseError) throw releaseError;
  assert.equal(completionData[0]?.outcome, "completed");
  assert.equal(releaseData, "already_completed");
} finally {
  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }
}
