"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";

import type { ImagePreparationErrorCode } from "../image";

type PhotoStepProps = {
  image?: Blob;
  consented: boolean;
  error?: ImagePreparationErrorCode;
  onChoosePhoto: (file?: File) => void;
  onConsentChange: (consented: boolean) => void;
  onAnalyze: () => void;
  onBack: () => void;
};

export function PhotoStep({
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
      ) : null}
    </section>
  );
}
