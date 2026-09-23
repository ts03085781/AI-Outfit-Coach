import { pathToFileURL } from "node:url";

// This check never submits an order, cancels a subscription or prints credential values.
export async function checkDeployment(env, fetcher = fetch, publicCheck = false) {
  const checks = [];
  const check = (name, pass) => checks.push({ name, pass: !!pass });
  check("Production mode selected", env.ECPAY_ENV === "production");
  check("Mock billing disabled", env.SUBSCRIPTION_MOCK_ENABLED !== "true");
  check("Merchant ID is not a public test account", /^\d{1,10}$/.test(env.ECPAY_MERCHANT_ID ?? "") && !["3002607", "2000132", "3002599", "3003008"].includes(env.ECPAY_MERCHANT_ID));
  check("Hash credentials configured with non-test values", env.ECPAY_HASH_KEY?.length === 16 && env.ECPAY_HASH_IV?.length === 16 && env.ECPAY_HASH_KEY !== "pwFHCqoQZGmho4w6" && env.ECPAY_HASH_IV !== "EkRm7iFT261dpevs");
  check("Production callback origin configured", env.ECPAY_PUBLIC_BASE_URL?.replace(/\/$/, "") === "https://stylecue.website");
  check("Reconciliation secret configured", (env.CRON_SECRET?.length ?? 0) >= 32);
  check("Production deployment scope", !env.VERCEL_ENV || env.VERCEL_ENV === "production");
  let db;
  try { db = new URL(env.NEXT_PUBLIC_SUPABASE_URL); } catch { /* Report below. */ }
  const validDb = db?.protocol === "https:" && !db.username && !db.password && db.pathname === "/" && !db.search && !db.hash;
  check("HTTPS Supabase configuration present", validDb && !!env.SUPABASE_SECRET_KEY && !!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (validDb && env.SUPABASE_SECRET_KEY) {
    try {
      const r = await fetcher(`${db.origin}/rest/v1/rpc/ecpay_deployment_readiness`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000), headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_environment: "production", p_merchant_id: env.ECPAY_MERCHANT_ID }) });
      const d = r.ok ? await r.json() : null;
      check("Production schema v2 and private tables", d?.schema_version === 2 && d.private_tables === true);
      check("Existing orders match configured merchant", d?.mismatched_merchant_orders === 0);
      check("No sandbox or unscoped billing data", d?.foreign_environment_orders === 0 && d?.unscoped_subscriptions === 0);
      check("Reconciliation backlog within daily batch capacity", typeof d?.due_orders === "number" && d.due_orders <= 20);
    } catch { check("Database readiness query reachable", false); }
  }
  if (publicCheck) {
    for (const path of ["/api/ecpay/payment", "/api/ecpay/period"]) {
      try {
        const r = await fetcher(`https://stylecue.website${path}`, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "MerchantID=invalid" });
        check(`Public ${path} rejects invalid callbacks`, r.status === 200 && await r.text() === "0|ERROR");
      } catch { check(`Public ${path} reachable`, false); }
    }
    try {
      const r = await fetcher("https://stylecue.website/api/ecpay/return", { method: "POST", redirect: "manual", signal: AbortSignal.timeout(15000) });
      check("Browser return redirect", r.status === 303 && new URL(r.headers.get("location"), "https://stylecue.website").href === "https://stylecue.website/settings?payment=returned");
    } catch { check("Browser return reachable", false); }
  }
  return checks;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const checks = await checkDeployment(process.env, fetch, process.argv.includes("--public"));
  for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}`);
  console.log("No gateway transaction performed. Merchant recurring-billing approval, deployed env values and scheduler operation require separate verification.");
  process.exitCode = checks.every(c => c.pass) ? 0 : 1;
}
