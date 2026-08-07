"use client";

import { useState } from "react";

import { track } from "@/lib/telemetry";

import type { OutfitAnalysis } from "../domain";

type ResultStepProps = {
  result: OutfitAnalysis;
  analysisToken?: string;
  onRetake: () => void;
};

export function ResultStep({ result, analysisToken, onRetake }: ResultStepProps) {
  const [question, setQuestion] = useState("");
  const [alternative, setAlternative] = useState<string>();
  const [followUpUsed, setFollowUpUsed] = useState(false);
  const [followUpError, setFollowUpError] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

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

  const [primarySuggestion, ...secondarySuggestions] = result.suggestions;

  const submitFollowUp = async () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || followUpUsed || !analysisToken) return;

    setFollowUpUsed(true);
    setFollowUpError(false);
    try {
      const response = await fetch("/api/follow-up", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysis: result, analysisToken, question: trimmedQuestion }),
      });
      const body: unknown = await response.json();
      if (
        !response.ok
        || typeof body !== "object"
        || body === null
        || !("alternative" in body)
        || typeof body.alternative !== "string"
      ) {
        throw new Error("follow-up failed");
      }
      setAlternative(body.alternative);
    } catch {
      setFollowUpError(true);
    } finally {
      setQuestion("");
    }
  };

  const submitFeedback = (helpful: boolean) => {
    if (feedbackSent) return;
    track({ type: "feedback", helpful });
    setFeedbackSent(true);
  };

  return (
    <section className="result-step" aria-labelledby="result-title">
      <h1 id="result-title">你的穿搭建議</h1>
      <article className="summary-card">
        <p>{result.summary}</p>
      </article>
      <h2>做得很好的地方</h2>
      <ul>
        {result.strengths.map((strength) => <li key={strength}>{strength}</li>)}
      </ul>
      <p className="fit-label">場合適合度：{result.occasion_fit}</p>
      {primarySuggestion ? (
        <>
          <h2>可以試試</h2>
          <article className="primary-suggestion">
            <strong>{primarySuggestion.action}</strong>
            <p>{primarySuggestion.reason}</p>
            <p>預期效果：{primarySuggestion.expected_effect}</p>
          </article>
          {secondarySuggestions.length > 0 ? (
            <ul className="suggestion-list">
              {secondarySuggestions.map((suggestion) => (
                <li key={suggestion.action}>
                  <strong>{suggestion.action}</strong>
                  <span>{suggestion.reason}</span>
                  <span>預期效果：{suggestion.expected_effect}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      <section aria-labelledby="follow-up-title">
        <h2 id="follow-up-title">還想確認一件事嗎？</h2>
        <label>
          想再問一個穿搭問題
          <textarea
            value={question}
            maxLength={160}
            disabled={followUpUsed}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={followUpUsed || !question.trim()}
          onClick={submitFollowUp}
        >
          取得替代方法
        </button>
        {alternative ? <p>{alternative}</p> : null}
        {followUpError ? <p role="alert">這次追問暫時無法完成。</p> : null}
      </section>
      <section aria-labelledby="feedback-title">
        <h2 id="feedback-title">這項建議有幫助嗎？</h2>
        <button type="button" disabled={feedbackSent} onClick={() => submitFeedback(true)}>有幫助</button>
        <button type="button" disabled={feedbackSent} onClick={() => submitFeedback(false)}>沒幫助</button>
        {feedbackSent ? <p>謝謝你的回饋。</p> : null}
      </section>
    </section>
  );
}
