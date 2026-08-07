type ConsentStepProps = {
  consented: boolean;
  onConsentChange: (consented: boolean) => void;
  onAnalyze: () => void;
};

export function ConsentStep({ consented, onConsentChange, onAnalyze }: ConsentStepProps) {
  return (
    <section aria-labelledby="consent-title">
      <h1 id="consent-title">準備好開始分析</h1>
      <p>我們只會用這張照片提供本次建議，不會用於其他用途。</p>
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
