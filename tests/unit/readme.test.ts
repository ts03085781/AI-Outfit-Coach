import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("README setup", () => {
  it("installs Playwright Chromium before presenting the E2E command", () => {
    const readme = readFileSync("README.md", "utf8");
    const dependencyInstall = readme.indexOf("pnpm install --frozen-lockfile");
    const browserInstall = readme.indexOf("pnpm exec playwright install chromium");
    const e2eRun = readme.indexOf("pnpm test:e2e");

    expect(dependencyInstall).toBeGreaterThanOrEqual(0);
    expect(browserInstall).toBeGreaterThan(dependencyInstall);
    expect(e2eRun).toBeGreaterThan(browserInstall);
  });
});
