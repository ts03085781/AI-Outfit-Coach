import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";

const { prepareImage } = vi.hoisted(() => ({ prepareImage: vi.fn(async (file: File) => file) }));

vi.mock("@/features/outfit/image", () => ({ prepareImage }));

const completeAnalysis = {
  summary: "俐落又舒服，適合今天的步調。",
  strengths: ["上衣與褲裝比例很平衡", "配色乾淨有精神"],
  occasion_fit: "適合",
  suggestions: [
    { action: "加一雙簡約鞋", reason: "讓視覺更完整", expected_effect: "整體更有精神" },
    { action: "換成素色包款", reason: "減少視覺雜訊", expected_effect: "輪廓更俐落" },
    { action: "捲起袖口", reason: "露出手腕", expected_effect: "比例更輕盈" },
  ],
  retake_required: false,
  retake_reason: null,
};

const stylesheet = readFileSync("src/app/globals.css", "utf8");

function chooseOccasionAndPhoto() {
  fireEvent.click(screen.getByRole("button", { name: "日常外出" }));
  fireEvent.change(screen.getByLabelText("上傳穿搭照片"), {
    target: { files: [new File(["outfit"], "outfit.jpg", { type: "image/jpeg" })] },
  });
}

beforeEach(() => {
  prepareImage.mockClear();
  vi.stubGlobal("fetch", vi.fn());
});

describe("outfit flow", () => {
  it("moves from occasion to a labelled camera photo step", () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "日常外出" }));

    expect(screen.getByRole("heading", { name: "拍下完整穿搭" })).toBeVisible();
    const photoInput = screen.getByLabelText("上傳穿搭照片");
    expect(photoInput).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(photoInput).toHaveAttribute("capture", "environment");
  });

  it("requires a photo before continuing to consent", async () => {
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "日常外出" }));

    expect(screen.getByRole("button", { name: "繼續" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("上傳穿搭照片"), {
      target: { files: [new File(["outfit"], "outfit.png", { type: "image/png" })] },
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "繼續" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "繼續" }));
    expect(screen.getByRole("heading", { name: "準備好開始分析" })).toBeVisible();
  });

  it("keeps analysis gated until the privacy consent is checked", async () => {
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await waitFor(() => expect(screen.getByRole("button", { name: "繼續" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "繼續" }));

    const analyze = screen.getByRole("button", { name: "開始分析" });
    expect(analyze).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "我同意將這張照片用於本次穿搭分析" }));
    expect(analyze).toBeEnabled();
  });

  it("shows the complete result after analysis", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(completeAnalysis), { status: 200 }));
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await waitFor(() => expect(screen.getByRole("button", { name: "繼續" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "繼續" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "我同意將這張照片用於本次穿搭分析" }));
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    expect(screen.getByRole("status")).toHaveTextContent("正在分析你的穿搭");
    expect(await screen.findByRole("heading", { name: "你的穿搭建議" })).toBeVisible();
    expect(screen.getByText(completeAnalysis.summary)).toBeVisible();
    expect(screen.getByText(completeAnalysis.strengths[0])).toBeVisible();
    expect(screen.getByText(completeAnalysis.strengths[1])).toBeVisible();
    expect(screen.getByText("場合適合度：適合")).toBeVisible();
    expect(screen.getByText(completeAnalysis.suggestions[0].action)).toBeVisible();
    const primarySuggestion = document.querySelector(".primary-suggestion");
    expect(primarySuggestion).toHaveTextContent(completeAnalysis.suggestions[0].action);
    expect(primarySuggestion).toHaveTextContent(completeAnalysis.suggestions[0].reason);
    expect(primarySuggestion).toHaveTextContent(completeAnalysis.suggestions[0].expected_effect);
    expect(document.querySelectorAll(".suggestion-list li")).toHaveLength(2);
  });

  it("does not render a primary suggestion card when the analysis has no suggestions", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ...completeAnalysis, suggestions: [] }), { status: 200 }),
    );
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await waitFor(() => expect(screen.getByRole("button", { name: "繼續" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "繼續" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "我同意將這張照片用於本次穿搭分析" }));
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    await screen.findByRole("heading", { name: "你的穿搭建議" });
    expect(document.querySelector(".primary-suggestion")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "可以試試" })).not.toBeInTheDocument();
  });

  it("keeps the consent label as a 44px minimum tap target associated with its checkbox", async () => {
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await waitFor(() => expect(screen.getByRole("button", { name: "繼續" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "繼續" }));

    expect(screen.getByLabelText("我同意將這張照片用於本次穿搭分析")).toBeVisible();
    expect(stylesheet).toMatch(/\.consent-label\s*\{[\s\S]*?min-height:\s*44px/);
  });

  it("shows only a retake reason and retake action when the photo needs retaking", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "RETAKE_REQUIRED", retake_reason: "衣物細節不清楚" }), { status: 422 }),
    );
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await waitFor(() => expect(screen.getByRole("button", { name: "繼續" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "繼續" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "我同意將這張照片用於本次穿搭分析" }));
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    expect(await screen.findByText("衣物細節不清楚")).toBeVisible();
    expect(screen.getByRole("button", { name: "重新拍照" })).toBeVisible();
    expect(screen.queryByText("場合適合度：適合")).not.toBeInTheDocument();
  });

  it("offers one follow-up and anonymous helpfulness feedback with no image upload", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(completeAnalysis), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ alternative: "調整袖口即可。" }), { status: 200 }));
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await waitFor(() => expect(screen.getByRole("button", { name: "繼續" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "繼續" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "我同意將這張照片用於本次穿搭分析" }));
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    await screen.findByRole("heading", { name: "你的穿搭建議" });
    fireEvent.change(screen.getByLabelText("想再問一個穿搭問題"), {
      target: { value: "不買新衣服還能怎麼調整？" },
    });
    fireEvent.click(screen.getByRole("button", { name: "取得替代方法" }));

    expect(await screen.findByText("調整袖口即可。")).toBeVisible();
    expect(fetch).toHaveBeenLastCalledWith("/api/follow-up", expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/json" },
    }));
    expect(screen.getByRole("button", { name: "取得替代方法" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "有幫助" }));
    expect(screen.getByText("謝謝你的回饋。")).toBeVisible();
  });

  it("announces an API failure and lets the user try again", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network unavailable"));
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await waitFor(() => expect(screen.getByRole("button", { name: "繼續" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "繼續" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "我同意將這張照片用於本次穿搭分析" }));
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("現在無法分析照片");
    expect(screen.getByRole("button", { name: "再試一次" })).toBeVisible();
  });
});
