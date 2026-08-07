import OpenAI from "openai";
import { toJSONSchema, z } from "zod";

import type { OutfitAnalyzer, AnalyzeInput } from "./analyzer";
import { OutfitAnalysisSchema, SuggestionSchema, type OutfitAnalysis } from "./domain";
import { buildAnalysisPrompt } from "./prompts";

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
    ): Promise<{ output_text: string }>;
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

const TransportAnalysisSchema = z
  .object({
    summary: z.string().nullable(),
    strengths: z.array(z.string()).nullable(),
    occasion_fit: z.enum(["適合", "稍需調整", "不太適合"]).nullable(),
    suggestions: z.array(SuggestionSchema).nullable(),
    retake_required: z.boolean(),
    retake_reason: z.string().nullable(),
  })
  .strict();

const ANALYSIS_JSON_SCHEMA = toJSONSchema(TransportAnalysisSchema) as Record<string, unknown>;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
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
        return { output_text: response.output_text };
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
        let response: { output_text: string };
        try {
          response = await this.client.responses.create(
            {
              model,
              store: false,
              input: [
                { role: "system", content: buildAnalysisPrompt({ occasion: input.occasion }) },
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
          throw new AnalyzerUnavailableError();
        }

        try {
          return parseAnalysis(response.output_text);
        } catch {
          if (attempt === 1) throw new AnalyzerUnavailableError();
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
