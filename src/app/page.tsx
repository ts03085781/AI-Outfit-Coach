"use client";

import { ConsentStep } from "@/features/outfit/components/ConsentStep";
import { PhotoStep } from "@/features/outfit/components/PhotoStep";
import { ResultStep } from "@/features/outfit/components/ResultStep";
import type { Setting, Weather } from "@/features/outfit/domain";
import { useOutfitFlow } from "@/features/outfit/useOutfitFlow";

const occasions = [
  ["casual", "日常外出"],
  ["date", "約會"],
  ["work", "工作／面試"],
  ["formal", "正式活動"],
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
            <details className="optional-context">
              <summary>加上選填背景</summary>
              <div className="context-fields">
                <label>
                  天氣
                  <select
                    aria-label="天氣"
                    value={flow.weather ?? ""}
                    onChange={(event) => flow.setWeather(
                      event.target.value ? event.target.value as Weather : undefined,
                    )}
                  >
                    <option value="">不指定</option>
                    <option value="sunny">晴天</option>
                    <option value="rainy">雨天</option>
                    <option value="cold">偏冷</option>
                    <option value="hot">偏熱</option>
                    <option value="mild">舒適</option>
                  </select>
                </label>
                <label>
                  地點環境
                  <select
                    aria-label="地點環境"
                    value={flow.setting ?? ""}
                    onChange={(event) => flow.setSetting(
                      event.target.value ? event.target.value as Setting : undefined,
                    )}
                  >
                    <option value="">不指定</option>
                    <option value="indoor">室內</option>
                    <option value="outdoor">戶外</option>
                    <option value="mixed">室內外都有</option>
                  </select>
                </label>
                <label>
                  想呈現的感覺
                  <input
                    aria-label="想呈現的感覺"
                    type="text"
                    maxLength={60}
                    value={flow.desiredFeel}
                    placeholder="例如：專業但親切"
                    onChange={(event) => flow.setDesiredFeel(event.target.value)}
                  />
                </label>
              </div>
            </details>
            <div className="occasion-grid">
              {occasions.map(([value, label]) => (
                <button key={value} type="button" onClick={() => flow.chooseOccasion(value)}>{label}</button>
              ))}
            </div>
          </section>
        ) : null}
        {flow.state === "photo" ? <PhotoStep hasPhoto={Boolean(flow.image)} error={flow.photoError} onChoosePhoto={flow.choosePhoto} onContinue={flow.continueToConsent} /> : null}
        {flow.state === "consent" && flow.image ? <ConsentStep image={flow.image} consented={flow.consented} onConsentChange={flow.setConsented} onAnalyze={flow.analyze} /> : null}
        {flow.state === "analyzing" ? <section role="status" aria-live="polite"><h1>正在分析你的穿搭</h1><p>這通常只要幾秒鐘。</p></section> : null}
        {flow.state === "result" && flow.result ? <ResultStep result={flow.result} analysisToken={flow.analysisToken} onRetake={flow.retake} /> : null}
        {flow.state === "error" ? <section aria-labelledby="error-title"><h1 id="error-title">分析暫時停住了</h1><p role="alert">現在無法分析照片，請確認網路後再試一次。</p><button className="primary-action" type="button" onClick={flow.analyze}>再試一次</button></section> : null}
      </div>
    </main>
  );
}
