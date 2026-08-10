"use client";

import { useEffect, useState } from "react";

type PhotoStepProps = {
  hasPhoto: boolean;
  image?: Blob;
  consented: boolean;
  error?: string;
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
      <button className="photo-back" type="button" onClick={onBack}>返回</button>
      <h1 id="photo-title">拍下完整穿搭</h1>
      <p>請站遠一點，讓上衣、下身與鞋子都入鏡。</p>
      <p>{hasPhoto ? "已選好照片，想換一張嗎？" : "拍照或從相簿選擇照片"}</p>
      <div className="photo-picker-options">
        <label className="photo-picker" htmlFor="outfit-camera">
          <span>拍照</span>
          <input
            id="outfit-camera"
            aria-label="拍照"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(event) => onChoosePhoto(event.target.files?.[0])}
          />
        </label>
        <label className="photo-picker" htmlFor="outfit-library">
          <span>選擇照片</span>
          <input
            id="outfit-library"
            aria-label="選擇照片"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => onChoosePhoto(event.target.files?.[0])}
          />
        </label>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {hasPhoto && previewUrl ? (
        <>
          {/* The source is a local object URL and never leaves the browser through this element. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="photo-preview" src={previewUrl} alt="本機穿搭照片預覽" />
          <p>照片會傳給 AI 供應商完成本次分析；供應商可能依濫用監控政策短期保留，實際期限上線前仍須確認。</p>
          <p>本服務不建立照片或結果紀錄。離開或重新整理後，照片與結果都無法恢復。</p>
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
            我同意將這張照片用於本次穿搭分析；勾選後會立即上傳並開始分析
          </label>
        </>
      ) : null}
    </section>
  );
}
