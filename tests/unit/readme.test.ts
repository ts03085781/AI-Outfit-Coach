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

  it("documents the automatic photo precheck and its isolated browser-test mock", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("OPENAI_PHOTO_CHECK_MODEL");
    expect(readme).toContain("選取照片後會先自動上傳給 AI 供應商進行規格檢查");
    expect(readme).toContain("攔截 `/api/photo-check`");
    expect(readme).toContain("不會將測試照片上傳到外部服務");
  });
});
