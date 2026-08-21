import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");

describe("Stitch design system", () => {
  it("defines the shared monochrome tokens and Chivo font", () => {
    expect(css).toContain("--color-canvas: #f9f9f9");
    expect(css).toContain("--color-ink: #000000");
    expect(css).toContain("--radius-control: 8px");
    expect(css).toContain("--content-max: 1200px");
    expect(layout).toContain('import { Chivo } from "next/font/google"');
    expect(layout).toContain("chivo.variable");
  });

  it("does not retain legacy brand colors or Georgia", () => {
    for (const legacy of ["#176b87", "#f4dfbf", "#3d2d1c", "Georgia"]) {
      expect(css.toLowerCase()).not.toContain(legacy.toLowerCase());
    }
  });

  it("keeps narrow analyze pages clear of the safe-area navigation", () => {
    expect(css).toContain(
      ".flow-shell { padding: 12px 10px calc(100px + env(safe-area-inset-bottom)); }",
    );
  });
});
