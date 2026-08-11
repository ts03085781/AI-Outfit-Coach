import { describe, expect, it } from "vitest";

import { resolveLocale, resolveLocaleList } from "@/lib/i18n/config";

describe("locale resolution", () => {
  it("uses the first supported browser language instead of the first listed language", () => {
    expect(resolveLocaleList(["fr-FR", "ja-JP", "en-US"])).toBe("ja");
  });

  it("maps Traditional Chinese browser variants to zh-TW", () => {
    expect(resolveLocale("zh-Hant")).toBe("zh-TW");
  });
});
