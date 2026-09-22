import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

// Public tunnel target for sandbox acceptance only. It cannot forward login,
// subscription APIs, assets, arbitrary paths, cookies or authorization headers.
export function createCallbackProxy({ target = "http://127.0.0.1:3040", fetcher = fetch } = {}) {
  const origin = new URL(target);
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || origin.pathname !== "/" || origin.username || origin.password || origin.search || origin.hash) {
    throw new Error("Proxy target must be a loopback HTTP origin");
  }
  return createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if ((request.method === "POST" && request.url === "/api/ecpay/return") || (request.method === "GET" && request.url === "/settings")) {
      response.writeHead(303, { Location: `${origin.origin}/settings?payment=returned` });
      response.end();
      return;
    }
    if (request.method !== "POST" || !["/api/ecpay/payment", "/api/ecpay/period"].includes(request.url)) {
      response.writeHead(404); response.end(); return;
    }
    if (request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") {
      response.writeHead(415); response.end(); return;
    }
    let length = 0;
    const chunks = [];
    try {
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 32768) { response.writeHead(413); response.end(); return; }
        chunks.push(chunk);
      }
      const upstream = await fetcher(`${origin.origin}${request.url}`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: Buffer.concat(chunks), redirect: "error", signal: AbortSignal.timeout(15000),
      });
      const body = await upstream.text();
      // Only the acknowledgement leaves the machine; no upstream errors or pages.
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(upstream.ok && body === "1|OK" ? "1|OK" : "0|ERROR");
    } catch { response.writeHead(200); response.end("0|ERROR"); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createCallbackProxy().listen(3041, "127.0.0.1", () => console.log("Sandbox callback-only proxy listening on 127.0.0.1:3041"));
}
