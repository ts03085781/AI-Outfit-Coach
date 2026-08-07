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
const createObjectURL = vi.fn(() => "blob:local-preview");
const revokeObjectURL = vi.fn();

function analysisResponse(analysis = completeAnalysis) {
  return new Response(JSON.stringify({
    analysis,
    analysisToken: "signed-analysis-token",
  }), { status: 200 });
}

function chooseOccasionAndPhoto() {
  fireEvent.click(screen.getByRole("button", { name: "日常外出" }));
  fireEvent.change(screen.getByLabelText("上傳穿搭照片"), {
    target: { files: [new File(["outfit"], "outfit.jpg", { type: "image/jpeg" })] },
  });
}

beforeEach(() => {
  prepareImage.mockClear();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
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

  it("shows exact occasion labels and forwards low-burden optional context", async () => {
    vi.mocked(fetch).mockResolvedValue(analysisResponse());
    render(<HomePage />);

    expect(screen.getByRole("button", { name: "工作／面試" })).toBeVisible();
    expect(screen.getByRole("button", { name: "正式活動" })).toBeVisible();
    fireEvent.click(screen.getByText("加上選填背景"));
    fireEvent.change(screen.getByLabelText("天氣"), { target: { value: "rainy" } });
    fireEvent.change(screen.getByLabelText("地點環境"), { target: { value: "mixed" } });
    fireEvent.change(screen.getByLabelText("想呈現的感覺"), {
      target: { value: "專業但親切" },
    });
    fireEvent.click(screen.getByRole("button", { name: "工作／面試" }));
    fireEvent.change(screen.getByLabelText("上傳穿搭照片"), {
      target: { files: [new File(["outfit"], "outfit.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "繼續" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "繼續" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));
    await screen.findByRole("heading", { name: "你的穿搭建議" });

    const analyzeCall = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/analyze");
    const body = analyzeCall?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("occasion")).toBe("work");
    expect((body as FormData).get("weather")).toBe("rainy");
    expect((body as FormData).get("setting")).toBe("mixed");
    expect((body as FormData).get("desiredFeel")).toBe("專業但親切");
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
    expect(screen.getByRole("img", { name: "本機穿搭照片預覽" })).toHaveAttribute(
      "src",
      "blob:local-preview",
    );
    expect(screen.getByText(/供應商可能依濫用監控政策短期保留/)).toBeVisible();
    expect(screen.getByText(/離開或重新整理後，照片與結果都無法恢復/)).toBeVisible();
  });

  it("shows the complete result after analysis", async () => {
    vi.mocked(fetch).mockResolvedValue(analysisResponse());
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
    expect(screen.getByText(`預期效果：${completeAnalysis.suggestions[1].expected_effect}`)).toBeVisible();
    expect(screen.getByText(`預期效果：${completeAnalysis.suggestions[2].expected_effect}`)).toBeVisible();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:local-preview");
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) =>
      url === "/api/telemetry"
      && JSON.parse(String(init?.body)).type === "analysis_success"
    )).toBe(true);
  });

  it("does not render a primary suggestion card when the analysis has no suggestions", async () => {
    vi.mocked(fetch).mockResolvedValue(
      analysisResponse({ ...completeAnalysis, suggestions: [] }),
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
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) =>
      url === "/api/telemetry"
      && JSON.parse(String(init?.body)).type === "analysis_retake"
    )).toBe(true);
  });

  it("offers one follow-up and anonymous helpfulness feedback with no image upload", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/analyze") return analysisResponse();
      if (url === "/api/follow-up") {
        return new Response(JSON.stringify({ alternative: "調整袖口即可。" }), { status: 200 });
      }
      return new Response(null, { status: 204 });
    });
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
    expect(fetch).toHaveBeenCalledWith("/api/follow-up", expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/json" },
    }));
    const followUpCall = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/follow-up");
    expect(JSON.parse(String(followUpCall?.[1]?.body))).toMatchObject({
      analysisToken: "signed-analysis-token",
    });
    expect(screen.getByRole("button", { name: "取得替代方法" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "有幫助" }));
    expect(screen.getByText("謝謝你的回饋。")).toBeVisible();
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) =>
      url === "/api/telemetry"
      && JSON.parse(String(init?.body)).type === "feedback"
    )).toBe(true);
  });

  it("announces an API failure and lets the user try again", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network unavailable"));
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await waitFor(() => expect(screen.getByRole("button", { name: "繼續" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "繼續" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "我同意將這張照片用於本次穿搭分析" }));
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("分析服務暫時無法使用，請稍後再試一次。");
    expect(screen.getByRole("button", { name: "再試一次" })).toBeVisible();
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) =>
      url === "/api/telemetry"
      && JSON.parse(String(init?.body)).type === "analysis_error"
    )).toBe(true);
  });

  it.each([
    ["AI_REFUSED", "這張照片目前無法由模型分析，請改用清楚、完整的單人穿搭照。"],
    ["AI_AUTHORIZATION", "OpenAI 專案的額度或權限目前無法使用，請檢查 Platform 設定。"],
    ["AI_RATE_LIMITED", "目前分析次數較多，請稍後再試一次。"],
    ["AI_INVALID_RESPONSE", "模型回覆格式暫時異常，請再試一次。"],
    ["AI_TIMEOUT", "分析等待逾時，請再試一次。"],
  ])("shows an actionable message for %s", async (errorCode, message) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: errorCode }), { status: 503 }),
    );
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await waitFor(() => expect(screen.getByRole("button", { name: "繼續" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "繼續" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "我同意將這張照片用於本次穿搭分析" }));
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) =>
      url === "/api/telemetry"
      && JSON.parse(String(init?.body)).errorCode === errorCode,
    )).toBe(true);
  });

  it("gives every result control a visible focus style and at least 44px target", () => {
    expect(stylesheet).toMatch(/\.result-step[\s\S]*?button[\s\S]*?min-height:\s*44px/);
    expect(stylesheet).toMatch(/\.result-step[\s\S]*?textarea[\s\S]*?min-height:\s*(?:44|9\d)px/);
    expect(stylesheet).toMatch(/textarea:focus-visible/);
  });
});
