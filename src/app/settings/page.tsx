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

  return (
    <main className="editorial-page settings-shell app-page-with-nav">
      <AppNavigation />
      <div className="settings-content">
        <section className="settings-intro">
          <div className="settings-heading">
            <p className="editorial-label">{t("eyebrow")}</p>
            <h1>{t("title")}</h1>
            <p>{t("description")}</p>
          </div>
          <label className="settings-language-field">
            <span className="editorial-label">{t("language")}</span>
            <select
              className="field-control"
              aria-label={tApp("language")}
              value={locale}
              onChange={(event) => {
                const nextLocale = event.target.value as AppLocale;
                persistLocale(nextLocale);
                setLocale(nextLocale);
              }}
            >
              {locales.map((optionLocale) => (
                <option key={optionLocale} value={optionLocale}>
                  {tApp(`localeName.${optionLocale}`)}
                </option>
              ))}
            </select>
          </label>
        </section>
        <AccountSection />
      </div>
    </main>
  );
}
