"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ImSpinner8 } from "react-icons/im";
import {
  LuArrowRight,
  LuBriefcaseBusiness,
  LuCoffee,
  LuHeart,
  LuSparkles,
} from "react-icons/lu";

import { RequiredLoginDialog } from "@/features/auth/components/RequiredLoginDialog";
import { DailyAnalysisLimitDialog } from "@/features/outfit/components/DailyAnalysisLimitDialog";
import { PhotoStep } from "@/features/outfit/components/PhotoStep";
import { ResultStep } from "@/features/outfit/components/ResultStep";
import { DailyQuotaSummarySchema } from "@/features/outfit/analysis-quota";
import type { Occasion, Setting, Weather } from "@/features/outfit/domain";
import { useOutfitFlow } from "@/features/outfit/useOutfitFlow";
import { type AppLocale } from "@/lib/i18n/config";

const occasions: Occasion[] = ["casual", "date", "work", "formal"];
const occasionIcons = {
  casual: LuCoffee,
  date: LuHeart,
  work: LuBriefcaseBusiness,
  formal: LuSparkles,
};
const weatherOptions: Weather[] = ["sunny", "rainy", "cold", "hot", "mild"];
const settingOptions: Setting[] = ["indoor", "outdoor", "mixed"];

type OutfitFlowPageProps = {
  loginSucceeded?: boolean;
};

type AccessStatus = "checking" | "ready" | "anonymous" | "limited" | "unavailable";

export function OutfitFlowPage({ loginSucceeded = false }: OutfitFlowPageProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations();
  const flow = useOutfitFlow(locale);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>("checking");
  const firstOccasionRef = useRef<HTMLButtonElement>(null);
  const focusAfterQuotaRetryRef = useRef(false);
  const step = flow.state === "occasion" ? 1 : flow.state === "photo" ? 2 : 3;

  const checkQuota = useCallback(async (signal?: AbortSignal) => {
    setAccessStatus("checking");
    try {
      const response = await fetch("/api/analysis-quota", {
        cache: "no-store",
        signal,
      });
      if (signal?.aborted) return;
      if (response.status === 401) {
        setAccessStatus("anonymous");
        return;
      }
      if (!response.ok) {
        setAccessStatus("unavailable");
        return;
      }

      const parsed = DailyQuotaSummarySchema.safeParse(await response.json());
      if (signal?.aborted) return;
      if (!parsed.success) {
        setAccessStatus("unavailable");
        return;
      }
      setAccessStatus(parsed.data.used === 3 ? "limited" : "ready");
    } catch {
      if (!signal?.aborted) setAccessStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void checkQuota(controller.signal);
    return () => controller.abort();
  }, [checkQuota]);

  useEffect(() => {
    if (accessStatus === "checking" || !focusAfterQuotaRetryRef.current) return;
    focusAfterQuotaRetryRef.current = false;
    if (accessStatus !== "ready") return;
    const focusTimer = window.setTimeout(() => firstOccasionRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [accessStatus]);

  const retryQuota = () => {
    focusAfterQuotaRetryRef.current = true;
    void checkQuota();
  };

  const handleAnalyze = async () => {
    flow.setConsented(true);
    const outcome = await flow.analyze();
    if (outcome === "unauthorized") setAccessStatus("anonymous");
    if (outcome === "daily-limit") setAccessStatus("limited");
    if (outcome === "quota-unavailable") setAccessStatus("unavailable");
  };

  const startAnother = (action: () => void) => {
    if (flow.quota?.remaining === 0) {
      setAccessStatus("limited");
      return;
    }
    action();
  };

  return (
    <main
      aria-busy={accessStatus === "checking"}
      className="editorial-page analyze-shell flow-shell app-page-with-nav"
    >
      <div className="flow-content" inert={accessStatus !== "ready" ? true : undefined}>
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
              <div className="occasion-grid">
                {occasions.map((occasion) => {
                  const OccasionIcon = occasionIcons[occasion];
                  return (
                    <button
                      aria-pressed={flow.occasion === occasion}
                      className="occasion-option"
                      disabled={accessStatus === "anonymous"}
                      key={occasion}
                      ref={occasion === "casual" ? firstOccasionRef : undefined}
                      type="button"
                      onClick={() => flow.chooseOccasion(occasion)}
                    >
                      <OccasionIcon className="occasion-option-icon" aria-hidden="true" />
                      <span>{t(`occasion.${occasion}`)}</span>
                    </button>
                  );
                })}
              </div>
              <details className="optional-context" open>
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
              <button
                className="button-primary primary-action occasion-next"
                type="button"
                disabled={!flow.occasion || accessStatus === "anonymous"}
                onClick={flow.continueToPhoto}
              >
                <span>{t("occasion.next")}</span>
                <LuArrowRight aria-hidden="true" />
              </button>
            </section>
          ) : null}
          {flow.state === "photo" ? (
            <PhotoStep
              image={flow.image}
              error={flow.photoError}
              photoCheckState={flow.photoCheckState}
              analysisDisabled={accessStatus !== "ready"}
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
              onRetake={() => startAnother(flow.retake)}
              onReselectPhoto={() => startAnother(flow.reselectPhoto)}
              onRestart={() => startAnother(flow.restart)}
            />
          ) : null}
          {flow.state === "error" ? (
            <section aria-labelledby="error-title">
              <h1 id="error-title">{t("error.title")}</h1>
              <p className="flow-error" role="alert">{flow.analysisErrorMessage}</p>
              <button
                className="button-primary primary-action"
                type="button"
                disabled={accessStatus !== "ready"}
                aria-busy={accessStatus === "checking"}
                onClick={handleAnalyze}
              >
                {t("error.retry")}
              </button>
            </section>
          ) : null}
        </div>
      </div>
      {accessStatus === "anonymous" ? <RequiredLoginDialog /> : null}
      {accessStatus === "limited" || accessStatus === "unavailable" ? (
        <DailyAnalysisLimitDialog
          kind={accessStatus}
          onRetry={retryQuota}
        />
      ) : null}
    </main>
  );
}
