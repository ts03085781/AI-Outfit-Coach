// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";

import { PhotoCheckResultSchema } from "@/features/outfit/photo-check";
import {
  OpenAIPhotoChecker,
  PhotoCheckerProviderError,
  PhotoCheckerTimeoutError,
  type OpenAIPhotoCheckClient,
  type OpenAIPhotoCheckRequest,
} from "@/features/outfit/openai-photo-checker";

type FakeResponse = {
  output_text: string;
  output?: Array<{
    type: string;
    content?: Array<{ type: string }>;
  }>;
};

function createClient(outputs: Array<string | Error | FakeResponse>): OpenAIPhotoCheckClient {
  return {
    responses: {
      create: async () => {
        const output = outputs.shift();
        if (output instanceof Error) throw output;
        if (typeof output === "string") return { output_text: output };
        return output ?? { output_text: "" };
      },
    },
  };
}

function capturingClient(requests: OpenAIPhotoCheckRequest[]): OpenAIPhotoCheckClient {
  return {
    responses: {
      create: async (request) => {
        requests.push(request);
        return { output_text: JSON.stringify({ eligible: true, reason: null }) };
      },
    },
  };
}

function makeInput() {
  return { image: new Blob(["image-bytes"], { type: "image/webp" }) };
}

const reasons = [
  "NO_PERSON",
  "MULTIPLE_PEOPLE",
  "INCOMPLETE_OUTFIT",
  "OUTFIT_OBSTRUCTED",
  "TOO_DARK",
  "TOO_BLURRY",
  "NOT_OUTFIT_PHOTO",
  "INAPPROPRIATE_CONTENT",
  "CLOTHING_UNRECOGNIZABLE",
] as const;

afterEach(() => {
  delete process.env.OPENAI_PHOTO_CHECK_MODEL;
});

describe("OpenAIPhotoChecker", () => {
  it.each(reasons)("accepts the %s rejection", async (reason) => {
    process.env.OPENAI_PHOTO_CHECK_MODEL = "photo-check-test-model";
    const checker = new OpenAIPhotoChecker(createClient([
      JSON.stringify({ eligible: false, reason }),
    ]));

    await expect(checker.check(makeInput())).resolves.toEqual({ eligible: false, reason });
  });

  it.each([
    { eligible: true, reason: "TOO_DARK" },
    { eligible: false, reason: null },
    { eligible: true, reason: null, extra: "not allowed" },
  ])("rejects an inconsistent final result union: %j", (result) => {
    expect(PhotoCheckResultSchema.safeParse(result).success).toBe(false);
  });

  it("uses a cheap low-detail image request without user context", async () => {
    process.env.OPENAI_PHOTO_CHECK_MODEL = "photo-check-test-model";
    const requests: OpenAIPhotoCheckRequest[] = [];
    const checker = new OpenAIPhotoChecker(capturingClient(requests));

    await checker.check(makeInput());

    expect(requests[0]).toMatchObject({ model: "photo-check-test-model", store: false });
    expect(JSON.stringify(requests[0])).toContain('"detail":"low"');
    expect(JSON.stringify(requests[0])).not.toContain("occasion");
    expect(JSON.stringify(requests[0])).not.toContain("locale");
    expect(requests[0].text.format).toMatchObject({
      type: "json_schema",
      name: "photo_check",
      strict: true,
    });
  });

  it("retries once after invalid JSON and returns the second valid result", async () => {
    process.env.OPENAI_PHOTO_CHECK_MODEL = "photo-check-test-model";
    let calls = 0;
    const client: OpenAIPhotoCheckClient = {
      responses: {
        create: async () => {
          calls += 1;
          return {
            output_text: calls === 1
              ? "not-json"
              : JSON.stringify({ eligible: true, reason: null }),
          };
        },
      },
    };

    await expect(new OpenAIPhotoChecker(client).check(makeInput())).resolves.toEqual({
      eligible: true,
      reason: null,
    });
    expect(calls).toBe(2);
  });

  it("fails closed after two invalid structured outputs", async () => {
    process.env.OPENAI_PHOTO_CHECK_MODEL = "photo-check-test-model";
    let calls = 0;
    const client: OpenAIPhotoCheckClient = {
      responses: {
        create: async () => {
          calls += 1;
          return { output_text: "not-json" };
        },
      },
    };

    await expect(new OpenAIPhotoChecker(client).check(makeInput())).rejects.toMatchObject({
      code: "PHOTO_CHECK_INVALID_RESPONSE",
    } satisfies Partial<PhotoCheckerProviderError>);
    expect(calls).toBe(2);
  });

  it("does not retry a model refusal", async () => {
    process.env.OPENAI_PHOTO_CHECK_MODEL = "photo-check-test-model";
    let calls = 0;
    const client: OpenAIPhotoCheckClient = {
      responses: {
        create: async () => {
          calls += 1;
          return {
            output_text: "",
            output: [{ type: "message", content: [{ type: "refusal" }] }],
          };
        },
      },
    };

    await expect(new OpenAIPhotoChecker(client).check(makeInput())).rejects.toMatchObject({
      code: "PHOTO_CHECK_REFUSED",
    } satisfies Partial<PhotoCheckerProviderError>);
    expect(calls).toBe(1);
  });

  it("does not retry a provider transport failure and preserves allowlisted diagnostics", async () => {
    process.env.OPENAI_PHOTO_CHECK_MODEL = "photo-check-test-model";
    let calls = 0;
    const transportError = Object.assign(new Error("provider detail must not escape"), {
      status: 429,
      requestID: "req_photo_check",
    });
    const client: OpenAIPhotoCheckClient = {
      responses: {
        create: async () => {
          calls += 1;
          throw transportError;
        },
      },
    };

    await expect(new OpenAIPhotoChecker(client).check(makeInput())).rejects.toMatchObject({
      code: "PHOTO_CHECK_RATE_LIMITED",
      providerStatus: 429,
      requestId: "req_photo_check",
      message: "PHOTO_CHECK_RATE_LIMITED",
    } satisfies Partial<PhotoCheckerProviderError>);
    expect(calls).toBe(1);
  });

  it("maps an AbortError to PhotoCheckerTimeoutError without retrying", async () => {
    process.env.OPENAI_PHOTO_CHECK_MODEL = "photo-check-test-model";
    let calls = 0;
    const client: OpenAIPhotoCheckClient = {
      responses: {
        create: async () => {
          calls += 1;
          throw new DOMException("aborted", "AbortError");
        },
      },
    };

    await expect(new OpenAIPhotoChecker(client).check(makeInput())).rejects.toBeInstanceOf(
      PhotoCheckerTimeoutError,
    );
    expect(calls).toBe(1);
  });
});
