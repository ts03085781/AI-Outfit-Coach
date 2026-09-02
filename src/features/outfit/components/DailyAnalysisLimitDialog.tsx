"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import Link from "next/link";

type DailyAnalysisLimitDialogProps = {
  kind: "limited" | "unavailable";
  onRetry: () => void;
};

export function DailyAnalysisLimitDialog({
  kind,
  onRetry,
}: DailyAnalysisLimitDialogProps) {
  const t = useTranslations("analysisQuota");
  const titleId = useId();
  const descriptionId = useId();
  const layerRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const homeRef = useRef<HTMLAnchorElement>(null);
  const navigationIntentRef = useRef(false);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const firstAction = kind === "unavailable" ? retryRef.current : homeRef.current;
    firstAction?.focus();

    const hiddenSiblings = Array.from(document.body.children)
      .filter((element) => element !== layerRef.current)
      .map((element) => ({ element, previousValue: element.getAttribute("aria-hidden") }));

    hiddenSiblings.forEach(({ element }) => element.setAttribute("aria-hidden", "true"));
    return () => {
      hiddenSiblings.forEach(({ element, previousValue }) => {
        if (previousValue === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", previousValue);
      });
      if (
        !navigationIntentRef.current
        && previouslyFocused?.isConnected
        && previouslyFocused !== document.body
      ) {
        previouslyFocused.focus();
      }
    };
  }, [kind]);

  const keepFocusInDialog = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key !== "Tab") return;

    event.preventDefault();
    if (kind === "limited") {
      homeRef.current?.focus();
      return;
    }

    const target = document.activeElement === retryRef.current
      ? homeRef.current
      : retryRef.current;
    target?.focus();
  };

  if (typeof document === "undefined") return null;

  const isUnavailable = kind === "unavailable";

  return createPortal(
    <div className="analysis-quota-layer" ref={layerRef}>
      <div className="analysis-quota-backdrop" aria-hidden="true" />
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="editorial-card analysis-quota-dialog"
        onKeyDown={keepFocusInDialog}
        role="dialog"
      >
        <h1 id={titleId}>{t(isUnavailable ? "unavailableTitle" : "limitTitle")}</h1>
        <p id={descriptionId}>
          {t(isUnavailable ? "unavailableMessage" : "limitMessage")}
        </p>
        {!isUnavailable ? <p className="analysis-quota-note">{t("resetNote")}</p> : null}
        <div className="analysis-quota-actions">
          {isUnavailable ? (
            <button
              className="button-primary"
              onClick={onRetry}
              ref={retryRef}
              type="button"
            >
              {t("retry")}
            </button>
          ) : null}
          <Link
            className={isUnavailable ? "button-secondary" : "button-primary"}
            href="/"
            onClick={() => {
              navigationIntentRef.current = true;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") navigationIntentRef.current = true;
            }}
            ref={homeRef}
          >
            {t("backHome")}
          </Link>
        </div>
      </section>
    </div>,
    document.body,
  );
}
