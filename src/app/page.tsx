"use client";

import { ConsentStep } from "@/features/outfit/components/ConsentStep";
import { PhotoStep } from "@/features/outfit/components/PhotoStep";
import { ResultStep } from "@/features/outfit/components/ResultStep";
import { useOutfitFlow } from "@/features/outfit/useOutfitFlow";

const occasions = [
  ["casual", "日常外出"],
  ["date", "約會"],
  ["work", "上班"],
  ["formal", "正式場合"],
] as const;

export default function HomePage() {
  const flow = useOutfitFlow();
  const step = flow.state === "occasion" ? 1 : flow.state === "photo" ? 2 : flow.state === "consent" ? 3 : 4;

  return (
    <main className="flow-shell">
      <div className="flow-header" aria-label={`步驟 ${step}／4`}>
        <span>衣櫥指南</span>
        <span>{step}/4</span>
      </div>
      <div className="stitch-progress" aria-hidden="true">
        {[1, 2, 3, 4].map((segment) => <i className={segment <= step ? "is-current" : ""} key={segment} />)}
      </div>
      <div className="flow-card">
        {flow.state === "occasion" ? (
          <section aria-labelledby="occasion-title">
            <h1 id="occasion-title">今天要去哪裡？</h1>
            <p>選最接近的一種，我會依此調整建議。</p>
            <div className="occasion-grid">
              {occasions.map(([value, label]) => (
                <button key={value} type="button" onClick={() => flow.chooseOccasion(value)}>{label}</button>
              ))}
            </div>
          </section>
        ) : null}
        {flow.state === "photo" ? <PhotoStep hasPhoto={Boolean(flow.image)} error={flow.photoError} onChoosePhoto={flow.choosePhoto} onContinue={flow.continueToConsent} /> : null}
        {flow.state === "consent" ? <ConsentStep consented={flow.consented} onConsentChange={flow.setConsented} onAnalyze={flow.analyze} /> : null}
        {flow.state === "analyzing" ? <section role="status" aria-live="polite"><h1>正在分析你的穿搭</h1><p>這通常只要幾秒鐘。</p></section> : null}
        {flow.state === "result" && flow.result ? <ResultStep result={flow.result} onRetake={flow.retake} /> : null}
        {flow.state === "error" ? <section aria-labelledby="error-title"><h1 id="error-title">分析暫時停住了</h1><p role="alert">現在無法分析照片，請確認網路後再試一次。</p><button className="primary-action" type="button" onClick={flow.analyze}>再試一次</button></section> : null}
      </div>
    </main>
  );
}
