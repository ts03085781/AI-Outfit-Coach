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

const expectedMatchers = [
  "/api/auth/session",
  "/api/analyze",
  "/api/follow-up",
  "/api/auth/login-notification",
];
const actualMatchers = middleware.matchers?.map(({ originalSource }) => originalSource) ?? [];
const hasExpectedMatchers = actualMatchers.length === expectedMatchers.length
  && expectedMatchers.every((matcher) => actualMatchers.includes(matcher));

if (!hasExpectedMatchers) {
  throw new Error("Next.js did not load the expected middleware matcher configuration.");
}
