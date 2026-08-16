"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";

import type { ImagePreparationErrorCode } from "../image";
import type { PhotoCheckState } from "../photo-check";

type PhotoStepProps = {
  image?: Blob;
  error?: ImagePreparationErrorCode;
  photoCheckState: PhotoCheckState;
  onChoosePhoto: (file?: File) => void;
  onRetryPhotoCheck: () => void;
  onConsentChange: (consented: boolean) => void;
  onAnalyze: () => void;
  onBack: () => void;
};

export function PhotoStep({
  image,
  error,
  photoCheckState,
  onChoosePhoto,
  onRetryPhotoCheck,
  onConsentChange,
  onAnalyze,
  onBack,
}: PhotoStepProps) {
  const t = useTranslations("photo");
  const imageError = useTranslations("imageError");
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();

  useEffect(() => {
    if (!image) {
      setPreviewUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [image]);

  const hasPreview = Boolean(image && previewUrl);
  const openPhotoPicker = () => inputRef.current?.click();
  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    onChoosePhoto(file);
  };
  const photoCheckMessage = (() => {
    if (photoCheckState.status === "checking") return t("checking");
    if (photoCheckState.status === "passed") return t("passed");
    if (photoCheckState.status === "rejected") {
      return t(`reason.${photoCheckState.reason}`);
    }
    if (photoCheckState.status === "error") {
      if (photoCheckState.code === "PHOTO_CHECK_TIMEOUT") return t("checkTimeout");
      if (photoCheckState.code === "RATE_LIMITED") return t("checkRateLimited");
      return t("checkError");
    }
    return undefined;
  })();

  return (
    <section aria-labelledby="photo-title">
      <button className="photo-back" type="button" onClick={onBack}>
        {t("back")}
      </button>
      <h1 id="photo-title">{t("title")}</h1>
      <p>{t("description")}</p>
      {error ? <p role="alert">{imageError(error)}</p> : null}
      <input
        ref={inputRef}
        id="outfit-photo"
        className="photo-file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handlePhotoChange}
      />
      {hasPreview ? (
        <div className="photo-preview-shell">
          {/* The source is a local object URL and never leaves the browser through this element. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="photo-preview" src={previewUrl} alt={t("preview")} />
          <button className="photo-replace" type="button" onClick={openPhotoPicker}>
            {t("replacePhoto")}
          </button>
        </div>
      ) : (
        <button
          aria-label={t("addPhoto")}
          className="photo-upload-empty"
          type="button"
          onClick={openPhotoPicker}
        >
          <span className="photo-upload-plus" aria-hidden="true">+</span>
          <span className="photo-upload-title">{t("addPhoto")}</span>
          <span className="photo-upload-hint">{t("fileHint")}</span>
        </button>
      )}
      {hasPreview ? (
        <>
          {photoCheckMessage ? (
            <p
              className="photo-check-status"
              role={photoCheckState.status === "checking" || photoCheckState.status === "passed"
                ? "status"
                : "alert"}
              aria-live={photoCheckState.status === "checking" || photoCheckState.status === "passed"
                ? "polite"
                : undefined}
            >
              {photoCheckMessage}
            </p>
          ) : null}
          {photoCheckState.status === "error" ? (
            <button
              className="photo-check-retry"
              type="button"
              onClick={onRetryPhotoCheck}
            >
              {t("retryCheck")}
            </button>
          ) : null}
          <button
            className="primary-action photo-analyze"
            type="button"
            disabled={photoCheckState.status !== "passed"}
            onClick={() => {
              onConsentChange(true);
              onAnalyze();
            }}
          >
            {t("startAnalysis")}
          </button>
        </>
      ) : null}
    </section>
  );
}
