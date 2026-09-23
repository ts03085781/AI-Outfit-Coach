import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDeployment } from "../../scripts/check-ecpay-deployment.mjs";
const env = { ECPAY_ENV: "production", ECPAY_MERCHANT_ID: "9999999", ECPAY_HASH_KEY: "K".repeat(16), ECPAY_HASH_IV: "I".repeat(16), ECPAY_PUBLIC_BASE_URL: "https://stylecue.website", CRON_SECRET: "C".repeat(32), NEXT_PUBLIC_SUPABASE_URL: "https://database.example.com", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public", SUPABASE_SECRET_KEY: "test-only-secret" };
test("readiness never sends credentials to the public site or calls a gateway", async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.startsWith("https://database.example.com")) return Response.json({ schema_version: 2, mismatched_merchant_orders: 0, private_tables: true, foreign_environment_orders: 0, unscoped_subscriptions: 0, due_orders: 0 });
    assert.equal(options.headers?.Authorization, undefined);
    if (url.endsWith("/return")) return new Response(null, { status: 303, headers: { location: "/settings?payment=returned" } });
    assert.equal(options.body, "MerchantID=invalid");
    return new Response("0|ERROR");
  };
  const result = await checkDeployment(env, fetcher, true);
  assert.ok(result.every(c => c.pass));
  assert.equal(calls.length, 4);
  assert.ok(!JSON.stringify(result).includes(env.SUPABASE_SECRET_KEY));
});
test("missing migration, foreign data, credentials and protected callbacks fail closed", async () => {
  const fetcher = async url => url.startsWith("https://database.example.com") ? Response.json({ schema_version: 1, mismatched_merchant_orders: 1, private_tables: false, foreign_environment_orders: 1, unscoped_subscriptions: 1, due_orders: 21 }) : new Response("login", { status: 302 });
  const result = await checkDeployment({ ...env, ECPAY_MERCHANT_ID: "3002607", VERCEL_ENV: "preview" }, fetcher, true);
  assert.ok(result.filter(c => !c.pass).length >= 8);
});

test("a changed merchant blocks rollout even with a valid production schema", async () => {
  const result = await checkDeployment(env, async () => Response.json({schema_version:2, private_tables:true, foreign_environment_orders:0, unscoped_subscriptions:0, due_orders:0, mismatched_merchant_orders:1}));
  assert.equal(result.find(c => c.name === "Existing orders match configured merchant").pass, false);
});
