"use client";

import { useEffect, useState } from "react";

type ConsentStepProps = {
  image: Blob;
  consented: boolean;
  onConsentChange: (consented: boolean) => void;
  onAnalyze: () => void;
};

export function ConsentStep({ image, consented, onConsentChange, onAnalyze }: ConsentStepProps) {
  const [previewUrl, setPreviewUrl] = useState<string>();

  useEffect(() => {
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [image]);

  return (
    <section aria-labelledby="consent-title">
      <h1 id="consent-title">準備好開始分析</h1>
      {previewUrl ? (
        // The source is a local object URL and never leaves the browser through this element.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="photo-preview" src={previewUrl} alt="本機穿搭照片預覽" />
      ) : null}
      <p>照片會傳給 AI 供應商完成本次分析；供應商可能依濫用監控政策短期保留，實際期限上線前仍須確認。</p>
      <p>本服務不建立照片或結果紀錄。離開或重新整理後，照片與結果都無法恢復。</p>
      <label className="consent-label">
        <input
          type="checkbox"
          checked={consented}
          onChange={(event) => onConsentChange(event.target.checked)}
        />
        我同意將這張照片用於本次穿搭分析
      </label>
      <button className="primary-action" type="button" disabled={!consented} onClick={onAnalyze}>
        開始分析
      </button>
    </section>
  );
}
