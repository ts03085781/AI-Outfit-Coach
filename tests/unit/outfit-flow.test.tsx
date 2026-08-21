import { readFileSync } from "node:fs";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OutfitFlowPage } from "@/features/outfit/components/OutfitFlowPage";
import { useOutfitFlow } from "@/features/outfit/useOutfitFlow";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

const HomePage = () => <LocaleProvider><OutfitFlowPage /></LocaleProvider>;

const { prepareImage } = vi.hoisted(() => ({ prepareImage: vi.fn(async (file: File) => file) }));

vi.mock("@/features/outfit/image", () => ({ prepareImage }));

const completeAnalysis = {
  summary: "俐落又舒服，適合今天的步調。",
  strengths: ["上衣與褲裝比例很平衡", "配色乾淨有精神"],
  occasion_fit: "good",
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function analysisResponse(analysis = completeAnalysis) {
  return new Response(JSON.stringify({
    analysis,
    analysisToken: "signed-analysis-token",
  }), { status: 200 });
}

function photoCheckResponse(
  result:
    | { eligible: true; reason: null }
    | { eligible: false; reason: string } = { eligible: true, reason: null },
) {
  return new Response(JSON.stringify(result), { status: 200 });
}

function photoCheckErrorResponse(error: string, status = 503) {
  return new Response(JSON.stringify({ error }), { status });
}

function sessionResponse(user: { id: string } | null = { id: "user-1" }) {
  return new Response(JSON.stringify({ user }), { status: 200 });
}

function telemetryEvents() {
  return vi.mocked(fetch).mock.calls
    .filter(([url]) => url === "/api/telemetry")
    .map(([, init]) => JSON.parse(String(init?.body)) as { type: string });
}

function chooseOccasionAndPhoto(
  file = new File(["outfit"], "outfit.jpg", { type: "image/jpeg" }),
) {
  fireEvent.click(screen.getByRole("button", { name: "日常外出" }));
  fireEvent.change(document.querySelector("#outfit-photo") as HTMLInputElement, {
    target: { files: [file] },
  });
}

beforeEach(() => {
  document.cookie = "NEXT_LOCALE=; Path=/; Max-Age=0";
  localStorage.clear();
  Object.defineProperty(navigator, "language", { configurable: true, value: "zh-TW" });
  Object.defineProperty(navigator, "languages", { configurable: true, value: ["zh-TW"] });
  prepareImage.mockClear();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    if (url === "/api/photo-check") return photoCheckResponse();
    if (url === "/api/auth/session") return sessionResponse();
    if (url === "/api/analyze") return analysisResponse();
    return new Response(null, { status: 204 });
  }));
});

