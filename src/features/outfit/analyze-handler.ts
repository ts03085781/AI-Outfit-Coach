import { AnalyzeRequestSchema } from "./domain";
import type { OutfitAnalyzer } from "./analyzer";
import {
  AnalyzerSafetyError,
  AnalyzerTimeoutError,
  AnalyzerUnavailableError,
  AnalyzerProviderError,
} from "./openai-analyzer";
import { isDecodableSupportedImage } from "./server-image";
import type { AbuseGuard } from "@/lib/abuse-guard";
import {
  QuotaUnavailableError,
  type AnalysisQuotaService,
} from "@/features/outfit/analysis-quota";

const MAX_REQUEST_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ANALYSIS_TIMEOUT_MS = 30_000;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type AnalyzeHandlerDependencies = {
  createAnalyzer: () => OutfitAnalyzer;
  abuseGuard: AbuseGuard;
  quotaService: AnalysisQuotaService;
  issueAnalysisToken: (analysis: Exclude<Awaited<ReturnType<OutfitAnalyzer["analyze"]>>, { retake_required: true }>) => string;
};

function json(body: object, status: number): Response {
  return Response.json(body, { status });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function isValidImage(value: FormDataEntryValue | null): value is File {
  return value instanceof Blob
    && SUPPORTED_IMAGE_TYPES.has(value.type)
    && value.size > 0
    && value.size <= MAX_IMAGE_BYTES;
}

function isMultipartContentType(value: string | null): boolean {
  return value !== null && /^multipart\/form-data(?:\s*;|$)/i.test(value);
}

async function readBodyWithinLimit(
  body: ReadableStream<Uint8Array> | null,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (!body) return new Uint8Array();

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // The request stream has already failed or closed.
    }
    return undefined;
  } finally {
    reader.releaseLock();
  }

  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function parseMultipartFormData(request: Request): Promise<FormData | undefined> {
  const multipartBody = await readBodyWithinLimit(request.body);
  if (!multipartBody) return undefined;

  try {
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    return await new Request(request.url, {
      method: request.method,
      headers,
      body: new Blob([multipartBody]),
    }).formData();
  } catch {
    return undefined;
  }
}

export function createAnalyzeHandler(dependencies: AnalyzeHandlerDependencies) {
  return async function analyzeHandler(request: Request, userId: string): Promise<Response> {
    const guard = dependencies.abuseGuard.enter(request, "analyze");
    if (!guard.allowed) return guard.response;

    try {
      const contentLength = Number(request.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
        return json({ error: "INVALID_IMAGE" }, 400);
      }

      if (!isMultipartContentType(request.headers.get("content-type"))) {
        return json({ error: "INVALID_IMAGE" }, 400);
      }

      const formData = await parseMultipartFormData(request);
      if (!formData) return json({ error: "INVALID_IMAGE" }, 400);

      let image: Blob | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let reservationId: string | undefined;
      let reserved = false;
      let completed = false;
      try {
        const imageValue = formData.get("image");
        if (!isValidImage(imageValue)) return json({ error: "INVALID_IMAGE" }, 400);
        image = imageValue;
        if (!await isDecodableSupportedImage(image)) {
          return json({ error: "INVALID_IMAGE" }, 400);
        }

        const rawContext: Record<string, FormDataEntryValue> = {
          occasion: formData.get("occasion") ?? "",
          locale: formData.get("locale") ?? "",
        };
        for (const key of ["weather", "setting", "desiredFeel"] as const) {
          const value = formData.get(key);
          if (value !== null) rawContext[key] = value;
        }
        const context = AnalyzeRequestSchema.safeParse(rawContext);
        if (!context.success) return json({ error: "INVALID_IMAGE" }, 400);

        reservationId = crypto.randomUUID();
        const reservation = await dependencies.quotaService.reserve(userId, reservationId);
        if (reservation.status === "daily_limit_reached") {
          return json({
            error: "DAILY_ANALYSIS_LIMIT_REACHED",
            ...reservation.quota,
          }, 429);
        }
        if (reservation.status === "slots_busy") {
          return json({ error: "ANALYSIS_SLOTS_BUSY" }, 409);
        }
        reserved = true;

        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);
        const analysis = await dependencies.createAnalyzer().analyze({
          image,
          ...context.data,
          signal: controller.signal,
        });

        if (analysis.retake_required) {
          return json({ error: "RETAKE_REQUIRED", retake_reason: analysis.retake_reason }, 422);
        }

        const analysisToken = dependencies.issueAnalysisToken(analysis);
        const quota = await dependencies.quotaService.complete(userId, reservationId);
        completed = true;
        return json({
          analysis,
          analysisToken,
          quota,
        }, 200);
      } catch (error) {
        if (error instanceof QuotaUnavailableError) {
          return json({ error: "QUOTA_UNAVAILABLE" }, 503);
        }
        if (error instanceof AnalyzerTimeoutError || isAbortError(error)) {
          return json({ error: "AI_TIMEOUT" }, 504);
        }
        if (error instanceof AnalyzerProviderError) {
          console.error("outfit_analysis_failure", {
            stage: "provider",
            errorCode: error.code,
            providerStatus: error.providerStatus,
            requestId: error.requestId,
          });
          return json({ error: error.code }, 503);
        }
        if (error instanceof AnalyzerUnavailableError) {
          return json({ error: "AI_UNAVAILABLE" }, 503);
        }
        if (error instanceof AnalyzerSafetyError) {
          return json({ error: "AI_SAFETY_REJECTED" }, 502);
        }
        return json({ error: "AI_UNAVAILABLE" }, 503);
      } finally {
        if (timeout) clearTimeout(timeout);
        if (reserved && !completed && reservationId) {
          try {
            await dependencies.quotaService.release(userId, reservationId);
          } catch {
            console.error("analysis_quota_cleanup_failure", { stage: "release" });
          }
        }
        image = undefined;
      }
    } finally {
      guard.release();
    }
  };
}
