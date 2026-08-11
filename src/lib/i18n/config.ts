export const locales = ["zh-TW", "en", "ja", "ko"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "zh-TW";
export const localeCookieName = "NEXT_LOCALE";

function supportedLocale(value?: string | null): AppLocale | undefined {
  const locale = value?.toLowerCase();
  if (!locale) return undefined;
  if (locale === "zh" || locale === "zh-hant" || locale.startsWith("zh-tw")) return "zh-TW";
  if (locale.startsWith("en")) return "en";
  if (locale.startsWith("ja")) return "ja";
  if (locale.startsWith("ko")) return "ko";
  return undefined;
}

export function resolveLocale(value?: string | null): AppLocale {
  return supportedLocale(value) ?? defaultLocale;
}

export function resolveLocaleList(values?: readonly string[] | null): AppLocale {
  for (const value of values ?? []) {
    const locale = supportedLocale(value);
    if (locale) return locale;
  }
  return defaultLocale;
}
