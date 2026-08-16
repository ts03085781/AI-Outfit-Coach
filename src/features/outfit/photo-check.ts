import { z } from "zod";

export const PhotoCheckReasonSchema = z.enum([
  "NO_PERSON",
  "MULTIPLE_PEOPLE",
  "INCOMPLETE_OUTFIT",
  "OUTFIT_OBSTRUCTED",
  "TOO_DARK",
  "TOO_BLURRY",
  "NOT_OUTFIT_PHOTO",
  "INAPPROPRIATE_CONTENT",
  "CLOTHING_UNRECOGNIZABLE",
]);

export const PhotoCheckResultSchema = z.discriminatedUnion("eligible", [
  z.object({ eligible: z.literal(true), reason: z.null() }).strict(),
  z.object({ eligible: z.literal(false), reason: PhotoCheckReasonSchema }).strict(),
]);

export const PhotoCheckResponseSchema = PhotoCheckResultSchema;

export type PhotoCheckReason = z.infer<typeof PhotoCheckReasonSchema>;
export type PhotoCheckResult = z.infer<typeof PhotoCheckResultSchema>;

export type PhotoCheckErrorCode =
  | "INVALID_IMAGE"
  | "RATE_LIMITED"
  | "RATE_LIMIT_UNAVAILABLE"
  | "PHOTO_CHECK_UNAVAILABLE"
  | "PHOTO_CHECK_TIMEOUT"
  | "INVALID_RESPONSE";

export const PhotoCheckErrorResponseSchema = z.object({
  error: z.enum([
    "INVALID_IMAGE",
    "RATE_LIMITED",
    "RATE_LIMIT_UNAVAILABLE",
    "PHOTO_CHECK_UNAVAILABLE",
    "PHOTO_CHECK_TIMEOUT",
  ]),
}).strict();

export type PhotoCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "passed" }
  | { status: "rejected"; reason: PhotoCheckReason }
  | { status: "error"; code: PhotoCheckErrorCode };
