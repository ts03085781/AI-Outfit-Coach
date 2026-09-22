import { test } from "node:test";
import assert from "node:assert/strict";
import { createCallbackProxy } from "../../scripts/ecpay-callback-proxy.mjs";

async function withProxy(run, fetcher = async () => new Response("1|OK")) {
  const server = createCallbackProxy({ fetcher });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
test("never forwards login, subscription, database, assets or arbitrary query paths", async () => {
  await withProxy(async origin => {
    for (const path of ["/login", "/api/auth/session", "/api/subscription", "/api/subscription/cancel", "/.env.local", "/api/ecpay/payment?path=/api/auth/session"]) {
      assert.equal((await fetch(`${origin}${path}`, { method: "POST" })).status, 404);
    }
  }, async () => { throw new Error("Private path was forwarded"); });
});
test("forwards only bounded callback bodies and never browser credentials", async () => {
  let forwarded;
  await withProxy(async origin => {
    const response = await fetch(`${origin}/api/ecpay/payment`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: "private-cookie", Authorization: "private-token" }, body: "MerchantID=3002607" });
    assert.equal(await response.text(), "1|OK");
    assert.equal(forwarded.url, "http://127.0.0.1:3040/api/ecpay/payment");
    assert.deepEqual(forwarded.options.headers, { "Content-Type": "application/x-www-form-urlencoded" });
    assert.equal(forwarded.options.body.toString(), "MerchantID=3002607");
    assert.equal((await fetch(`${origin}/api/ecpay/payment`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "a".repeat(32769) })).status, 413);
  }, async (url, options) => { forwarded = { url, options }; return new Response("1|OK"); });
});
test("never returns upstream pages or errors and only redirects return navigation to loopback", async () => {
  await withProxy(async origin => {
    assert.equal(await (await fetch(`${origin}/api/ecpay/period`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "x=1" })).text(), "0|ERROR");
    const response = await fetch(`${origin}/api/ecpay/return`, { method: "POST", redirect: "manual" });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "http://127.0.0.1:3040/settings?payment=returned");
  }, async () => new Response("internal credentials should never leave", { status: 500 }));
});
