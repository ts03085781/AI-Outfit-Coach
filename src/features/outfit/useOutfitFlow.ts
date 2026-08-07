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
  "AI_SAFETY_REJECTED",
  "RATE_LIMITED",
  "RATE_LIMIT_UNAVAILABLE",
  "INVALID_RESPONSE",
]);

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
      setState("result");
      track({ type: "analysis_success", occasion, latencyBucket });
    } catch (error) {
      setState("error");
      track({
        type: "analysis_error",
        occasion,
        latencyBucket: coarseLatencyBucket(performance.now() - startedAt),
        errorCode: error instanceof AnalysisRequestError ? error.code : "AI_UNAVAILABLE",
      });
    }
  };

  const retake = () => {
    setImage(undefined);
    setConsented(false);
    setResult(undefined);
    setAnalysisToken(undefined);
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
