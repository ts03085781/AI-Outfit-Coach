import OpenAI from "openai";
import { toJSONSchema, z } from "zod";

import type { OutfitAnalyzer, AnalyzeInput } from "./analyzer";
import { OutfitAnalysisSchema, SuggestionSchema, type OutfitAnalysis } from "./domain";
import { assertSafeAnalysis, UnsafeModelOutputError } from "./output-safety";
import { buildAnalysisPrompt, buildAnalysisSystemPrompt } from "./prompts";

type OpenAIResponsesRequest = {
  model: string;
  store: false;
  input: Array<{
    role: "system" | "user";
    content: string | Array<{ type: "input_image"; image_url: string }>;
  }>;
  text: {
    format: {
      type: "json_schema";
      name: string;
      strict: true;
      schema: Record<string, unknown>;
    };
  };
};

export interface OpenAIResponsesClient {
  responses: {
    create(
      request: OpenAIResponsesRequest,
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

export class AnalyzerTimeoutError extends Error {
  constructor() {
    super("AI analysis timed out");
    this.name = "AnalyzerTimeoutError";
  }
}

export class AnalyzerUnavailableError extends Error {
  constructor() {
    super("AI analysis is unavailable");
    this.name = "AnalyzerUnavailableError";
  }
}

export type AnalyzerProviderErrorCode =
  | "AI_AUTHORIZATION"
  | "AI_RATE_LIMITED"
  | "AI_REFUSED"
  | "AI_INVALID_RESPONSE"
  | "AI_UNAVAILABLE";

export class AnalyzerProviderError extends AnalyzerUnavailableError {
  constructor(
    readonly code: AnalyzerProviderErrorCode,
    readonly providerStatus?: number,
    readonly requestId?: string,
  ) {
    super();
    this.message = code;
    this.name = "AnalyzerProviderError";
  }
}

export class AnalyzerSafetyError extends Error {
  constructor() {
    super("AI analysis failed safety validation");
    this.name = "AnalyzerSafetyError";
  }
}

const TransportAnalysisSchema = z
  .object({
    summary: z.string().min(1).max(280).nullable(),
    strengths: z.array(z.string().min(1).max(160)).length(2).nullable(),
    occasion_fit: z.enum(["適合", "稍需調整", "不太適合"]).nullable(),
    suggestions: z.array(SuggestionSchema).max(3).nullable(),
    retake_required: z.boolean(),
    retake_reason: z.string().min(1).max(240).nullable(),
  })
  .strict();

const ANALYSIS_JSON_SCHEMA = toJSONSchema(TransportAnalysisSchema) as Record<string, unknown>;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function providerErrorFrom(error: unknown): AnalyzerProviderError {
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
    ? "AI_AUTHORIZATION"
    : providerStatus === 429
      ? "AI_RATE_LIMITED"
      : "AI_UNAVAILABLE";
  return new AnalyzerProviderError(code, providerStatus, requestId);
}

function hasRefusal(response: Awaited<ReturnType<OpenAIResponsesClient["responses"]["create"]>>): boolean {
  return response.output?.some((item) =>
    item.type === "message" && item.content?.some((content) => content.type === "refusal"),
  ) ?? false;
}

function parseAnalysis(outputText: string): OutfitAnalysis {
  const transport = TransportAnalysisSchema.parse(JSON.parse(outputText));
  if (transport.retake_required) {
    if (
      transport.summary !== null
      || transport.strengths !== null
      || transport.occasion_fit !== null
      || transport.suggestions !== null
    ) {
      throw new Error("Retake transport fields must be null");
    }
    return OutfitAnalysisSchema.parse({
      retake_required: true,
      retake_reason: transport.retake_reason,
    });
  }

  return OutfitAnalysisSchema.parse({
    summary: transport.summary,
    strengths: transport.strengths,
    occasion_fit: transport.occasion_fit,
    suggestions: transport.suggestions,
    retake_required: false,
    retake_reason: transport.retake_reason,
  });
}

function createOpenAIClient(): OpenAIResponsesClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AnalyzerUnavailableError();

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

export class OpenAIOutfitAnalyzer implements OutfitAnalyzer {
  constructor(private readonly client: OpenAIResponsesClient = createOpenAIClient()) {}

  async analyze(input: AnalyzeInput): Promise<OutfitAnalysis> {
    const model = process.env.OPENAI_VISION_MODEL;
    if (!model) throw new AnalyzerUnavailableError();

    let imageDataUrl: string | undefined;
    try {
      const imageBytes = await input.image.arrayBuffer();
      imageDataUrl = `data:${input.image.type};base64,${Buffer.from(imageBytes).toString("base64")}`;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        let response: Awaited<ReturnType<OpenAIResponsesClient["responses"]["create"]>>;
        try {
          response = await this.client.responses.create(
            {
              model,
              store: false,
              input: [
                { role: "system", content: buildAnalysisSystemPrompt() },
                {
                  role: "user",
                  content: buildAnalysisPrompt({
                    occasion: input.occasion,
                    weather: input.weather,
                    setting: input.setting,
                    desiredFeel: input.desiredFeel,
                  }),
                },
                { role: "user", content: [{ type: "input_image", image_url: imageDataUrl }] },
              ],
              text: {
                format: {
                  type: "json_schema",
                  name: "outfit_analysis",
                  strict: true,
                  schema: ANALYSIS_JSON_SCHEMA,
                },
              },
            },
            { signal: input.signal },
          );
        } catch (error) {
          if (isAbortError(error)) throw new AnalyzerTimeoutError();
          throw providerErrorFrom(error);
        }

        if (hasRefusal(response)) throw new AnalyzerProviderError("AI_REFUSED");

        try {
          const analysis = parseAnalysis(response.output_text);
          assertSafeAnalysis(analysis);
          return analysis;
        } catch (error) {
          if (error instanceof UnsafeModelOutputError) throw new AnalyzerSafetyError();
          if (attempt === 1) throw new AnalyzerProviderError("AI_INVALID_RESPONSE");
        }
      }

      throw new AnalyzerUnavailableError();
    } finally {
      imageDataUrl = undefined;
    }
  }
}

export function createOpenAIOutfitAnalyzer(): OutfitAnalyzer {
  return new OpenAIOutfitAnalyzer();
}
