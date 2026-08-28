import { z } from "zod";

import { locales, type AppLocale } from "@/lib/i18n/config";

const LocalizedCopySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1),
}).strict();

const TranslationsSchema = z.object({
  "zh-TW": LocalizedCopySchema,
  en: LocalizedCopySchema,
  ja: LocalizedCopySchema,
  ko: LocalizedCopySchema,
}).strict();

export const TrendSourceSchema = z.object({
  title: z.string().trim().min(1).max(160),
  url: z.url().refine((value) => value.startsWith("https://"), "Source must use HTTPS"),
}).strict();

const TrendResearchItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  translations: TranslationsSchema,
  image_prompt: z.string().trim().min(1).max(600),
  sources: z.array(TrendSourceSchema).min(1).max(5),
}).strict();

export const TrendResearchSchema = z.object({
  items: z.array(TrendResearchItemSchema).length(5).refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    "Trend item ids must be unique",
  ),
}).strict();

const TrendManifestItemSchema = TrendResearchItemSchema.omit({ image_prompt: true }).extend({
  imageUrl: z.url().refine((value) => value.startsWith("https://"), "Image must use HTTPS"),
}).strict();

export const TrendManifestSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  generatedAt: z.iso.datetime(),
  market: z.literal("TW"),
  items: z.array(TrendManifestItemSchema).length(5),
}).strict();

export const LatestTrendPointerSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  generatedAt: z.iso.datetime(),
  manifestUrl: z.url().refine((value) => value.startsWith("https://")),
}).strict();

export type TrendResearch = z.infer<typeof TrendResearchSchema>;
export type TrendManifest = z.infer<typeof TrendManifestSchema>;
export type TrendManifestItem = z.infer<typeof TrendManifestItemSchema>;
export type LatestTrendPointer = z.infer<typeof LatestTrendPointerSchema>;

export type LocalizedTrend = {
  id: string;
  imageUrl: string;
  name: string;
  description: string;
  sources: TrendManifestItem["sources"];
};

export function getLocalizedTrend(item: TrendManifestItem, locale: AppLocale): LocalizedTrend {
  const copy = item.translations[locale];
  return {
    id: item.id,
    imageUrl: item.imageUrl,
    name: copy.name,
    description: copy.description,
    sources: item.sources,
  };
}

export function hasAllTrendLocales(value: Record<string, unknown>): boolean {
  return locales.every((locale) => locale in value);
}
