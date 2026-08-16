import OpenAI from "openai";
import { toJSONSchema, z } from "zod";

import {
  PhotoCheckReasonSchema,
  PhotoCheckResultSchema,
  type PhotoCheckResult,
} from "./photo-check";
import type { PhotoCheckInput, PhotoChecker } from "./photo-checker";
import { buildPhotoCheckSystemPrompt } from "./photo-check-prompts";

export type OpenAIPhotoCheckRequest = {
  model: string;
  store: false;
  input: Array<{
    role: "system" | "user";
    content: string | Array<{
      type: "input_image";
      image_url: string;
      detail: "low";
    }>;
  }>;
  text: {
    format: {
      type: "json_schema";
      name: "photo_check";
      strict: true;
      schema: Record<string, unknown>;
    };
  };
};

export interface OpenAIPhotoCheckClient {
  responses: {
    create(
      request: OpenAIPhotoCheckRequest,
      options?: { signal?: AbortSignal },
    ): Promise<{
      output_text: string;
      output?: Array<{
        type: string;
        content?: Array<{ type: string }>;
      }>;
    }>;
  };
}

export class PhotoCheckerTimeoutError extends Error {
  constructor() {
    super("Photo check timed out");
    this.name = "PhotoCheckerTimeoutError";
  }
}

export type PhotoCheckerProviderErrorCode =
  | "PHOTO_CHECK_AUTHORIZATION"
  | "PHOTO_CHECK_RATE_LIMITED"
  | "PHOTO_CHECK_REFUSED"
  | "PHOTO_CHECK_INVALID_RESPONSE"
  | "PHOTO_CHECK_UNAVAILABLE";

export class PhotoCheckerProviderError extends Error {
  constructor(
    readonly code: PhotoCheckerProviderErrorCode,
    readonly providerStatus?: number,
    readonly requestId?: string,
  ) {
    super(code);
    this.name = "PhotoCheckerProviderError";
  }
}

const TransportPhotoCheckSchema = z.object({
  eligible: z.boolean(),
  reason: PhotoCheckReasonSchema.nullable(),
}).strict();

const PHOTO_CHECK_JSON_SCHEMA = toJSONSchema(TransportPhotoCheckSchema) as Record<string, unknown>;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function providerErrorFrom(error: unknown): PhotoCheckerProviderError {
  const candidate = error as {
    status?: unknown;
    requestID?: unknown;
    _request_id?: unknown;
  };
  const providerStatus = typeof candidate.status === "number" ? candidate.status : undefined;
  const requestId = typeof candidate.requestID === "string"
    ? candidate.requestID
    : typeof candidate._request_id === "string"
      ? candidate._request_id
      : undefined;
  const code = providerStatus === 401 || providerStatus === 403
    ? "PHOTO_CHECK_AUTHORIZATION"
    : providerStatus === 429
      ? "PHOTO_CHECK_RATE_LIMITED"
      : "PHOTO_CHECK_UNAVAILABLE";

  return new PhotoCheckerProviderError(code, providerStatus, requestId);
}

function hasRefusal(response: Awaited<ReturnType<OpenAIPhotoCheckClient["responses"]["create"]>>): boolean {
  return response.output?.some((item) =>
    item.type === "message" && item.content?.some((content) => content.type === "refusal"),
  ) ?? false;
}

function parsePhotoCheck(outputText: string): PhotoCheckResult {
  const transport = TransportPhotoCheckSchema.parse(JSON.parse(outputText));
  return PhotoCheckResultSchema.parse(transport);
}

function createOpenAIClient(): OpenAIPhotoCheckClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new PhotoCheckerProviderError("PHOTO_CHECK_UNAVAILABLE");

  const client = new OpenAI({ apiKey });
  return {
    responses: {
      create: async (request, options) => {
        const response = await client.responses.create(request as never, options);
        return {
          output_text: response.output_text,
          output: response.output.map((item) => ({
            type: item.type,
            content: item.type === "message"
              ? item.content.map((content) => ({ type: content.type }))
              : undefined,
          })),
        };
      },
    },
  };
}

export class OpenAIPhotoChecker implements PhotoChecker {
  constructor(private readonly client: OpenAIPhotoCheckClient = createOpenAIClient()) {}

  async check(input: PhotoCheckInput): Promise<PhotoCheckResult> {
    const model = process.env.OPENAI_PHOTO_CHECK_MODEL;
    if (!model) throw new PhotoCheckerProviderError("PHOTO_CHECK_UNAVAILABLE");

    let imageDataUrl: string | undefined;
    try {
      const imageBytes = await input.image.arrayBuffer();
      imageDataUrl = `data:${input.image.type};base64,${Buffer.from(imageBytes).toString("base64")}`;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        let response: Awaited<ReturnType<OpenAIPhotoCheckClient["responses"]["create"]>>;
        try {
          response = await this.client.responses.create(
            {
              model,
              store: false,
              input: [
                { role: "system", content: buildPhotoCheckSystemPrompt() },
                {
                  role: "user",
                  content: [{ type: "input_image", image_url: imageDataUrl, detail: "low" }],
                },
              ],
              text: {
                format: {
                  type: "json_schema",
                  name: "photo_check",
                  strict: true,
                  schema: PHOTO_CHECK_JSON_SCHEMA,
                },
              },
            },
            { signal: input.signal },
          );
        } catch (error) {
          if (isAbortError(error)) throw new PhotoCheckerTimeoutError();
          throw providerErrorFrom(error);
        }

        if (hasRefusal(response)) throw new PhotoCheckerProviderError("PHOTO_CHECK_REFUSED");

        try {
          return parsePhotoCheck(response.output_text);
        } catch {
          if (attempt === 1) throw new PhotoCheckerProviderError("PHOTO_CHECK_INVALID_RESPONSE");
        }
      }

      throw new PhotoCheckerProviderError("PHOTO_CHECK_UNAVAILABLE");
    } finally {
      imageDataUrl = undefined;
    }
  }
}

export function createOpenAIPhotoChecker(): PhotoChecker {
  return new OpenAIPhotoChecker();
}
