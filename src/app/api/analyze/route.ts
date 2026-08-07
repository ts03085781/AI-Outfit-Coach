import { OccasionSchema } from "@/features/outfit/domain";
import type { OutfitAnalyzer } from "@/features/outfit/analyzer";
import {
  AnalyzerTimeoutError,
  AnalyzerUnavailableError,
  createOpenAIOutfitAnalyzer,
} from "@/features/outfit/openai-analyzer";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ANALYSIS_TIMEOUT_MS = 30_000;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

export async function POST(
  request: Request,
  analyzer?: OutfitAnalyzer,
): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "INVALID_IMAGE" }, 400);
  }

  let image: Blob | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const formData = await request.formData();
    const imageValue = formData.get("image");
    if (!isValidImage(imageValue)) return json({ error: "INVALID_IMAGE" }, 400);
    image = imageValue;

    const occasion = OccasionSchema.safeParse(formData.get("occasion"));
    if (!occasion.success) return json({ error: "INVALID_IMAGE" }, 400);

    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);
    const analysis = await (analyzer ?? createOpenAIOutfitAnalyzer()).analyze({
      image,
      occasion: occasion.data,
      signal: controller.signal,
    });

    if (analysis.retake_required) {
      return json({ error: "RETAKE_REQUIRED", retake_reason: analysis.retake_reason }, 422);
    }

    return json(analysis, 200);
  } catch (error) {
    if (error instanceof AnalyzerTimeoutError || isAbortError(error)) {
      return json({ error: "AI_TIMEOUT" }, 504);
    }
    if (error instanceof AnalyzerUnavailableError) {
      return json({ error: "AI_UNAVAILABLE" }, 503);
    }
    return json({ error: "AI_UNAVAILABLE" }, 503);
  } finally {
    if (timeout) clearTimeout(timeout);
    image = undefined;
  }
}
