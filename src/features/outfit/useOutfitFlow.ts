"use client";

import { useRef, useState } from "react";

import {
  coarseLatencyBucket,
  track,
  type TelemetryErrorCode,
} from "@/lib/telemetry";
import type { AppLocale } from "@/lib/i18n/config";
import { messages } from "@/lib/i18n/messages";

import {
  AnalyzeSuccessResponseSchema,
  type Occasion,
  type OutfitAnalysis,
  type Setting,
  type Weather,
} from "./domain";
import { ImagePreparationError, prepareImage, type ImagePreparationErrorCode } from "./image";

export type OutfitFlowState = "occasion" | "photo" | "analyzing" | "result" | "error";

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

export function useOutfitFlow(locale: AppLocale) {
  const [state, setState] = useState<OutfitFlowState>("occasion");
  const [occasion, setOccasion] = useState<Occasion>();
  const [weather, setWeather] = useState<Weather>();
  const [setting, setSetting] = useState<Setting>();
  const [desiredFeel, setDesiredFeel] = useState("");
  const [image, setImage] = useState<Blob>();
  const [consented, setConsented] = useState(false);
  const consentedRef = useRef(false);
  const photoRequestRef = useRef(0);
  const [photoError, setPhotoError] = useState<ImagePreparationErrorCode>();
  const [result, setResult] = useState<OutfitAnalysis>();
  const [analysisToken, setAnalysisToken] = useState<string>();
  const [analysisErrorCode, setAnalysisErrorCode] = useState<TelemetryErrorCode>();

  const chooseOccasion = (nextOccasion: Occasion) => {
    setOccasion(nextOccasion);
    setState("photo");
  };

  const choosePhoto = async (file?: File) => {
    if (!file) return;
    const requestId = photoRequestRef.current + 1;
    photoRequestRef.current = requestId;
    setImage(undefined);
    consentedRef.current = false;
    setConsented(false);
    setPhotoError(undefined);
    try {
      const preparedImage = await prepareImage(file);
      if (photoRequestRef.current === requestId) setImage(preparedImage);
    } catch (error) {
      if (photoRequestRef.current !== requestId) return;
      setImage(undefined);
      setPhotoError(error instanceof ImagePreparationError ? error.code : "PROCESSING_FAILED");
    }
  };

  const setConsent = (nextConsented: boolean) => {
    consentedRef.current = nextConsented;
    setConsented(nextConsented);
  };

  const analyze = async () => {
    if (!occasion || !image || !consentedRef.current) return;
    const startedAt = performance.now();
    setAnalysisErrorCode(undefined);
    setState("analyzing");
    try {
      const formData = new FormData();
      formData.set("occasion", occasion);
      formData.set("locale", locale);
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

  const clearAnalysisState = () => {
    photoRequestRef.current += 1;
    setImage(undefined);
    setConsent(false);
    setPhotoError(undefined);
    setResult(undefined);
    setAnalysisToken(undefined);
    setAnalysisErrorCode(undefined);
  };

  const reselectPhoto = () => {
    clearAnalysisState();
    setState("photo");
  };

  const restart = () => {
    setOccasion(undefined);
    setWeather(undefined);
    setSetting(undefined);
    setDesiredFeel("");
    clearAnalysisState();
    setState("occasion");
  };

  const backToOccasion = () => {
    photoRequestRef.current += 1;
    setImage(undefined);
    setConsent(false);
    setPhotoError(undefined);
    setState("occasion");
  };

  const retake = reselectPhoto;

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
    analysisErrorMessage: messages[locale].error[analysisErrorCode ?? "AI_UNAVAILABLE"],
    chooseOccasion,
    choosePhoto,
    setWeather,
    setSetting,
    setDesiredFeel,
    setConsented: setConsent,
    analyze,
    retake,
    reselectPhoto,
    restart,
    backToOccasion,
  };
}
