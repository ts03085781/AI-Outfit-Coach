"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ImSpinner8 } from "react-icons/im";

import { RequiredLoginDialog } from "@/features/auth/components/RequiredLoginDialog";
import { PhotoStep } from "@/features/outfit/components/PhotoStep";
import { ResultStep } from "@/features/outfit/components/ResultStep";
import type { Occasion, Setting, Weather } from "@/features/outfit/domain";
import { useOutfitFlow } from "@/features/outfit/useOutfitFlow";
import { type AppLocale } from "@/lib/i18n/config";
import { AppNavigation } from "@/features/home/components/AppNavigation";

const occasions: Occasion[] = ["casual", "date", "work", "formal"];
const weatherOptions: Weather[] = ["sunny", "rainy", "cold", "hot", "mild"];
const settingOptions: Setting[] = ["indoor", "outdoor", "mixed"];

type OutfitFlowPageProps = {
  loginSucceeded?: boolean;
};

function isAuthenticatedSessionSummary(value: unknown): value is { user: { id: string } } {
  return typeof value === "object"
    && value !== null
    && "user" in value
    && typeof value.user === "object"
    && value.user !== null
    && "id" in value.user
    && typeof value.user.id === "string"
    && value.user.id.length > 0;
}

export function OutfitFlowPage({ loginSucceeded = false }: OutfitFlowPageProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations();
  const flow = useOutfitFlow(locale);
  const [authStatus, setAuthStatus] = useState<"checking" | "authenticated" | "anonymous">("checking");
  const step = flow.state === "occasion" ? 1 : flow.state === "photo" ? 2 : 3;

  useEffect(() => {
    const controller = new AbortController();

    const checkAuthentication = async () => {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          signal: controller.signal,
        });
        const summary: unknown = await response.json();
        if (!controller.signal.aborted) {
          setAuthStatus(response.ok && isAuthenticatedSessionSummary(summary)
            ? "authenticated"
            : "anonymous");
        }
      } catch {
        if (!controller.signal.aborted) setAuthStatus("anonymous");
      }
    };

    void checkAuthentication();
    return () => controller.abort();
  }, []);

  const handleAnalyze = async () => {
    flow.setConsented(true);
    const outcome = await flow.analyze();
    if (outcome === "unauthorized") setAuthStatus("anonymous");
  };

  return (
    <main
      aria-busy={authStatus === "checking"}
      className="editorial-page analyze-shell flow-shell app-page-with-nav"
    >
      <div className="flow-content" inert={authStatus !== "authenticated" ? true : undefined}>
        {loginSucceeded ? <p className="login-success" role="status">{t("auth.loginSuccess")}</p> : null}
        <div className="flow-header" aria-label={t("step", { step })}>
          <span>{t("appName")}</span>
          <span>{step}/3</span>
        </div>
        <div className="stitch-progress" aria-hidden="true">
          {[1, 2, 3].map((segment) => (
            <i className={segment <= step ? "is-current" : ""} key={segment} />
          ))}
        </div>
        <div className="editorial-card flow-card">
          {flow.state === "occasion" ? (
            <section aria-labelledby="occasion-title">
              <h1 id="occasion-title">{t("occasion.title")}</h1>
              <p>{t("occasion.description")}</p>
              <details className="optional-context">
                <summary>{t("occasion.optional")}</summary>
                <div className="context-fields">
                  <label>
                    <span className="editorial-label">{t("occasion.weather")}</span>
                    <select
                      className="field-control"
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
                    <span className="editorial-label">{t("occasion.setting")}</span>
                    <select
                      className="field-control"
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
                    <span className="editorial-label">{t("occasion.desiredFeel")}</span>
                    <input
                      className="field-control"
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
                    className="occasion-option"
                    disabled={authStatus === "anonymous"}
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
              error={flow.photoError}
              photoCheckState={flow.photoCheckState}
              analysisDisabled={authStatus !== "authenticated"}
              onChoosePhoto={flow.choosePhoto}
              onRetryPhotoCheck={flow.retryPhotoCheck}
              onAnalyze={handleAnalyze}
              onBack={flow.backToOccasion}
            />
          ) : null}
          {flow.state === "analyzing" ? (
            <section className="analysis-status" role="status" aria-live="polite">
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
              image={flow.image}
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
              <p className="flow-error" role="alert">{flow.analysisErrorMessage}</p>
              <button
                className="button-primary primary-action"
                type="button"
                disabled={authStatus !== "authenticated"}
                aria-busy={authStatus === "checking"}
                onClick={handleAnalyze}
              >
                {t("error.retry")}
              </button>
            </section>
          ) : null}
        </div>
      </div>
      <AppNavigation />
      {authStatus === "anonymous" ? <RequiredLoginDialog /> : null}
    </main>
  );
}
