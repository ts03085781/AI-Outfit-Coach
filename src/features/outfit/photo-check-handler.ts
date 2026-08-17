import type { PhotoChecker } from "./photo-checker";
import {
  PhotoCheckerProviderError,
  PhotoCheckerTimeoutError,
} from "./openai-photo-checker";
import { isDecodableSupportedImage } from "./server-image";
import type { AbuseGuard } from "@/lib/abuse-guard";

const MAX_REQUEST_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const PHOTO_CHECK_TIMEOUT_MS = 20_000;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type PhotoCheckHandlerDependencies = {
  createChecker: () => PhotoChecker;
  abuseGuard: AbuseGuard;
};

function json(body: object, status: number): Response {
  return Response.json(body, { status });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function abortError(): DOMException {
  return new DOMException("aborted", "AbortError");
}

function awaitWithinDeadline<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);

    signal.addEventListener("abort", onAbort, { once: true });
    void operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
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
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (!body) return new Uint8Array();

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const cancelReader = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancelReader, { once: true });
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
    signal.removeEventListener("abort", cancelReader);
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

async function parseMultipartFormData(
  request: Request,
  signal: AbortSignal,
): Promise<FormData | undefined> {
  const multipartBody = await awaitWithinDeadline(readBodyWithinLimit(request.body, signal), signal);
  if (!multipartBody) return undefined;

  try {
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    return await awaitWithinDeadline(new Request(request.url, {
      method: request.method,
      headers,
      body: new Blob([multipartBody]),
    }).formData(), signal);
  } catch {
    return undefined;
  }
}

export function createPhotoCheckHandler(dependencies: PhotoCheckHandlerDependencies) {
  return async function photoCheckHandler(request: Request): Promise<Response> {
    const guard = dependencies.abuseGuard.enter(request, "photoCheck");
    if (!guard.allowed) return guard.response;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PHOTO_CHECK_TIMEOUT_MS);
    let image: Blob | undefined;
    try {
      const contentLength = Number(request.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
        return json({ error: "INVALID_IMAGE" }, 400);
      }

      if (!isMultipartContentType(request.headers.get("content-type"))) {
        return json({ error: "INVALID_IMAGE" }, 400);
      }

      const formData = await parseMultipartFormData(request, controller.signal);
      if (controller.signal.aborted) return json({ error: "PHOTO_CHECK_TIMEOUT" }, 504);
      if (!formData) return json({ error: "INVALID_IMAGE" }, 400);

      const imageValue = formData.get("image");
      if (!isValidImage(imageValue)) return json({ error: "INVALID_IMAGE" }, 400);
      image = imageValue;
      if (!await awaitWithinDeadline(isDecodableSupportedImage(image), controller.signal)) {
        return json({ error: "INVALID_IMAGE" }, 400);
      }

      const result = await awaitWithinDeadline(
        dependencies.createChecker().check({ image, signal: controller.signal }),
        controller.signal,
      );
      return json(result, 200);
    } catch (error) {
      if (error instanceof PhotoCheckerTimeoutError || isAbortError(error)) {
        return json({ error: "PHOTO_CHECK_TIMEOUT" }, 504);
      }
      if (error instanceof PhotoCheckerProviderError) {
        return json({ error: "PHOTO_CHECK_UNAVAILABLE" }, 503);
      }
      return json({ error: "PHOTO_CHECK_UNAVAILABLE" }, 503);
    } finally {
      clearTimeout(timeout);
      image = undefined;
      guard.release();
    }
  };
}
