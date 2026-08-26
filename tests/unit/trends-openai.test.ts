import { describe, expect, it, vi } from "vitest";

import { OpenAITrendGenerator } from "@/features/trends/openai-generator";

const translations = {
  "zh-TW": { name: "薄透風衣", description: "適合台灣換季與午後陣雨。" },
  en: { name: "Sheer windbreaker", description: "Made for Taiwan's shifting weather." },
  ja: { name: "シアーウィンドブレーカー", description: "台湾の変わりやすい天候に。" },
  ko: { name: "시어 윈드브레이커", description: "대만의 변덕스러운 날씨에 어울립니다." },
};

function researchOutput() {
  return JSON.stringify({
    items: Array.from({ length: 5 }, (_, index) => ({
      id: `trend-${index + 1}`,
      translations,
      image_prompt: `Product ${index + 1}`,
      sources: [{ title: "Source", url: `https://example.com/${index + 1}` }],
    })),
  });
}

describe("OpenAITrendGenerator", () => {
  it("researches five Taiwan trends using web search and structured output", async () => {
    const create = vi.fn().mockResolvedValue({ output_text: researchOutput() });
    const generator = new OpenAITrendGenerator({
      responses: { create },
      images: { generate: vi.fn() },
    }, { researchModel: "gpt-research", imageModel: "gpt-image" });

    const research = await generator.research();

    expect(research.items).toHaveLength(5);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-research",
      store: false,
      tools: [{ type: "web_search_preview", search_context_size: "medium" }],
      text: expect.objectContaining({
        format: expect.objectContaining({ type: "json_schema", strict: true }),
      }),
    }));
    expect(create.mock.calls[0][0].input).toContain("Taiwan");
    expect(create.mock.calls[0][0].input).toContain("zh-TW, en, ja, and ko");
  });

  it("generates an unbranded product image as PNG bytes", async () => {
    const generate = vi.fn().mockResolvedValue({
      data: [{ b64_json: Buffer.from("image-bytes").toString("base64") }],
    });
    const generator = new OpenAITrendGenerator({
      responses: { create: vi.fn() },
      images: { generate },
    }, { researchModel: "gpt-research", imageModel: "gpt-image" });

    const bytes = await generator.generateImage("A lightweight windbreaker");

    expect(Buffer.from(bytes).toString()).toBe("image-bytes");
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-image",
      output_format: "png",
      size: "1024x1024",
      quality: "medium",
      prompt: expect.stringMatching(/no people, no logos, no text/i),
    }));
  });

  it("fails closed when the image response has no bytes", async () => {
    const generator = new OpenAITrendGenerator({
      responses: { create: vi.fn() },
      images: { generate: vi.fn().mockResolvedValue({ data: [] }) },
    }, { researchModel: "gpt-research", imageModel: "gpt-image" });

    await expect(generator.generateImage("Product")).rejects.toThrow("image data");
  });
});
