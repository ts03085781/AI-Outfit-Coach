import type { PhotoCheckResult } from "./photo-check";

export type PhotoCheckInput = { image: Blob; signal?: AbortSignal };

export interface PhotoChecker {
  check(input: PhotoCheckInput): Promise<PhotoCheckResult>;
}
