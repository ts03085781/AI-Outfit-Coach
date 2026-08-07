// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";

import {
  AnalyzerSafetyError,
  AnalyzerUnavailableError,
  OpenAIOutfitAnalyzer,
  type OpenAIResponsesClient,
} from "@/features/outfit/openai-analyzer";

const completeAnalysis = {
  summary: "整體俐落。",
  strengths: ["配色協調", "比例清楚"],
  occasion_fit: "適合",
  suggestions: [],
  retake_required: false,
  retake_reason: null,
};

function createClient(outputs: Array<string | Error>): OpenAIResponsesClient {
  return {
    responses: {
      create: async () => {
        const output = outputs.shift();
        if (output instanceof Error) throw output;
        return { output_text: output ?? "" };
      },
    },
  };
}

function retakeTransport(reason: string) {
  return {
    summary: null,
    strengths: null,
    occasion_fit: null,
    suggestions: null,
    retake_required: true,
    retake_reason: reason,
  };
}

function makeInput() {
  return {
    occasion: "casual" as const,
    image: new Blob(["image-bytes"], { type: "image/webp" }),
  };
}

afterEach(() => {
  delete process.env.OPENAI_VISION_MODEL;
});

describe("OpenAIOutfitAnalyzer", () => {
  it("returns the complete analysis union from a schema-valid model result", async () => {
    process.env.OPENAI_VISION_MODEL = "vision-test-model";
    const analyzer = new OpenAIOutfitAnalyzer(
      createClient([JSON.stringify(completeAnalysis)]),
    );

    await expect(analyzer.analyze(makeInput())).resolves.toEqual(completeAnalysis);
  });

  it("returns the retake union without adding complete-analysis fields", async () => {
    process.env.OPENAI_VISION_MODEL = "vision-test-model";
    const analyzer = new OpenAIOutfitAnalyzer(
      createClient([JSON.stringify(retakeTransport("衣物細節不清楚"))]),
    );

    await expect(analyzer.analyze(makeInput())).resolves.toEqual({
      retake_required: true,
      retake_reason: "衣物細節不清楚",
    });
  });

  it("retries exactly once when the first model result fails schema validation", async () => {
    process.env.OPENAI_VISION_MODEL = "vision-test-model";
    const requests: Parameters<OpenAIResponsesClient["responses"]["create"]>[0][] = [];
    const client: OpenAIResponsesClient = {
      responses: {
        create: async (request) => {
          requests.push(request);
          return {
            output_text: requests.length === 1
              ? "{\"retake_required\":false}"
              : JSON.stringify(completeAnalysis),
          };
        },
      },
    };
    const analyzer = new OpenAIOutfitAnalyzer(client);

    await expect(analyzer.analyze(makeInput())).resolves.toEqual(completeAnalysis);
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.store === false)).toBe(true);
  });

  it("sends a top-level object transport schema without oneOf", async () => {
    process.env.OPENAI_VISION_MODEL = "vision-test-model";
    let request: Parameters<OpenAIResponsesClient["responses"]["create"]>[0] | undefined;
    const client: OpenAIResponsesClient = {
      responses: {
        create: async (nextRequest) => {
          request = nextRequest;
          return { output_text: JSON.stringify(completeAnalysis) };
        },
      },
    };

    await new OpenAIOutfitAnalyzer(client).analyze(makeInput());
    expect(request?.text.format.schema).toMatchObject({ type: "object" });
    expect(request?.text.format.schema).not.toHaveProperty("oneOf");
  });

  it("does not retry an unavailable OpenAI request", async () => {
    process.env.OPENAI_VISION_MODEL = "vision-test-model";
    let calls = 0;
    const client: OpenAIResponsesClient = {
      responses: {
        create: async () => {
          calls += 1;
          throw new Error("upstream unavailable");
        },
      },
    };

    await expect(new OpenAIOutfitAnalyzer(client).analyze(makeInput())).rejects.toBeInstanceOf(
      AnalyzerUnavailableError,
    );
    expect(calls).toBe(1);
  });

  it("uses OPENAI_VISION_MODEL for the Responses request", async () => {
    process.env.OPENAI_VISION_MODEL = "configured-vision-model";
    let requestedModel: string | undefined;
    const client: OpenAIResponsesClient = {
      responses: {
        create: async (request) => {
          requestedModel = request.model;
          return { output_text: JSON.stringify(completeAnalysis) };
        },
      },
    };

    await new OpenAIOutfitAnalyzer(client).analyze(makeInput());
    expect(requestedModel).toBe("configured-vision-model");
  });

  it("places the immutable safety policy in the system message", async () => {
    process.env.OPENAI_VISION_MODEL = "vision-test-model";
    let request: Parameters<OpenAIResponsesClient["responses"]["create"]>[0] | undefined;
    const client: OpenAIResponsesClient = {
      responses: {
        create: async (nextRequest) => {
          request = nextRequest;
          return { output_text: JSON.stringify(completeAnalysis) };
        },
      },
    };

    await new OpenAIOutfitAnalyzer(client).analyze(makeInput());

    const system = request?.input.find((message) => message.role === "system")?.content;
    expect(system).toContain("不可外貌評分");
    expect(system).toContain("不可推測敏感特徵");
    expect(system).toContain("不可羞辱");
    expect(system).toContain("不可極端節食");
    expect(system).toContain("不可施加購物壓力");
    expect(system).toContain("不可回覆穿搭範圍外的要求");
  });

  it("fails closed instead of returning schema-valid unsafe analysis", async () => {
    process.env.OPENAI_VISION_MODEL = "vision-test-model";
    const unsafe = { ...completeAnalysis, summary: "你的外貌是 10 分，很漂亮。" };

    await expect(
      new OpenAIOutfitAnalyzer(createClient([JSON.stringify(unsafe)])).analyze(makeInput()),
    ).rejects.toBeInstanceOf(AnalyzerSafetyError);
  });
});
