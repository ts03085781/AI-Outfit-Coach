"use client";

import { useState } from "react";

import {
  coarseLatencyBucket,
  track,
  type TelemetryErrorCode,
} from "@/lib/telemetry";

import {
  AnalyzeSuccessResponseSchema,
  type Occasion,
  type OutfitAnalysis,
  type Setting,
  type Weather,
} from "./domain";
import { prepareImage } from "./image";

export type OutfitFlowState = "occasion" | "photo" | "consent" | "analyzing" | "result" | "error";

const TELEMETRY_ERROR_CODES = new Set<TelemetryErrorCode>([
  "INVALID_IMAGE",
  "AI_TIMEOUT",
  "AI_UNAVAILABLE",
  "AI_AUTHORIZATION",
  "AI_RATE_LIMITED",
  "AI_REFUSED",
  "AI_INVALID_RESPONSE",
  "AI_SAFETY_REJECTED",
  "RATE_LIMITED",
  "RATE_LIMIT_UNAVAILABLE",
  "INVALID_RESPONSE",
]);

const ANALYSIS_ERROR_MESSAGES: Record<TelemetryErrorCode, string> = {
  INVALID_IMAGE: "這張照片目前無法處理，請改用清楚的 JPEG、PNG 或 WebP 照片。",
  AI_TIMEOUT: "分析等待逾時，請再試一次。",
  AI_UNAVAILABLE: "分析服務暫時無法使用，請稍後再試一次。",
  AI_AUTHORIZATION: "OpenAI 專案的額度或權限目前無法使用，請檢查 Platform 設定。",
  AI_RATE_LIMITED: "目前分析次數較多，請稍後再試一次。",
  AI_REFUSED: "這張照片目前無法由模型分析，請改用清楚、完整的單人穿搭照。",
  AI_INVALID_RESPONSE: "模型回覆格式暫時異常，請再試一次。",
  AI_SAFETY_REJECTED: "這張照片目前無法完成安全檢查，請改用清楚、完整的單人穿搭照。",
  RATE_LIMITED: "目前分析次數較多，請稍後再試一次。",
  RATE_LIMIT_UNAVAILABLE: "分析服務暫時無法使用，請稍後再試一次。",
  INVALID_RESPONSE: "模型回覆格式暫時異常，請再試一次。",
};

class AnalysisRequestError extends Error {
  constructor(readonly code: TelemetryErrorCode) {
    super(code);
  }
}

function errorCodeFromBody(body: unknown): TelemetryErrorCode {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return "INVALID_RESPONSE";
  }
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" && TELEMETRY_ERROR_CODES.has(error as TelemetryErrorCode)
    ? error as TelemetryErrorCode
    : "INVALID_RESPONSE";
}

export function useOutfitFlow() {
  const [state, setState] = useState<OutfitFlowState>("occasion");
  const [occasion, setOccasion] = useState<Occasion>();
  const [weather, setWeather] = useState<Weather>();
  const [setting, setSetting] = useState<Setting>();
  const [desiredFeel, setDesiredFeel] = useState("");
  const [image, setImage] = useState<Blob>();
  const [consented, setConsented] = useState(false);
  const [photoError, setPhotoError] = useState<string>();
  const [result, setResult] = useState<OutfitAnalysis>();
  const [analysisToken, setAnalysisToken] = useState<string>();
  const [analysisErrorCode, setAnalysisErrorCode] = useState<TelemetryErrorCode>();

  const chooseOccasion = (nextOccasion: Occasion) => {
    setOccasion(nextOccasion);
    setState("photo");
  };

  const choosePhoto = async (file?: File) => {
    if (!file) return;
    setPhotoError(undefined);
    try {
      setImage(await prepareImage(file));
    } catch (error) {
      setImage(undefined);
      setPhotoError(error instanceof Error ? error.message : "照片處理失敗，請重新選擇");
    }
  };

  const continueToConsent = () => {
    if (image) setState("consent");
  };

  const analyze = async () => {
    if (!occasion || !image || !consented) return;
    const startedAt = performance.now();
    setAnalysisErrorCode(undefined);
    setState("analyzing");
    try {
      const formData = new FormData();
      formData.set("occasion", occasion);
      if (weather) formData.set("weather", weather);
      if (setting) formData.set("setting", setting);
      const trimmedDesiredFeel = desiredFeel.trim();
      if (trimmedDesiredFeel) formData.set("desiredFeel", trimmedDesiredFeel);
      formData.set("image", image, "outfit.webp");
      const response = await fetch("/api/analyze", { method: "POST", body: formData });
      const body: unknown = await response.json();
      const latencyBucket = coarseLatencyBucket(performance.now() - startedAt);

      if (response.status === 422 && typeof body === "object" && body !== null && "retake_reason" in body) {
        const retakeReason = (body as { retake_reason?: unknown }).retake_reason;
        if (typeof retakeReason === "string") {
          setImage(undefined);
          setAnalysisToken(undefined);
          setAnalysisErrorCode(undefined);
          setResult({ retake_required: true, retake_reason: retakeReason });
          setState("result");
          track({ type: "analysis_retake", occasion, latencyBucket });
          return;
        }
      }

      if (!response.ok) throw new AnalysisRequestError(errorCodeFromBody(body));
      const parsed = AnalyzeSuccessResponseSchema.safeParse(body);
      if (!parsed.success || parsed.data.analysis.retake_required) {
        throw new AnalysisRequestError("INVALID_RESPONSE");
      }

      setImage(undefined);
      setResult(parsed.data.analysis);
      setAnalysisToken(parsed.data.analysisToken);
      setAnalysisErrorCode(undefined);
      setState("result");
      track({ type: "analysis_success", occasion, latencyBucket });
    } catch (error) {
      const errorCode = error instanceof AnalysisRequestError ? error.code : "AI_UNAVAILABLE";
      setAnalysisErrorCode(errorCode);
      setState("error");
      track({
        type: "analysis_error",
        occasion,
        latencyBucket: coarseLatencyBucket(performance.now() - startedAt),
        errorCode,
      });
    }
  };

  const retake = () => {
    setImage(undefined);
    setConsented(false);
    setResult(undefined);
    setAnalysisToken(undefined);
    setAnalysisErrorCode(undefined);
    setState("photo");
  };

  return {
    state,
    occasion,
    weather,
    setting,
    desiredFeel,
    image,
    consented,
    photoError,
    result,
    analysisToken,
    analysisErrorMessage: ANALYSIS_ERROR_MESSAGES[analysisErrorCode ?? "AI_UNAVAILABLE"],
    chooseOccasion,
    choosePhoto,
    continueToConsent,
    setWeather,
    setSetting,
    setDesiredFeel,
    setConsented,
    analyze,
    retake,
  };
}
