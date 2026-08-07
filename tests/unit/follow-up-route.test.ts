// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createFollowUpHandler,
  type FollowUpResponsesClient,
} from "@/features/outfit/follow-up-handler";

const completeAnalysis = {
  summary: "整體俐落。",
  strengths: ["配色協調", "比例清楚"],
  occasion_fit: "適合",
  suggestions: [],
  retake_required: false,
  retake_reason: null,
};

function request(body: unknown) {
  return new Request("http://localhost/api/follow-up", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function clientReturning(alternative: string): FollowUpResponsesClient {
  return {
    responses: {
      create: async () => ({ output_text: JSON.stringify({ alternative }) }),
    },
  };
}

function handleRequest(request: Request, client: FollowUpResponsesClient) {
  return createFollowUpHandler({ createClient: () => client })(request);
}

function makeOversizedRequest(contentLength?: string) {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify({
        analysis: { ...completeAnalysis, summary: "x".repeat(32 * 1024) },
        question: "還有其他方法嗎？",
      })));
    },
    cancel() {
      cancelled = true;
    },
  });
  const headers = new Headers({ "content-type": "application/json" });
  if (contentLength) headers.set("content-length", contentLength);

  return {
    request: new Request("http://localhost/api/follow-up", {
      method: "POST",
      headers,
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" }),
    wasCancelled: () => cancelled,
  };
}

describe("POST /api/follow-up", () => {
  afterEach(() => {
    delete process.env.OPENAI_VISION_MODEL;
    vi.restoreAllMocks();
  });

  it("returns one alternative for the current analysis and short question", async () => {
    process.env.OPENAI_VISION_MODEL = "follow-up-test-model";

    const response = await handleRequest(
      request({ analysis: completeAnalysis, question: "不買新衣服還能怎麼調整？" }),
      clientReturning("試著把袖口微微捲起，讓比例更輕盈。"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      alternative: "試著把袖口微微捲起，讓比例更輕盈。",
    });
  });

  it("rejects a question over 160 characters without calling the AI", async () => {
    process.env.OPENAI_VISION_MODEL = "follow-up-test-model";
    let calls = 0;
    const client: FollowUpResponsesClient = {
      responses: {
        create: async () => {
          calls += 1;
          return { output_text: JSON.stringify({ alternative: "不應使用" }) };
        },
      },
    };

    const response = await handleRequest(
      request({ analysis: completeAnalysis, question: "問".repeat(161) }),
      client,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_FOLLOW_UP" });
    expect(calls).toBe(0);
  });

  it("rejects a request carrying a new image without calling the AI", async () => {
    process.env.OPENAI_VISION_MODEL = "follow-up-test-model";
    let calls = 0;
    const client: FollowUpResponsesClient = {
      responses: {
        create: async () => {
          calls += 1;
          return { output_text: JSON.stringify({ alternative: "不應使用" }) };
        },
      },
    };

    const response = await handleRequest(
      request({ analysis: completeAnalysis, question: "還有其他方法嗎？", image: "base64" }),
      client,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_FOLLOW_UP" });
    expect(calls).toBe(0);
  });

  it("rejects an over-limit Content-Length before reading or calling the AI", async () => {
    process.env.OPENAI_VISION_MODEL = "follow-up-test-model";
    let calls = 0;
    const client: FollowUpResponsesClient = {
      responses: {
        create: async () => {
          calls += 1;
          return { output_text: JSON.stringify({ alternative: "不應使用" }) };
        },
      },
    };
    const normalRequest = request({ analysis: completeAnalysis, question: "還有其他方法嗎？" });

    const response = await handleRequest(
      new Request(normalRequest, { headers: { "content-length": String(32 * 1024 + 1) } }),
      client,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_FOLLOW_UP" });
    expect(calls).toBe(0);
  });

  it.each([undefined, "1"])(
    "rejects and cancels an over-limit stream with Content-Length %s before calling the AI",
    async (contentLength) => {
      process.env.OPENAI_VISION_MODEL = "follow-up-test-model";
      let calls = 0;
      const client: FollowUpResponsesClient = {
        responses: {
          create: async () => {
            calls += 1;
            return { output_text: JSON.stringify({ alternative: "不應使用" }) };
          },
        },
      };
      const oversized = makeOversizedRequest(contentLength);

      const response = await handleRequest(oversized.request, client);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "INVALID_FOLLOW_UP" });
      expect(oversized.wasCancelled()).toBe(true);
      expect(calls).toBe(0);
    },
  );

  it("uses a stateless structured Responses request without logging content", async () => {
    process.env.OPENAI_VISION_MODEL = "follow-up-test-model";
    let sentRequest: Parameters<FollowUpResponsesClient["responses"]["create"]>[0] | undefined;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const client: FollowUpResponsesClient = {
      responses: {
        create: async (nextRequest) => {
          sentRequest = nextRequest;
          return { output_text: JSON.stringify({ alternative: "調整袖口即可。" }) };
        },
      },
    };

    await handleRequest(
      request({ analysis: completeAnalysis, question: "私人追問內容" }),
      client,
    );

    expect(sentRequest).toMatchObject({ model: "follow-up-test-model", store: false });
    expect(sentRequest?.text.format.schema).toMatchObject({ type: "object" });
    expect(sentRequest?.text.format.schema).not.toHaveProperty("oneOf");
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
