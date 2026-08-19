import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/redirect";

describe("safeNextPath", () => {
  it.each(["/analyze", "/settings", "/analyze?login=success"])(
    "keeps safe same-origin path %s",
    (path) => expect(safeNextPath(path)).toBe(path),
  );

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "%2F%2Fevil.example",
    "javascript:alert(1)",
    ["/settings", "//evil.example"],
    undefined,
  ])("falls back for unsafe destination %j", (value) => {
    expect(safeNextPath(value)).toBe("/analyze");
  });
});
