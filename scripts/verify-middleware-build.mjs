import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const manifestPath = resolve(".next/server/middleware-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const middleware = manifest.middleware?.["/"];

if (!middleware) {
  throw new Error("Next.js did not discover the middleware entrypoint in src/middleware.ts.");
}

if (middleware.name !== "src/middleware" || !middleware.files?.includes("server/src/middleware.js")) {
  throw new Error("Next.js did not load the middleware from src/middleware.ts.");
}

const matcher = "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)";
if (!middleware.matchers?.some(({ originalSource }) => originalSource === matcher)) {
  throw new Error("Next.js did not load the expected middleware matcher configuration.");
}
