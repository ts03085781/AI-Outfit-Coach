import { describe, expect, it } from "vitest";

import {
  TrendManifestSchema,
  TrendResearchSchema,
  getLocalizedTrend,
} from "@/features/trends/domain";

const translations = {
  "zh-TW": { name: "薄透風衣", description: "適合台灣換季與午後陣雨。" },
  en: { name: "Sheer windbreaker", description: "Made for Taiwan's shifting weather." },
  ja: { name: "シアーウィンドブレーカー", description: "台湾の変わりやすい天候に。" },
  ko: { name: "시어 윈드브레이커", description: "대만의 변덕스러운 날씨에 어울립니다." },
};

describe("trend data contract", () => {
  it("accepts exactly five researched items in all four locales", () => {
    const result = TrendResearchSchema.parse({
      items: Array.from({ length: 5 }, (_, index) => ({
        id: `trend-${index + 1}`,
        translations,
        image_prompt: `Neutral studio product photo ${index + 1}`,
        sources: [{ title: "Fashion source", url: `https://example.com/${index + 1}` }],
      })),
    });

    expect(result.items).toHaveLength(5);
  });

  it("rejects research that does not contain five items", () => {
    expect(() => TrendResearchSchema.parse({ items: [] })).toThrow();
  });

  it("rejects duplicate item ids that would overwrite Blob images", () => {
    expect(() => TrendResearchSchema.parse({
      items: Array.from({ length: 5 }, () => ({
        id: "same-item",
        translations,
        image_prompt: "Neutral product photo",
        sources: [{ title: "Fashion source", url: "https://example.com/source" }],
      })),
    })).toThrow();
  });

  it("rejects missing translations and non-https sources", () => {
    expect(() => TrendResearchSchema.parse({
      items: Array.from({ length: 5 }, (_, index) => ({
        id: `trend-${index + 1}`,
        translations: { ...translations, ko: undefined },
        image_prompt: "Neutral product photo",
        sources: [{ title: "Bad source", url: "http://example.com" }],
      })),
    })).toThrow();
  });

  it("localizes a published manifest without changing its sources", () => {
    const manifest = TrendManifestSchema.parse({
      schemaVersion: 1,
      runId: "2026-08-26T22-00-00-000Z",
      generatedAt: "2026-08-26T22:00:00.000Z",
      market: "TW",
      items: Array.from({ length: 5 }, (_, index) => ({
        id: `trend-${index + 1}`,
        imageUrl: `https://example.public.blob.vercel-storage.com/trends/${index + 1}.png`,
        translations,
        sources: [{ title: "Fashion source", url: `https://example.com/${index + 1}` }],
      })),
    });

    expect(getLocalizedTrend(manifest.items[0], "ja")).toEqual({
      id: "trend-1",
      imageUrl: "https://example.public.blob.vercel-storage.com/trends/1.png",
      name: translations.ja.name,
      description: translations.ja.description,
      sources: [{ title: "Fashion source", url: "https://example.com/1" }],
    });
  });
});
