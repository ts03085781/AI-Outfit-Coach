"use client";

import { useState } from "react";
import { OutfitAnalysisSchema, type Occasion, type OutfitAnalysis } from "./domain";
import { prepareImage } from "./image";

export type OutfitFlowState = "occasion" | "photo" | "consent" | "analyzing" | "result" | "error";

export function useOutfitFlow() {
  const [state, setState] = useState<OutfitFlowState>("occasion");
  const [occasion, setOccasion] = useState<Occasion>();
  const [image, setImage] = useState<Blob>();
  const [consented, setConsented] = useState(false);
  const [photoError, setPhotoError] = useState<string>();
  const [result, setResult] = useState<OutfitAnalysis>();

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
    setState("analyzing");
    try {
      const formData = new FormData();
      formData.set("occasion", occasion);
      formData.set("image", image, "outfit.webp");
      const response = await fetch("/api/analyze", { method: "POST", body: formData });
      const body: unknown = await response.json();

      if (response.status === 422 && typeof body === "object" && body !== null && "retake_reason" in body) {
        const retakeReason = (body as { retake_reason?: unknown }).retake_reason;
        if (typeof retakeReason === "string") {
          setResult({ retake_required: true, retake_reason: retakeReason });
          setState("result");
          return;
        }
      }

      const parsed = OutfitAnalysisSchema.safeParse(body);
      if (!response.ok || !parsed.success) throw new Error("analysis failed");
      setResult(parsed.data);
      setState("result");
    } catch {
      setState("error");
    }
  };

  const retake = () => {
    setImage(undefined);
    setConsented(false);
    setResult(undefined);
    setState("photo");
  };

  return {
    state,
    occasion,
    image,
    consented,
    photoError,
    result,
    chooseOccasion,
    choosePhoto,
    continueToConsent,
    setConsented,
    analyze,
    retake,
  };
}
