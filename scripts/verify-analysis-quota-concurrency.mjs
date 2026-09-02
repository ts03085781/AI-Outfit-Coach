import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const output = execFileSync("pnpm", ["dlx", "supabase@2.102.0", "--workdir", ".", "status", "-o", "env"], { encoding: "utf8" });
const local = Object.fromEntries(output.trim().split("\n").map((line) => { const [name, ...rawValue] = line.split("="); return [name, rawValue.join("=").replace(/^\"|\"$/g, "")]; }));
assert.ok(local.API_URL, "Supabase local API_URL is required");
assert.ok(local.SERVICE_ROLE_KEY, "Supabase local SERVICE_ROLE_KEY is required");
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: created, error: createError } = await admin.auth.admin.createUser({ email: `quota-concurrency-${randomUUID()}@example.test`, email_confirm: true });
if (createError || !created.user) throw createError ?? new Error("Test user was not created");
try { const reservations = Array.from({ length: 4 }, () => randomUUID()); const results = await Promise.all(reservations.map((reservationId) => admin.rpc("reserve_daily_analysis", { p_user_id: created.user.id, p_reservation_id: reservationId }))); const outcomes = results.map(({ data, error }) => { if (error) throw error; return data[0]?.outcome; }); assert.equal(outcomes.filter((value) => value === "reserved").length, 3); assert.equal(outcomes.filter((value) => value === "slots_busy").length, 1); } finally { const { error } = await admin.auth.admin.deleteUser(created.user.id); if (error) throw error; }
