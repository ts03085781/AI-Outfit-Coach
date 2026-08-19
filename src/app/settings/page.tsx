"use client";

import { useTranslations } from "next-intl";

import { AccountSection } from "@/features/auth/components/AccountSection";
import { AppNavigation } from "@/features/home/components/AppNavigation";
import { locales, type AppLocale } from "@/lib/i18n/config";
import { persistLocale, useAppLocale } from "@/lib/i18n/LocaleProvider";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tApp = useTranslations();
  const { locale, setLocale } = useAppLocale();

  return <main className="settings-shell app-page-with-nav"><div className="settings-content"><section className="settings-intro"><p>{t("eyebrow")}</p><h1>{t("title")}</h1><p>{t("description")}</p><label className="settings-language-field">{t("language")}<select aria-label={tApp("language")} value={locale} onChange={(event) => { const nextLocale = event.target.value as AppLocale; persistLocale(nextLocale); setLocale(nextLocale); }}>{locales.map((optionLocale) => <option key={optionLocale} value={optionLocale}>{tApp(`localeName.${optionLocale}`)}</option>)}</select></label></section><AccountSection /></div><AppNavigation /></main>;
}
