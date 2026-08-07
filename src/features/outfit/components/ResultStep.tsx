import type { OutfitAnalysis } from "../domain";

type ResultStepProps = {
  result: OutfitAnalysis;
  onRetake: () => void;
};

export function ResultStep({ result, onRetake }: ResultStepProps) {
  if (result.retake_required) {
    return (
      <section className="retake-result" aria-label="重拍建議">
        <p>{result.retake_reason}</p>
        <button className="primary-action" type="button" onClick={onRetake}>
          重新拍照
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby="result-title">
      <h1 id="result-title">你的穿搭建議</h1>
      <article className="summary-card">
        <p>{result.summary}</p>
      </article>
      <h2>做得很好的地方</h2>
      <ul>
        {result.strengths.map((strength) => <li key={strength}>{strength}</li>)}
      </ul>
      <p className="fit-label">場合適合度：{result.occasion_fit}</p>
      {result.suggestions.length > 0 ? (
        <>
          <h2>可以試試</h2>
          <ul className="suggestion-list">
            {result.suggestions.map((suggestion) => (
              <li key={suggestion.action}>
                <strong>{suggestion.action}</strong>
                <span>{suggestion.reason}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
