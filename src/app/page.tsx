"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { PhotoStep } from "@/features/outfit/components/PhotoStep";
import { ResultStep } from "@/features/outfit/components/ResultStep";
import type { Occasion, Setting, Weather } from "@/features/outfit/domain";
import { useOutfitFlow } from "@/features/outfit/useOutfitFlow";
import { type AppLocale, locales } from "@/lib/i18n/config";
import { LocaleProvider, persistLocale, useAppLocale } from "@/lib/i18n/LocaleProvider";

const occasions: Occasion[] = ["casual", "date", "work", "formal"];
const weatherOptions: Weather[] = ["sunny", "rainy", "cold", "hot", "mild"];
const settingOptions: Setting[] = ["indoor", "outdoor", "mixed"];

function LanguageSelect() {
  const t = useTranslations();
  const { locale, setLocale } = useAppLocale();

  return (
    <label className="language-select">
      <span className="sr-only">{t("language")}</span>
      <select
        aria-label={t("language")}
        value={locale}
        onChange={(event) => {
          const nextLocale = event.target.value as AppLocale;
          persistLocale(nextLocale);
          setLocale(nextLocale);
        }}
      >
        {locales.map((optionLocale) => (
          <option key={optionLocale} value={optionLocale}>{t(`localeName.${optionLocale}`)}</option>
        ))}
      </select>
    </label>
  );
}

function OutfitFlowPage() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const flow = useOutfitFlow(locale);
  const step = flow.state === "occasion" ? 1 : flow.state === "photo" ? 2 : 3;
  const showLanguageSelect = flow.state === "occasion" || flow.state === "photo";

  return (
    <main className="flow-shell">
      <header className="app-header">
        <button
          aria-expanded={isMenuOpen}
          aria-label={t("header.menu")}
          className={`menu-toggle${isMenuOpen ? " is-menu-open" : ""}`}
          type="button"
          onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
        >
          <span aria-hidden="true">☰</span>
        </button>
        <img alt={t("header.iconAlt")} className="app-header-icon" src="/icon-512.png" />
        <span aria-hidden="true" className="app-header-spacer" />
      </header>
      {isMenuOpen ? (
        <>
          <button
            aria-label={t("header.backdrop")}
            className="menu-backdrop"
            type="button"
            onClick={() => setIsMenuOpen(false)}
          />
          <aside aria-label={t("header.menu")} className="menu-drawer" />
        </>
      ) : null}
      <div className="flow-header" aria-label={t("step", { step })}>
        <span>{t("step", { step })}</span>
      </div>
      <div className="stitch-progress" aria-hidden="true">
        {[1, 2, 3].map((segment) => <i className={segment <= step ? "is-current" : ""} key={segment} />)}
      </div>
      <div className={`flow-card${showLanguageSelect ? " has-language-select" : ""}`}>
        {showLanguageSelect ? <LanguageSelect /> : null}
        {flow.state === "occasion" ? (
          <section aria-labelledby="occasion-title">
            <h1 id="occasion-title">{t("occasion.title")}</h1>
            <p>{t("occasion.description")}</p>
            <details className="optional-context">
              <summary>{t("occasion.optional")}</summary>
              <div className="context-fields">
                <label>
                  {t("occasion.weather")}
                  <select
                    aria-label={t("occasion.weather")}
                    value={flow.weather ?? ""}
                    onChange={(event) => flow.setWeather(
                      event.target.value ? event.target.value as Weather : undefined,
                    )}
                  >
                    <option value="">{t("occasion.unspecified")}</option>
                    {weatherOptions.map((weather) => <option key={weather} value={weather}>{t(`weather.${weather}`)}</option>)}
                  </select>
                </label>
                <label>
                  {t("occasion.setting")}
                  <select
                    aria-label={t("occasion.setting")}
                    value={flow.setting ?? ""}
                    onChange={(event) => flow.setSetting(
                      event.target.value ? event.target.value as Setting : undefined,
                    )}
                  >
                    <option value="">{t("occasion.unspecified")}</option>
                    {settingOptions.map((setting) => <option key={setting} value={setting}>{t(`setting.${setting}`)}</option>)}
                  </select>
                </label>
                <label>
                  {t("occasion.desiredFeel")}
                  <input
                    aria-label={t("occasion.desiredFeel")}
                    type="text"
                    maxLength={60}
                    value={flow.desiredFeel}
                    placeholder={t("occasion.desiredPlaceholder")}
                    onChange={(event) => flow.setDesiredFeel(event.target.value)}
                  />
                </label>
              </div>
            </details>
            <div className="occasion-grid">
              {occasions.map((occasion) => (
                <button key={occasion} type="button" onClick={() => flow.chooseOccasion(occasion)}>{t(`occasion.${occasion}`)}</button>
              ))}
            </div>
          </section>
        ) : null}
        {flow.state === "photo" ? <PhotoStep hasPhoto={Boolean(flow.image)} image={flow.image} consented={flow.consented} error={flow.photoError} onChoosePhoto={flow.choosePhoto} onConsentChange={flow.setConsented} onAnalyze={flow.analyze} onBack={flow.backToOccasion} /> : null}
        {flow.state === "analyzing" ? <section role="status" aria-live="polite"><h1>{t("analyzing.title")}</h1><p>{t("analyzing.description")}</p></section> : null}
        {flow.state === "result" && flow.result ? <ResultStep result={flow.result} analysisToken={flow.analysisToken} locale={locale} onRetake={flow.retake} onReselectPhoto={flow.reselectPhoto} onRestart={flow.restart} /> : null}
        {flow.state === "error" ? <section aria-labelledby="error-title"><h1 id="error-title">{t("error.title")}</h1><p role="alert">{flow.analysisErrorMessage}</p><button className="primary-action" type="button" onClick={flow.analyze}>{t("error.retry")}</button></section> : null}
      </div>
    </main>
  );
}

export default function HomePage() {
  return <LocaleProvider><OutfitFlowPage /></LocaleProvider>;
}
