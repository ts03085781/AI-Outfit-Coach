"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { ImSpinner8 } from "react-icons/im";

import { PhotoStep } from "@/features/outfit/components/PhotoStep";
import { ResultStep } from "@/features/outfit/components/ResultStep";
import type { Occasion, Setting, Weather } from "@/features/outfit/domain";
import { useOutfitFlow } from "@/features/outfit/useOutfitFlow";
import { type AppLocale } from "@/lib/i18n/config";
import { AppNavigation } from "@/features/home/components/AppNavigation";

const occasions: Occasion[] = ["casual", "date", "work", "formal"];
const weatherOptions: Weather[] = ["sunny", "rainy", "cold", "hot", "mild"];
const settingOptions: Setting[] = ["indoor", "outdoor", "mixed"];

export function OutfitFlowPage() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations();
  const flow = useOutfitFlow(locale);
  const step = flow.state === "occasion" ? 1 : flow.state === "photo" ? 2 : 3;

  return (
    <main className="flow-shell app-page-with-nav">
      <div className="flow-content">
        <div className="flow-header" aria-label={t("step", { step })}>
          <span>{t("appName")}</span>
          <span>{step}/3</span>
        </div>
        <div className="stitch-progress" aria-hidden="true">
          {[1, 2, 3].map((segment) => (
            <i className={segment <= step ? "is-current" : ""} key={segment} />
          ))}
        </div>
        <div className="flow-card">
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
                      onChange={(event) =>
                        flow.setWeather(
                          event.target.value
                            ? (event.target.value as Weather)
                            : undefined,
                        )
                      }
                    >
                      <option value="">{t("occasion.unspecified")}</option>
                      {weatherOptions.map((weather) => (
                        <option key={weather} value={weather}>
                          {t(`weather.${weather}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("occasion.setting")}
                    <select
                      aria-label={t("occasion.setting")}
                      value={flow.setting ?? ""}
                      onChange={(event) =>
                        flow.setSetting(
                          event.target.value
                            ? (event.target.value as Setting)
                            : undefined,
                        )
                      }
                    >
                      <option value="">{t("occasion.unspecified")}</option>
                      {settingOptions.map((setting) => (
                        <option key={setting} value={setting}>
                          {t(`setting.${setting}`)}
                        </option>
                      ))}
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
                      onChange={(event) =>
                        flow.setDesiredFeel(event.target.value)
                      }
                    />
                  </label>
                </div>
              </details>
              <div className="occasion-grid">
                {occasions.map((occasion) => (
                  <button
                    key={occasion}
                    type="button"
                    onClick={() => flow.chooseOccasion(occasion)}
                  >
                    {t(`occasion.${occasion}`)}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {flow.state === "photo" ? (
            <PhotoStep
              image={flow.image}
              consented={flow.consented}
              error={flow.photoError}
              onChoosePhoto={flow.choosePhoto}
              onConsentChange={flow.setConsented}
              onAnalyze={flow.analyze}
              onBack={flow.backToOccasion}
            />
          ) : null}
          {flow.state === "analyzing" ? (
            <section role="status" aria-live="polite">
              <h1>{t("analyzing.title")}</h1>
              <p>{t("analyzing.description")}</p>
              <div className="analyzing-loader">
                <ImSpinner8 className="analyzing-spinner" aria-hidden="true" />
              </div>
            </section>
          ) : null}
          {flow.state === "result" && flow.result ? (
            <ResultStep
              result={flow.result}
              analysisToken={flow.analysisToken}
              locale={locale}
              onRetake={flow.retake}
              onReselectPhoto={flow.reselectPhoto}
              onRestart={flow.restart}
            />
          ) : null}
          {flow.state === "error" ? (
            <section aria-labelledby="error-title">
              <h1 id="error-title">{t("error.title")}</h1>
              <p role="alert">{flow.analysisErrorMessage}</p>
              <button
                className="primary-action"
                type="button"
                onClick={flow.analyze}
              >
                {t("error.retry")}
              </button>
            </section>
          ) : null}
        </div>
      </div>
      <AppNavigation />
    </main>
  );
}
