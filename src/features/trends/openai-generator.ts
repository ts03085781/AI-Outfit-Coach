import OpenAI from "openai";
import { toJSONSchema } from "zod";

import { TrendResearchSchema, type TrendResearch } from "./domain";

type ResearchRequest = {
  model: string;
  store: false;
  input: string;
  tools: Array<{ type: "web_search_preview"; search_context_size: "medium" }>;
  text: {
    format: {
      type: "json_schema";
      name: "taiwan_fashion_trends";
      strict: true;
      schema: Record<string, unknown>;
    };
  };
};

type ImageRequest = {
  model: string;
  prompt: string;
  output_format: "png";
  size: "1024x1024";
  quality: "medium";
};

export interface TrendOpenAIClient {
  responses: {
    create(request: ResearchRequest): Promise<{ output_text: string }>;
  };
  images: {
    generate(request: ImageRequest): Promise<{ data?: Array<{ b64_json?: string | null }> }>;
  };
}

type TrendModels = {
  researchModel: string;
  imageModel: string;
};

const RESEARCH_SCHEMA = toJSONSchema(TrendResearchSchema) as Record<string, unknown>;

const RESEARCH_PROMPT = `Research the five fashion items currently gaining meaningful popularity in Taiwan.
Use recent, credible web sources and favor evidence published within the last 30 days. Avoid brands,
single-store promotions, celebrity gossip, and items supported by only one commercial seller.

For exactly five distinct wearable items, return:
- a stable lowercase kebab-case id
- concise names and useful descriptions in zh-TW, en, ja, and ko
- an English image_prompt describing only the item
- one to five HTTPS sources with an accurate page title and direct URL

The descriptions should explain why the item is timely for Taiwan's climate, street style, or season.
Do not fabricate sources. Every source must have been consulted during this web search.`;

function defaultClient(): TrendOpenAIClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  const client = new OpenAI({ apiKey });
  return {
    responses: {
      create: async (request) => {
        const response = await client.responses.create(request as never);
        return { output_text: response.output_text };
      },
    },
    images: {
      generate: async (request) => {
        const response = await client.images.generate(request as never);
        return {
          data: response.data?.map((item) => ({ b64_json: item.b64_json })),
        };
      },
    },
  };
}

function modelsFromEnvironment(): TrendModels {
  const researchModel = process.env.OPENAI_TRENDS_MODEL;
  const imageModel = process.env.OPENAI_IMAGE_MODEL;
  if (!researchModel || !imageModel) {
    throw new Error("OPENAI_TRENDS_MODEL and OPENAI_IMAGE_MODEL are required");
  }
  return { researchModel, imageModel };
}

export class OpenAITrendGenerator {
  constructor(
    private readonly client: TrendOpenAIClient = defaultClient(),
    private readonly models: TrendModels = modelsFromEnvironment(),
  ) {}

  async research(): Promise<TrendResearch> {
    const response = await this.client.responses.create({
      model: this.models.researchModel,
      store: false,
      input: RESEARCH_PROMPT,
      tools: [{ type: "web_search_preview", search_context_size: "medium" }],
      text: {
        format: {
          type: "json_schema",
          name: "taiwan_fashion_trends",
          strict: true,
          schema: RESEARCH_SCHEMA,
        },
      },
    });
    return TrendResearchSchema.parse(JSON.parse(response.output_text));
  }

  async generateImage(itemPrompt: string): Promise<Uint8Array> {
    const response = await this.client.images.generate({
      model: this.models.imageModel,
      output_format: "png",
      size: "1024x1024",
      quality: "medium",
      prompt: `${itemPrompt}. Consistent neutral studio product photography, centered single item, soft natural shadow, plain warm-gray background, no people, no logos, no text, no watermark.`,
    });
    const encoded = response.data?.[0]?.b64_json;
    if (!encoded) throw new Error("OpenAI image response did not contain image data");
    return Buffer.from(encoded, "base64");
  }
}
