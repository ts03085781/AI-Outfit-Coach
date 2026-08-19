import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? "3000");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PLAYWRIGHT_PORT must be an integer between 1 and 65535");
}

const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: `pnpm exec next dev --port ${port}`,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://e2e-test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "e2e-test-public-key",
    },
    url: baseURL,
    reuseExistingServer: !process.env.CI && !process.env.PLAYWRIGHT_PORT,
  },
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
  },
});
