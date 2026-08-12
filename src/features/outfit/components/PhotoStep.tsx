"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import type { ImagePreparationErrorCode } from "../image";

type PhotoStepProps = {
  hasPhoto: boolean;
  image?: Blob;
  consented: boolean;
  error?: ImagePreparationErrorCode;
  onChoosePhoto: (file?: File) => void;
  onConsentChange: (consented: boolean) => void;
  onAnalyze: () => void;
  onBack: () => void;
};

export function PhotoStep({
  hasPhoto,
  image,
  consented,
  error,
  onChoosePhoto,
  onConsentChange,
  onAnalyze,
  onBack,
}: PhotoStepProps) {
  const t = useTranslations("photo");
  const imageError = useTranslations("imageError");
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

  return (
    <section aria-labelledby="photo-title">
      <button className="photo-back" type="button" onClick={onBack}>{t("back")}</button>
      <h1 id="photo-title">{t("title")}</h1>
      <p>{t("description")}</p>
      <p>{hasPhoto ? t("chosen") : t("empty")}</p>
      <div className="photo-picker-options">
        <label className="photo-picker" htmlFor="outfit-camera">
          <span>{t("camera")}</span>
          <input
            id="outfit-camera"
            aria-label={t("camera")}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(event) => onChoosePhoto(event.target.files?.[0])}
          />
        </label>
        <label className="photo-picker" htmlFor="outfit-library">
          <span>{t("library")}</span>
          <input
            id="outfit-library"
            aria-label={t("library")}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => onChoosePhoto(event.target.files?.[0])}
          />
        </label>
      </div>
      {error ? <p role="alert">{imageError(error)}</p> : null}
      {hasPhoto && previewUrl ? (
        <>
          {/* The source is a local object URL and never leaves the browser through this element. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="photo-preview" src={previewUrl} alt={t("preview")} />
          {/* <p>{t("providerPrivacy")}</p>
          <p>{t("localPrivacy")}</p> */}
          <label className="consent-label">
            <input
              type="checkbox"
              checked={consented}
              onChange={(event) => {
                const nextConsented = event.target.checked;
                onConsentChange(nextConsented);
                if (nextConsented) onAnalyze();
              }}
            />
            {t("consent")}
          </label>
        </>
      ) : null}
    </section>
  );
}