describe("outfit flow", () => {
  it("uses the editorial workflow shell and occasion option classes", () => {
    render(<HomePage />);

    expect(screen.getByRole("main")).toHaveClass("editorial-page", "analyze-shell");
    expect(screen.getByRole("button", { name: /日常外出/i })).toHaveClass("occasion-option");
  });

  it("keeps selected optional context in the first card", () => {
    render(<HomePage />);

    fireEvent.click(screen.getByText("加上選填背景"));
    fireEvent.change(screen.getByLabelText("天氣"), { target: { value: "rainy" } });
    fireEvent.change(screen.getByLabelText("地點環境"), { target: { value: "mixed" } });
    fireEvent.change(screen.getByLabelText("想呈現的感覺"), { target: { value: "專業但親切" } });
    expect(screen.getByRole("heading", { name: "今天要去哪裡？" })).toBeVisible();
    expect(screen.getByLabelText("天氣")).toHaveValue("rainy");
    expect(screen.getByLabelText("地點環境")).toHaveValue("mixed");
    expect(screen.getByLabelText("想呈現的感覺")).toHaveValue("專業但親切");
  });

  it("uses the shared editorial label for every optional context field", () => {
    render(<HomePage />);

    fireEvent.click(screen.getByText("加上選填背景"));

    for (const label of ["天氣", "地點環境", "想呈現的感覺"]) {
      expect(screen.getByText(label, { selector: ".editorial-label" })).toBeVisible();
    }
  });

  it("does not show a language selector or reserve its space in the first step", () => {
    render(<HomePage />);

    expect(screen.queryByLabelText("選擇語言")).not.toBeInTheDocument();
    expect(document.querySelector(".flow-card")).not.toHaveClass("has-language-select");
  });

  it("does not show a language selector in the photo or analyzing steps", async () => {
    const pendingResponse = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") return photoCheckResponse();
      if (url === "/api/auth/session") return sessionResponse();
      if (url === "/api/analyze") return pendingResponse.promise;
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "日常外出" }));
    expect(screen.queryByLabelText("選擇語言")).not.toBeInTheDocument();
    fireEvent.change(document.querySelector("#outfit-photo") as HTMLInputElement, {
      target: { files: [new File(["outfit"], "outfit.jpg", { type: "image/jpeg" })] },
    });
    await screen.findByRole("img", { name: "本機穿搭照片預覽" });
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    await screen.findByText("正在分析你的穿搭");
    const status = screen.getByRole("status");
    const spinner = status.querySelector("svg[aria-hidden='true']");
    expect(status).toHaveTextContent("正在分析你的穿搭");
    expect(spinner).toHaveClass("analyzing-spinner");
    expect(spinner?.parentElement).toHaveClass("analyzing-loader");
    expect(screen.queryByLabelText("選擇語言")).not.toBeInTheDocument();
    pendingResponse.resolve(analysisResponse());
    await screen.findByRole("heading", { name: "你的穿搭建議" });
  });

  it("shows one upload surface and hides the analysis action before a photo is prepared", () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "日常外出" }));

    expect(screen.getByRole("button", { name: "加入一張穿搭照" })).toBeVisible();
    expect(screen.getByText("JPG、PNG、WebP，單張照片")).toBeVisible();
    expect(screen.queryByRole("button", { name: "開始分析" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "拍照" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "選擇照片" })).not.toBeInTheDocument();

    const input = document.querySelector("#outfit-photo");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(input).not.toHaveAttribute("capture");
  });

  it("opens the shared file input from the empty upload surface", () => {
    const inputClick = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "日常外出" }));

    fireEvent.click(screen.getByRole("button", { name: "加入一張穿搭照" }));

    expect(inputClick).toHaveBeenCalledTimes(1);
    inputClick.mockRestore();
  });

  it("clears the shared input so the same file can be selected again", async () => {
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "日常外出" }));
    const input = document.querySelector("#outfit-photo") as HTMLInputElement;
    const file = new File(["outfit"], "outfit.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "value", {
      configurable: true,
      writable: true,
      value: "C:\\fakepath\\outfit.jpg",
    });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("shows replacement and analysis controls only after preparation succeeds", async () => {
    render(<HomePage />);
    chooseOccasionAndPhoto();

    expect(await screen.findByRole("img", { name: "本機穿搭照片預覽" })).toHaveAttribute(
      "src",
      "blob:local-preview",
    );
    expect(screen.getByRole("button", { name: "更換照片" })).toBeVisible();
    expect(screen.getByRole("button", { name: "開始分析" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "加入一張穿搭照" })).not.toBeInTheDocument();
  });

  it("locks analysis while checking, passes automatically, and never starts full analysis", async () => {
    const pendingCheck = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") return pendingCheck.promise;
      if (url === "/api/analyze") return analysisResponse();
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);

    chooseOccasionAndPhoto();

    expect(await screen.findByRole("status")).toHaveTextContent("正在檢查照片是否適合分析…");
    const start = screen.getByRole("button", { name: "開始分析" });
    expect(start).toBeDisabled();
    const precheckCall = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/photo-check");
    expect(precheckCall?.[1]).toMatchObject({ method: "POST" });
    expect(precheckCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(precheckCall?.[1]?.body).toBeInstanceOf(FormData);
    expect((precheckCall?.[1]?.body as FormData).get("image")).toBeInstanceOf(Blob);

    start.removeAttribute("disabled");
    fireEvent.click(start);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => url === "/api/analyze")).toBe(false);
    pendingCheck.resolve(photoCheckResponse());

    await waitFor(() => expect(start).toBeEnabled());
    expect(screen.getByRole("status")).toHaveTextContent("照片符合分析規格。");
    expect(vi.mocked(fetch).mock.calls.some(([url]) => url === "/api/analyze")).toBe(false);
    expect(telemetryEvents()).toContainEqual({
      type: "photo_check_pass",
      latencyBucket: "0-5s",
    });
  });

  it.each([
    ["NO_PERSON", "照片中沒有可辨識的人物，請更換照片。"],
    ["MULTIPLE_PEOPLE", "照片中有多位人物，請改用只有一人的照片。"],
    ["INCOMPLETE_OUTFIT", "請讓上衣與下身，或可辨識的連身服裝清楚可見。"],
    ["OUTFIT_OBSTRUCTED", "衣物被明顯遮擋，請重新拍攝上衣與下身清楚可見的照片。"],
    ["TOO_DARK", "照片太暗，請在光線充足處重新拍攝。"],
    ["TOO_BLURRY", "照片太模糊，請保持鏡頭穩定後重新拍攝。"],
    ["NOT_OUTFIT_PHOTO", "這不是可分析的穿搭照片，請更換照片。"],
    ["INAPPROPRIATE_CONTENT", "這張照片不符合服務規範，請更換穿搭照片。"],
    ["CLOTHING_UNRECOGNIZABLE", "無法可靠辨識衣物，請重新拍攝清楚的穿搭照。"],
  ])("announces the %s precheck rejection and keeps analysis locked", async (reason, message) => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") {
        return photoCheckResponse({ eligible: false, reason });
      }
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);

    chooseOccasionAndPhoto();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "開始分析" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "重新檢查" })).not.toBeInTheDocument();
    expect(telemetryEvents()).toContainEqual({
      type: "photo_check_reject",
      reason,
      latencyBucket: "0-5s",
    });
  });

  it.each([
    new Response(JSON.stringify({ eligible: true, reason: "NO_PERSON" }), { status: 200 }),
    new Response(JSON.stringify({ error: "UNKNOWN_ERROR" }), { status: 503 }),
  ])("fails closed when a precheck response violates its schema", async (response) => {
    vi.mocked(fetch).mockImplementation(async (url) => (
      url === "/api/photo-check" ? response : new Response(null, { status: 204 })
    ));
    render(<HomePage />);

    chooseOccasionAndPhoto();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "照片檢查暫時無法完成，請重新檢查。",
    );
    expect(screen.getByRole("button", { name: "開始分析" })).toBeDisabled();
    expect(telemetryEvents()).toContainEqual({
      type: "photo_check_error",
      errorCode: "INVALID_RESPONSE",
      latencyBucket: "0-5s",
    });
  });

  it.each([
    ["PHOTO_CHECK_TIMEOUT", "照片檢查逾時，請重新檢查。"],
    ["PHOTO_CHECK_UNAVAILABLE", "照片檢查暫時無法完成，請重新檢查。"],
    ["RATE_LIMITED", "照片檢查次數過多，請稍後再試。"],
  ])("announces the %s precheck error and offers retry", async (errorCode, message) => {
    vi.mocked(fetch).mockImplementation(async (url) => (
      url === "/api/photo-check"
        ? photoCheckErrorResponse(errorCode, errorCode === "RATE_LIMITED" ? 429 : 503)
        : new Response(null, { status: 204 })
    ));
    render(<HomePage />);

    chooseOccasionAndPhoto();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "重新檢查" })).toBeVisible();
    expect(screen.getByRole("button", { name: "開始分析" })).toBeDisabled();
    expect(telemetryEvents()).toContainEqual({
      type: "photo_check_error",
      errorCode,
      latencyBucket: "0-5s",
    });
  });

  it("retries the current prepared photo and unlocks analysis after success", async () => {
    let checks = 0;
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") {
        checks += 1;
        return checks === 1
          ? photoCheckErrorResponse("PHOTO_CHECK_UNAVAILABLE")
          : photoCheckResponse();
      }
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "重新檢查" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "開始分析" })).toBeEnabled());
    expect(checks).toBe(2);
  });

  it("clears a previous pass as soon as the photo is replaced", async () => {
    const pendingReplacement = deferred<File>();
    const pendingCheck = deferred<Response>();
    let checks = 0;
    prepareImage.mockImplementationOnce(async (file: File) => file)
      .mockImplementationOnce(() => pendingReplacement.promise);
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") {
        checks += 1;
        return checks === 1 ? photoCheckResponse() : pendingCheck.promise;
      }
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);
    chooseOccasionAndPhoto(new File(["first"], "first.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "開始分析" })).toBeEnabled());

    fireEvent.change(document.querySelector("#outfit-photo") as HTMLInputElement, {
      target: { files: [new File(["second"], "second.jpg", { type: "image/jpeg" })] },
    });

    expect(screen.queryByRole("button", { name: "開始分析" })).not.toBeInTheDocument();
    pendingReplacement.resolve(new File(["second"], "second.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("button", { name: "開始分析" })).toBeDisabled();
  });

  it("aborts a check when returning and ignores its late success and telemetry", async () => {
    const pendingCheck = deferred<Response>();
    let signal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (url === "/api/photo-check") {
        signal = init?.signal ?? undefined;
        return pendingCheck.promise;
      }
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await screen.findByRole("status");

    fireEvent.click(screen.getByRole("button", { name: "返回" }));
    expect(signal?.aborted).toBe(true);
    pendingCheck.resolve(photoCheckResponse());
    await Promise.resolve();
    fireEvent.click(screen.getByRole("button", { name: "日常外出" }));

    expect(screen.queryByRole("img", { name: "本機穿搭照片預覽" })).not.toBeInTheDocument();
    expect(telemetryEvents()).toEqual([]);
  });

  it("aborts and invalidates a pending check when the flow unmounts", async () => {
    const pendingCheck = deferred<Response>();
    let signal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (url === "/api/photo-check") {
        signal = init?.signal ?? undefined;
        return pendingCheck.promise;
      }
      return new Response(null, { status: 204 });
    });
    const { unmount } = render(<HomePage />);
    chooseOccasionAndPhoto();
    await screen.findByRole("status");

    unmount();

    expect(signal?.aborted).toBe(true);
    await act(async () => {
      pendingCheck.resolve(photoCheckResponse());
      await Promise.resolve();
    });
    expect(document.querySelector(".photo-check-status")).not.toBeInTheDocument();
    expect(telemetryEvents()).toEqual([]);
  });

  it("aborts rapid reselection and only the current check can unlock analysis", async () => {
    const firstCheck = deferred<Response>();
    const secondCheck = deferred<Response>();
    const signals: AbortSignal[] = [];
    let checks = 0;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (url === "/api/photo-check") {
        signals.push(init?.signal as AbortSignal);
        checks += 1;
        return checks === 1 ? firstCheck.promise : secondCheck.promise;
      }
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);
    chooseOccasionAndPhoto(new File(["first"], "first.jpg", { type: "image/jpeg" }));
    await screen.findByRole("status");

    fireEvent.change(document.querySelector("#outfit-photo") as HTMLInputElement, {
      target: { files: [new File(["second"], "second.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[0]?.aborted).toBe(true);
    secondCheck.resolve(photoCheckResponse());
    await waitFor(() => expect(screen.getByRole("button", { name: "開始分析" })).toBeEnabled());

    firstCheck.resolve(photoCheckResponse({ eligible: false, reason: "NO_PERSON" }));
    await Promise.resolve();
    expect(screen.queryByText("照片中沒有可辨識的人物，請更換照片。")).not.toBeInTheDocument();
    expect(telemetryEvents().filter(({ type }) => type.startsWith("photo_check"))).toEqual([
      { type: "photo_check_pass", latencyBucket: "0-5s" },
    ]);
  });

  it.each([
    [photoCheckResponse(), "photo_check_pass"],
    [photoCheckResponse({ eligible: false, reason: "NO_PERSON" }), "photo_check_reject"],
    [photoCheckErrorResponse("PHOTO_CHECK_TIMEOUT"), "photo_check_error"],
  ])("ignores an out-of-order stale outcome", async (staleResponse, staleEventType) => {
    const staleCheck = deferred<Response>();
    let checks = 0;
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") {
        checks += 1;
        return checks === 1 ? staleCheck.promise : photoCheckResponse();
      }
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);
    chooseOccasionAndPhoto(new File(["first"], "first.jpg", { type: "image/jpeg" }));
    await screen.findByRole("status");
    fireEvent.change(document.querySelector("#outfit-photo") as HTMLInputElement, {
      target: { files: [new File(["second"], "second.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "開始分析" })).toBeEnabled());

    staleCheck.resolve(staleResponse);
    await Promise.resolve();

    expect(screen.getByRole("button", { name: "開始分析" })).toBeEnabled();
    const photoEvents = telemetryEvents().filter(({ type }) => type.startsWith("photo_check"));
    expect(photoEvents).toHaveLength(1);
    if (staleEventType !== "photo_check_pass") {
      expect(photoEvents.some(({ type }) => type === staleEventType)).toBe(false);
    }
  });

  it("shows exact occasion labels and forwards low-burden optional context", async () => {
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
    fireEvent.change(document.querySelector("#outfit-photo") as HTMLInputElement, {
      target: { files: [new File(["outfit"], "outfit.jpg", { type: "image/jpeg" })] },
    });
    await screen.findByRole("img", { name: "本機穿搭照片預覽" });
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));
    await screen.findByRole("heading", { name: "你的穿搭建議" });

    const analyzeCall = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/analyze");
    const body = analyzeCall?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("occasion")).toBe("work");
    expect((body as FormData).get("weather")).toBe("rainy");
    expect((body as FormData).get("setting")).toBe("mixed");
    expect((body as FormData).get("desiredFeel")).toBe("專業但親切");
    expect((body as FormData).get("locale")).toBe("zh-TW");
  });

  it("shows a local preview and starts analysis when the action is pressed", async () => {
    render(<HomePage />);
    chooseOccasionAndPhoto();

    expect(await screen.findByRole("img", { name: "本機穿搭照片預覽" })).toHaveAttribute(
      "src",
      "blob:local-preview",
    );
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));
    expect(await screen.findByRole("heading", { name: "你的穿搭建議" })).toBeVisible();
  });

  it("shows the required-login dialog instead of analysis for a signed-out user", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") return photoCheckResponse();
      if (url === "/api/auth/session") return sessionResponse(null);
      if (url === "/api/analyze") return analysisResponse();
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await waitFor(() => expect(screen.getByRole("button", { name: "開始分析" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    expect(await screen.findByRole("alertdialog", { name: "登入後開始分析" })).toBeVisible();
    expect(screen.getAllByRole("link")).toEqual([
      screen.getByRole("link", { name: "前往登入" }),
    ]);
    const loginLink = screen.getByRole("link", { name: "前往登入" });
    expect(loginLink).toHaveAttribute("href", "/login?next=/analyze&reason=analysis");
    expect(document.activeElement).toBe(loginLink);
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Tab" });
    expect(document.activeElement).toBe(loginLink);
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(screen.getByRole("alertdialog", { name: "登入後開始分析" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /取消|關閉|稍後/ })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith("/api/analyze", expect.anything());
  });

  it("treats an invalid session summary as signed out", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") return photoCheckResponse();
      if (url === "/api/auth/session") return sessionResponse({ id: "" });
      if (url === "/api/analyze") return analysisResponse();
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await waitFor(() => expect(screen.getByRole("button", { name: "開始分析" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    expect(await screen.findByRole("alertdialog", { name: "登入後開始分析" })).toBeVisible();
    expect(fetch).not.toHaveBeenCalledWith("/api/analyze", expect.anything());
  });

  it("disables analysis while the login check is pending", async () => {
    const pendingSession = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") return photoCheckResponse();
      if (url === "/api/auth/session") return pendingSession.promise;
      if (url === "/api/analyze") return analysisResponse();
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await waitFor(() => expect(screen.getByRole("button", { name: "開始分析" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    expect(screen.getByRole("button", { name: "開始分析" })).toBeDisabled();
    pendingSession.resolve(sessionResponse());
    expect(await screen.findByRole("heading", { name: "你的穿搭建議" })).toBeVisible();
  });

  it("shows the required-login dialog when analysis returns 401 after a valid session", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") return photoCheckResponse();
      if (url === "/api/auth/session") return sessionResponse();
      if (url === "/api/analyze") return new Response(null, { status: 401 });
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await waitFor(() => expect(screen.getByRole("button", { name: "開始分析" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    expect(await screen.findByRole("alertdialog", { name: "登入後開始分析" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "分析暫時中斷" })).not.toBeInTheDocument();
    expect(screen.queryByText("分析服務暫時無法使用，請稍後再試一次。")).not.toBeInTheDocument();
  });

  it("does not restore a photo whose preparation completes after returning to occasion", async () => {
    const pendingImage = deferred<File>();
    prepareImage.mockImplementationOnce(() => pendingImage.promise);
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "日常外出" }));
    fireEvent.change(document.querySelector("#outfit-photo") as HTMLInputElement, {
      target: { files: [new File(["outfit"], "outfit.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "返回" }));
    pendingImage.resolve(new File(["outfit"], "outfit.jpg", { type: "image/jpeg" }));
    await Promise.resolve();
    fireEvent.click(screen.getByRole("button", { name: "日常外出" }));

    expect(screen.queryByRole("img", { name: "本機穿搭照片預覽" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "開始分析" })).not.toBeInTheDocument();
  });

  it("clears the old photo while a replacement is still being prepared", async () => {
    const pendingReplacement = deferred<File>();
    prepareImage.mockImplementationOnce(async (file: File) => file)
      .mockImplementationOnce(() => pendingReplacement.promise);
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "日常外出" }));
    const input = document.querySelector("#outfit-photo") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["old"], "old.jpg", { type: "image/jpeg" })] },
    });
    await screen.findByRole("img", { name: "本機穿搭照片預覽" });
    fireEvent.change(input, {
      target: { files: [new File(["new"], "new.jpg", { type: "image/jpeg" })] },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "加入一張穿搭照" })).toBeVisible();
      expect(screen.queryByRole("img", { name: "本機穿搭照片預覽" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "開始分析" })).not.toBeInTheDocument();
    });
    expect(vi.mocked(fetch).mock.calls.some(([url]) => url === "/api/analyze")).toBe(false);

    pendingReplacement.resolve(new File(["new"], "new.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("button", { name: "開始分析" })).toBeVisible();
  });

  it("shows the complete result after analysis", async () => {
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await screen.findByRole("img", { name: "本機穿搭照片預覽" });
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    expect(await screen.findByRole("heading", { name: "你的穿搭建議" })).toBeVisible();
    const resultPhoto = await screen.findByRole("img", { name: "本次分析的穿搭照片" });
    expect(resultPhoto).toBeVisible();
    expect(resultPhoto).toHaveClass("result-photo");
    expect(stylesheet).toMatch(/\.result-photo\s*\{[\s\S]*?width:\s*100%/);
    expect(stylesheet).toMatch(/\.result-photo\s*\{[\s\S]*?height:\s*18rem/);
    expect(stylesheet).toMatch(/\.result-photo\s*\{[\s\S]*?object-fit:\s*contain/);
    const resultSummary = document.querySelector<HTMLElement>(".result-summary");
    expect(resultSummary).toBeInTheDocument();
    expect(resultSummary).toHaveClass("editorial-card", "result-summary");
    const resultAnalysis = document.querySelector<HTMLElement>(".result-analysis");
    expect(resultAnalysis).toContainElement(resultSummary);
    const resultNavigation = screen.getByRole("navigation", { name: "重新開始" });
    expect(resultNavigation).toBeVisible();
    expect(resultNavigation).toHaveClass("result-navigation");
    expect(resultAnalysis).toContainElement(resultNavigation);
    expect(screen.getByRole("button", { name: "重新選擇照片" }))
      .toHaveClass("button-secondary");
    expect(screen.getByRole("button", { name: "返回第一步驟" }))
      .toHaveClass("button-primary");
    expect(screen.getByText(completeAnalysis.summary)).toBeVisible();
    const resultStrengths = document.querySelector<HTMLElement>(".result-strengths");
    expect(resultAnalysis).toContainElement(resultStrengths);
    expect(resultStrengths).toContainElement(screen.getByText(completeAnalysis.strengths[0]));
    expect(resultStrengths).toContainElement(screen.getByText(completeAnalysis.strengths[1]));
    expect(screen.getByText("場合適合度：適合")).toBeVisible();
    expect(screen.getByText(completeAnalysis.suggestions[0].action)).toBeVisible();
    const primarySuggestion = document.querySelector(".primary-suggestion");
    expect(primarySuggestion).toHaveTextContent(completeAnalysis.suggestions[0].action);
    expect(primarySuggestion).toHaveTextContent(completeAnalysis.suggestions[0].reason);
    expect(primarySuggestion).toHaveTextContent(completeAnalysis.suggestions[0].expected_effect);
    expect(document.querySelectorAll(".suggestion-list li")).toHaveLength(2);
    expect(screen.getByText(`預期效果：${completeAnalysis.suggestions[1].expected_effect}`)).toBeVisible();
    expect(screen.getByText(`預期效果：${completeAnalysis.suggestions[2].expected_effect}`)).toBeVisible();
    const feedbackActions = document.querySelector(".feedback-actions");
    expect(feedbackActions).toContainElement(screen.getByRole("button", { name: "有幫助" }));
    expect(feedbackActions).toContainElement(screen.getByRole("button", { name: "沒幫助" }));
    expect(screen.getByRole("button", { name: "有幫助" })).toHaveClass("button-secondary");
    expect(screen.getByRole("button", { name: "沒幫助" })).toHaveClass("button-secondary");
    expect(stylesheet).toMatch(/\.result-photo\s*\{[\s\S]*?filter:\s*none/);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:local-preview");
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) =>
      url === "/api/telemetry"
      && JSON.parse(String(init?.body)).type === "analysis_success"
    )).toBe(true);

    revokeObjectURL.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "重新選擇照片" }));
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:local-preview");
  });

  it("does not render a primary suggestion card when the analysis has no suggestions", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") return photoCheckResponse();
      if (url === "/api/auth/session") return sessionResponse();
      if (url === "/api/analyze") {
        return analysisResponse({ ...completeAnalysis, suggestions: [] });
      }
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await screen.findByRole("img", { name: "本機穿搭照片預覽" });
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    await screen.findByRole("heading", { name: "你的穿搭建議" });
    expect(document.querySelector(".primary-suggestion")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "可以試試" })).not.toBeInTheDocument();
  });

  it("keeps the start-analysis button as an accessible primary tap target", async () => {
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await screen.findByRole("img", { name: "本機穿搭照片預覽" });

    expect(screen.getByRole("button", { name: "開始分析" })).toBeVisible();
    expect(stylesheet).toMatch(/\.primary-action\s*\{[\s\S]*?min-height:\s*52px/);
    expect(stylesheet).toMatch(/\.photo-analyze:focus-visible/);
    expect(stylesheet).toMatch(/\.photo-check-retry\s*\{[\s\S]*?min-height:\s*44px/);
    expect(stylesheet).toMatch(/\.photo-check-retry:focus-visible/);
  });

  it("shows only a retake reason and retake action when the photo needs retaking", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") return photoCheckResponse();
      if (url === "/api/auth/session") return sessionResponse();
      if (url === "/api/analyze") {
        return new Response(
          JSON.stringify({ error: "RETAKE_REQUIRED", retake_reason: "衣物細節不清楚" }),
          { status: 422 },
        );
      }
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await screen.findByRole("img", { name: "本機穿搭照片預覽" });
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    expect(await screen.findByText("衣物細節不清楚")).toBeVisible();
    expect(screen.queryByRole("img", { name: "本次分析的穿搭照片" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新拍照" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "重新選擇照片" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "返回第一步驟" })).not.toBeInTheDocument();
    expect(screen.queryByText("場合適合度：適合")).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) =>
      url === "/api/telemetry"
      && JSON.parse(String(init?.body)).type === "analysis_retake"
    )).toBe(true);
  });

  it("preserves the analyzed photo while invalidating its passed check", async () => {
    const { result: flow } = renderHook(() => useOutfitFlow("zh-TW"));
    const image = new File(["outfit"], "outfit.jpg", { type: "image/jpeg" });

    act(() => flow.current.chooseOccasion("casual"));
    await act(() => flow.current.choosePhoto(image));
    await waitFor(() => expect(flow.current.photoCheckState).toEqual({ status: "passed" }));
    act(() => flow.current.setConsented(true));
    await act(() => flow.current.analyze());

    expect(flow.current.state).toBe("result");
    expect(flow.current.image).toBe(image);
    expect(flow.current.photoCheckState).toEqual({ status: "idle" });
  });

  it("invalidates the passed photo check after a terminal 422 retake", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") return photoCheckResponse();
      if (url === "/api/analyze") {
        return new Response(
          JSON.stringify({ error: "RETAKE_REQUIRED", retake_reason: "衣物細節不清楚" }),
          { status: 422 },
        );
      }
      return new Response(null, { status: 204 });
    });
    const { result: flow } = renderHook(() => useOutfitFlow("zh-TW"));
    const image = new File(["outfit"], "outfit.jpg", { type: "image/jpeg" });

    act(() => flow.current.chooseOccasion("casual"));
    await act(() => flow.current.choosePhoto(image));
    await waitFor(() => expect(flow.current.photoCheckState).toEqual({ status: "passed" }));
    act(() => flow.current.setConsented(true));
    await act(() => flow.current.analyze());

    expect(flow.current.state).toBe("result");
    expect(flow.current.image).toBeUndefined();
    expect(flow.current.photoCheckState).toEqual({ status: "idle" });
  });

  it("preserves the passed photo after a transient analysis error so retry can succeed", async () => {
    let analyzeAttempts = 0;
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") return photoCheckResponse();
      if (url === "/api/analyze") {
        analyzeAttempts += 1;
        if (analyzeAttempts === 1) {
          return new Response(JSON.stringify({ error: "AI_UNAVAILABLE" }), { status: 503 });
        }
        return analysisResponse();
      }
      return new Response(null, { status: 204 });
    });
    const { result: flow } = renderHook(() => useOutfitFlow("zh-TW"));
    const image = new File(["outfit"], "outfit.jpg", { type: "image/jpeg" });

    act(() => flow.current.chooseOccasion("casual"));
    await act(() => flow.current.choosePhoto(image));
    await waitFor(() => expect(flow.current.photoCheckState).toEqual({ status: "passed" }));
    act(() => flow.current.setConsented(true));
    await act(() => flow.current.analyze());

    expect(flow.current.state).toBe("error");
    expect(flow.current.image).toBe(image);
    expect(flow.current.photoCheckState).toEqual({ status: "passed" });

    await act(() => flow.current.analyze());

    expect(flow.current.state).toBe("result");
    expect(analyzeAttempts).toBe(2);
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/photo-check")).toHaveLength(1);
  });

  it("sends anonymous helpfulness feedback with no image upload", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") return photoCheckResponse();
      if (url === "/api/auth/session") return sessionResponse();
      if (url === "/api/analyze") return analysisResponse();
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await screen.findByRole("img", { name: "本機穿搭照片預覽" });
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    await screen.findByRole("heading", { name: "你的穿搭建議" });
    fireEvent.click(screen.getByRole("button", { name: "有幫助" }));
    expect(screen.getByText("謝謝你的回饋。")).toBeVisible();
    expect(screen.getByRole("button", { name: "有幫助" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "沒幫助" })).toBeDisabled();
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) =>
      url === "/api/telemetry"
      && JSON.parse(String(init?.body)).type === "feedback"
    )).toBe(true);
  });

  it("keeps follow-up controls hidden from the result UI", async () => {
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await screen.findByRole("img", { name: "本機穿搭照片預覽" });
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    await screen.findByRole("heading", { name: "你的穿搭建議" });
    expect(screen.queryByLabelText("想再問一個穿搭問題")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取得替代方法" })).not.toBeInTheDocument();
  });

  it("announces an API failure and lets the user try again", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") return photoCheckResponse();
      if (url === "/api/auth/session") return sessionResponse();
      if (url === "/api/analyze") throw new Error("network unavailable");
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await screen.findByRole("img", { name: "本機穿搭照片預覽" });
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("分析服務暫時無法使用，請稍後再試一次。");
    expect(screen.getByRole("button", { name: "再試一次" })).toBeVisible();
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) =>
      url === "/api/telemetry"
      && JSON.parse(String(init?.body)).type === "analysis_error"
    )).toBe(true);
  });

  it("disables the error retry and marks it busy while it checks authentication", async () => {
    const pendingRetrySession = deferred<Response>();
    let sessionChecks = 0;
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") return photoCheckResponse();
      if (url === "/api/auth/session") {
        sessionChecks += 1;
        return sessionChecks === 1 ? sessionResponse() : pendingRetrySession.promise;
      }
      if (url === "/api/analyze") {
        return new Response(JSON.stringify({ error: "AI_UNAVAILABLE" }), { status: 503 });
      }
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await screen.findByRole("img", { name: "本機穿搭照片預覽" });
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "再試一次" }));

    const retry = screen.getByRole("button", { name: "再試一次" });
    expect(retry).toBeDisabled();
    expect(retry).toHaveAttribute("aria-busy", "true");
    retry.removeAttribute("disabled");
    fireEvent.click(retry);
    expect(sessionChecks).toBe(2);

    pendingRetrySession.resolve(sessionResponse());
    await screen.findByRole("alert");
  });

  it.each([
    ["AI_REFUSED", "這張照片目前無法由模型分析，請改用清楚、完整的單人穿搭照。"],
    ["AI_AUTHORIZATION", "OpenAI 專案的額度或權限目前無法使用，請檢查 Platform 設定。"],
    ["AI_RATE_LIMITED", "目前分析次數較多，請稍後再試一次。"],
    ["AI_INVALID_RESPONSE", "模型回覆格式暫時異常，請再試一次。"],
    ["AI_TIMEOUT", "分析等待逾時，請再試一次。"],
  ])("shows an actionable message for %s", async (errorCode, message) => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") return photoCheckResponse();
      if (url === "/api/auth/session") return sessionResponse();
      if (url === "/api/analyze") {
        return new Response(JSON.stringify({ error: errorCode }), { status: 503 });
      }
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);
    chooseOccasionAndPhoto();
    await screen.findByRole("img", { name: "本機穿搭照片預覽" });
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

  it("returns to photo selection without discarding optional context", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === "/api/photo-check") return photoCheckResponse();
      if (url === "/api/auth/session") return sessionResponse();
      if (url === "/api/analyze") return analysisResponse();
      return new Response(null, { status: 204 });
    });
    render(<HomePage />);

    fireEvent.click(screen.getByText("加上選填背景"));
    fireEvent.change(screen.getByLabelText("天氣"), { target: { value: "rainy" } });
    fireEvent.change(screen.getByLabelText("地點環境"), { target: { value: "mixed" } });
    fireEvent.change(screen.getByLabelText("想呈現的感覺"), { target: { value: "專業但親切" } });
    chooseOccasionAndPhoto();
    await screen.findByRole("img", { name: "本機穿搭照片預覽" });
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));
    await screen.findByRole("heading", { name: "你的穿搭建議" });
    fireEvent.click(screen.getByRole("button", { name: "有幫助" }));
    expect(screen.getByText("謝謝你的回饋。")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "重新選擇照片" }));

    expect(screen.getByRole("heading", { name: "拍下你的穿搭" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "你的穿搭建議" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "開始分析" })).not.toBeInTheDocument();

    fireEvent.change(document.querySelector("#outfit-photo") as HTMLInputElement, {
      target: { files: [new File(["outfit-two"], "outfit-two.jpg", { type: "image/jpeg" })] },
    });
    await screen.findByRole("img", { name: "本機穿搭照片預覽" });
    expect(screen.getByRole("button", { name: "開始分析" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));
    await screen.findByRole("heading", { name: "你的穿搭建議" });
    expect(screen.getByRole("button", { name: "有幫助" })).toBeEnabled();
    expect(screen.queryByText("謝謝你的回饋。")).not.toBeInTheDocument();

    const analysisCalls = vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/analyze");
    const secondBody = analysisCalls[1]?.[1]?.body;
    expect(secondBody).toBeInstanceOf(FormData);
    expect((secondBody as FormData).get("weather")).toBe("rainy");
    expect((secondBody as FormData).get("setting")).toBe("mixed");
    expect((secondBody as FormData).get("desiredFeel")).toBe("專業但親切");
  });

  it("returns to the first step with all optional context cleared", async () => {
    render(<HomePage />);

    fireEvent.click(screen.getByText("加上選填背景"));
    fireEvent.change(screen.getByLabelText("天氣"), { target: { value: "rainy" } });
    fireEvent.change(screen.getByLabelText("地點環境"), { target: { value: "mixed" } });
    fireEvent.change(screen.getByLabelText("想呈現的感覺"), { target: { value: "專業但親切" } });
    chooseOccasionAndPhoto();
    await screen.findByRole("img", { name: "本機穿搭照片預覽" });
    fireEvent.click(screen.getByRole("button", { name: "開始分析" }));
    await screen.findByRole("heading", { name: "你的穿搭建議" });

    fireEvent.click(screen.getByRole("button", { name: "返回第一步驟" }));

    expect(screen.getByRole("heading", { name: "今天要去哪裡？" })).toBeVisible();
    fireEvent.click(screen.getByText("加上選填背景"));
    expect(screen.getByLabelText("天氣")).toHaveValue("");
    expect(screen.getByLabelText("地點環境")).toHaveValue("");
    expect(screen.getByLabelText("想呈現的感覺")).toHaveValue("");
  });

  it("returns from the combined photo step without discarding optional context", async () => {
    render(<HomePage />);

    fireEvent.click(screen.getByText("加上選填背景"));
    fireEvent.change(screen.getByLabelText("天氣"), { target: { value: "rainy" } });
    fireEvent.change(screen.getByLabelText("地點環境"), { target: { value: "mixed" } });
    fireEvent.change(screen.getByLabelText("想呈現的感覺"), { target: { value: "專業但親切" } });
    chooseOccasionAndPhoto();
    await screen.findByRole("img", { name: "本機穿搭照片預覽" });

    fireEvent.click(screen.getByRole("button", { name: "返回" }));

    expect(screen.getByRole("heading", { name: "今天要去哪裡？" })).toBeVisible();
    fireEvent.click(screen.getByText("加上選填背景"));
    expect(screen.getByLabelText("天氣")).toHaveValue("rainy");
    expect(screen.getByLabelText("地點環境")).toHaveValue("mixed");
    expect(screen.getByLabelText("想呈現的感覺")).toHaveValue("專業但親切");
    fireEvent.click(screen.getByRole("button", { name: "日常外出" }));
    expect(screen.queryByRole("img", { name: "本機穿搭照片預覽" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "開始分析" })).not.toBeInTheDocument();
  });

  it("styles result navigation buttons as accessible secondary actions", () => {
    expect(stylesheet).toMatch(/\.result-navigation\s*\{[\s\S]*?(?:display:\s*(?:grid|flex))/);
    expect(stylesheet).toMatch(/\.result-navigation\s+button\s*\{[\s\S]*?min-height:\s*44px/);
    expect(stylesheet).toMatch(/\.result-navigation\s+button:focus-visible/);
  });
});
