"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import type { OutfitAnalysis } from "../domain";
import type { AppLocale } from "@/lib/i18n/config";

type ResultStepProps = {
  result: OutfitAnalysis;
  image?: Blob;
  analysisToken?: string;
  locale: AppLocale;
  onRetake: () => void;
  onReselectPhoto: () => void;
  onRestart: () => void;
};

function fitMessageKey(fit: string) {
  if (fit === "good" || fit === "適合") return "fitGood";
  if (fit === "adjust" || fit === "稍需調整") return "fitAdjust";
  return "fitPoor";
}

export function ResultStep({
  result,
  image,
  analysisToken,
  locale,
  onRetake,
  onReselectPhoto,
  onRestart,
}: ResultStepProps) {
  const t = useTranslations("result");
  const [question, setQuestion] = useState("");
  const [alternative, setAlternative] = useState<string>();
  const [followUpUsed, setFollowUpUsed] = useState(false);
  const [followUpError, setFollowUpError] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>();

  useEffect(() => {
    if (!image) {
      setImageUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  if (result.retake_required) {
    return (
      <section className="retake-result" aria-label={t("retakeLabel")}>
        <p>{result.retake_reason}</p>
        <button className="primary-action" type="button" onClick={onRetake}>
          {t("retake")}
        </button>
      </section>
    );
  }

  const [primarySuggestion, ...secondarySuggestions] = result.suggestions;

  const submitFollowUp = async () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || followUpUsed || !analysisToken) return;

    setFollowUpUsed(true);
    setFollowUpError(false);
    try {
      const response = await fetch("/api/follow-up", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          analysis: result,
          analysisToken,
          question: trimmedQuestion,
          locale,
        }),
      });
      const body: unknown = await response.json();
      if (
        !response.ok ||
        typeof body !== "object" ||
        body === null ||
        !("alternative" in body) ||
        typeof body.alternative !== "string"
      ) {
        throw new Error("follow-up failed");
      }
      setAlternative(body.alternative);
    } catch {
      setFollowUpError(true);
    } finally {
      setQuestion("");
    }
  };

  return (
    <section className="result-step" aria-labelledby="result-title">
      <h1 id="result-title">{t("title")}</h1>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="result-photo" src={imageUrl} alt={t("photoAlt")} />
      ) : null}
      <div className="result-analysis">
        <article className="editorial-card result-summary">
          <p>{result.summary}</p>
        </article>
        <section className="result-strengths">
          <h2>{t("strengths")}</h2>
          <ul>
            {result.strengths.map((strength) => (
              <li key={strength}>{strength}</li>
            ))}
          </ul>
        </section>
        <p className="fit-label">
          {t("fit", { fit: t(fitMessageKey(result.occasion_fit)) })}
        </p>
        {primarySuggestion ? (
          <>
            <h2>{t("suggestions")}</h2>
            <article className="primary-suggestion">
              <strong>{primarySuggestion.action}</strong>
              <p>{primarySuggestion.reason}</p>
              <p>{t("effect", { effect: primarySuggestion.expected_effect })}</p>
            </article>
            {secondarySuggestions.length > 0 ? (
              <ul className="suggestion-list">
                {secondarySuggestions.map((suggestion) => (
                  <li key={suggestion.action}>
                    <strong>{suggestion.action}</strong>
                    <span>{suggestion.reason}</span>
                    <span>
                      {t("effect", { effect: suggestion.expected_effect })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
        {/* <section aria-labelledby="follow-up-title">
        <h2 id="follow-up-title">{t("followUpTitle")}</h2>
        <label>
          {t("followUpLabel")}
          <textarea
            value={question}
            maxLength={160}
            disabled={followUpUsed}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={followUpUsed || !question.trim()}
          onClick={submitFollowUp}
        >
          {t("followUpButton")}
        </button>
        {alternative ? <p>{alternative}</p> : null}
        {followUpError ? <p role="alert">{t("followUpError")}</p> : null}
      </section> */}
        <nav className="result-navigation" aria-label={t("navigation")}>
          <button className="button-secondary" type="button" onClick={onReselectPhoto}>
            {t("reselect")}
          </button>
          <button className="button-primary" type="button" onClick={onRestart}>
            {t("restart")}
          </button>
        </nav>
      </div>
    </section>
  );
}
