import OpenAI from "openai";
import { toJSONSchema } from "zod";

import type { OutfitAnalyzer, AnalyzeInput } from "./analyzer";
import { OutfitAnalysisSchema, type OutfitAnalysis } from "./domain";
import { buildAnalysisPrompt } from "./prompts";

type OpenAIResponsesRequest = {
  model: string;
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

const ANALYSIS_JSON_SCHEMA = toJSONSchema(OutfitAnalysisSchema) as Record<string, unknown>;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function parseAnalysis(outputText: string): OutfitAnalysis {
  return OutfitAnalysisSchema.parse(JSON.parse(outputText));
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
