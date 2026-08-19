import { describe, expect, it } from "vitest";

import { resolveLocale, resolveLocaleList } from "@/lib/i18n/config";
import { messages } from "@/lib/i18n/messages";

describe("locale resolution", () => {
  it("uses the first supported browser language instead of the first listed language", () => {
    expect(resolveLocaleList(["fr-FR", "ja-JP", "en-US"])).toBe("ja");
  });

  it("maps Traditional Chinese browser variants to zh-TW", () => {
    expect(resolveLocale("zh-Hant")).toBe("zh-TW");
  });
});

describe("login messages", () => {
  const keys = [
    "loginTitle",
    "loginDescription",
    "googleButton",
    "privacy",
    "loading",
    "oauthError",
    "requiredTitle",
    "requiredDescription",
    "goToLogin",
    "loginSuccess",
  ] as const;

  it.each(["zh-TW", "en", "ja", "ko"] as const)("provides the complete auth message shape for %s", (locale) => {
    expect(Object.keys(messages[locale].auth).sort()).toEqual([...keys].sort());
  });

  it("provides the required Traditional Chinese login-gate copy", () => {
    expect(messages["zh-TW"].auth).toMatchObject({
      requiredTitle: "登入後開始分析",
      requiredDescription: "你尚未登入 AI StyleCue，請先登入才能開始穿搭分析。",
      goToLogin: "前往登入",
      loginSuccess: "登入成功，請重新選擇照片開始分析。",
    });
  });
});

describe("photo precheck messages", () => {
  it.each([
    ["zh-TW", {
      title: "拍下你的穿搭",
      description: "請讓上衣與下身，或連身服裝清楚入鏡，若能讓鞋子與頭部也入鏡，分析結果會更精準唷 ❤️。",
      addPhoto: "加入一張穿搭照",
      checking: "正在檢查照片是否適合分析…",
      passed: "照片符合分析規格。",
      retryCheck: "重新檢查",
      checkError: "照片檢查暫時無法完成，請重新檢查。",
      checkTimeout: "照片檢查逾時，請重新檢查。",
      checkRateLimited: "照片檢查次數過多，請稍後再試。",
      providerPrivacy: "選取照片後會傳給 AI 供應商檢查是否符合規格；按下「開始分析」後才會進行完整穿搭分析。供應商可能依濫用監控政策短期保留，實際期限上線前仍須確認。",
      localPrivacy: "本服務不建立照片或結果紀錄。離開或重新整理後，照片與結果都無法恢復。",
      reason: {
        NO_PERSON: "照片中沒有可辨識的人物，請更換照片。",
        MULTIPLE_PEOPLE: "照片中有多位人物，請改用只有一人的照片。",
        INCOMPLETE_OUTFIT: "請讓上衣與下身，或可辨識的連身服裝清楚可見。",
        OUTFIT_OBSTRUCTED: "衣物被明顯遮擋，請重新拍攝上衣與下身清楚可見的照片。",
        TOO_DARK: "照片太暗，請在光線充足處重新拍攝。",
        TOO_BLURRY: "照片太模糊，請保持鏡頭穩定後重新拍攝。",
        NOT_OUTFIT_PHOTO: "這不是可分析的穿搭照片，請更換照片。",
        INAPPROPRIATE_CONTENT: "這張照片不符合服務規範，請更換穿搭照片。",
        CLOTHING_UNRECOGNIZABLE: "無法可靠辨識衣物，請重新拍攝清楚的穿搭照。",
      },
    }],
    ["en", {
      title: "Capture your outfit",
      description: "Please show your top and bottom, or a one-piece outfit, clearly. If you can include footwear and your head too, the analysis will be more accurate ❤️.",
      addPhoto: "Add an outfit photo",
      checking: "Checking whether this photo is ready for analysis…",
      passed: "This photo is ready for analysis.",
      retryCheck: "Check again",
      checkError: "We couldn’t check this photo right now. Please try again.",
      checkTimeout: "The photo check timed out. Please try again.",
      checkRateLimited: "There have been too many photo checks. Please try again later.",
      providerPrivacy: "After you select a photo, it is sent to the AI provider to check whether it meets the requirements. Full outfit analysis starts only after you press “Start analysis.” The provider may keep it briefly for abuse monitoring; confirm the exact retention period before launch.",
      localPrivacy: "This service does not keep photos or results. They cannot be restored after you leave or refresh.",
      reason: {
        NO_PERSON: "We couldn’t identify a person in this photo. Please choose another photo.",
        MULTIPLE_PEOPLE: "This photo includes more than one person. Please choose a photo with one person.",
        INCOMPLETE_OUTFIT: "Show your top and bottom, or a recognizable one-piece outfit, clearly.",
        OUTFIT_OBSTRUCTED: "The clothing is blocked from view. Retake the photo with your top and bottom clearly visible.",
        TOO_DARK: "This photo is too dark. Please retake it in better lighting.",
        TOO_BLURRY: "This photo is too blurry. Hold the camera steady and retake it.",
        NOT_OUTFIT_PHOTO: "This is not an outfit photo we can analyze. Please choose another photo.",
        INAPPROPRIATE_CONTENT: "This photo does not meet the service guidelines. Please choose an outfit photo.",
        CLOTHING_UNRECOGNIZABLE: "We can’t reliably identify the clothing. Please retake a clear outfit photo.",
      },
    }],
    ["ja", {
      title: "コーデを撮影",
      description: "トップスとボトムス、または上下を覆う服装がはっきり写るようにしてください。靴や頭部も写せると、より正確に分析できます ❤️。",
      addPhoto: "コーデ写真を追加",
      checking: "写真が分析に適しているか確認しています…",
      passed: "この写真は分析に使用できます。",
      retryCheck: "もう一度確認",
      checkError: "現在この写真を確認できません。もう一度お試しください。",
      checkTimeout: "写真の確認がタイムアウトしました。もう一度お試しください。",
      checkRateLimited: "写真の確認回数が多すぎます。しばらくしてからお試しください。",
      providerPrivacy: "写真を選ぶと、要件を満たしているか確認するため AI 提供元へ送信されます。「分析を開始」を押した後にのみ、コーデの完全な分析が始まります。提供元は不正利用監視のため短期間保持する場合があります。公開前に正確な保持期間を確認してください。",
      localPrivacy: "本サービスは写真や結果を保存しません。離脱または更新後に復元できません。",
      reason: {
        NO_PERSON: "写真から人物を確認できません。別の写真を選んでください。",
        MULTIPLE_PEOPLE: "複数の人物が写っています。1人だけの写真を選んでください。",
        INCOMPLETE_OUTFIT: "トップスとボトムス、または上下を覆う服装がはっきり写るようにしてください。",
        OUTFIT_OBSTRUCTED: "衣服が隠れています。トップスとボトムスがはっきり写るよう撮り直してください。",
        TOO_DARK: "写真が暗すぎます。明るい場所で撮り直してください。",
        TOO_BLURRY: "写真がぼやけています。カメラを安定させて撮り直してください。",
        NOT_OUTFIT_PHOTO: "分析できるコーデ写真ではありません。別の写真を選んでください。",
        INAPPROPRIATE_CONTENT: "この写真はサービスの基準を満たしていません。コーデ写真を選んでください。",
        CLOTHING_UNRECOGNIZABLE: "衣服を正確に確認できません。はっきりしたコーデ写真を撮り直してください。",
      },
    }],
    ["ko", {
      title: "코디를 촬영하세요",
      description: "상의와 하의 또는 상하의를 덮는 원피스가 선명하게 보이게 해주세요. 신발과 머리도 나오면 분석 결과가 더 정확해져요 ❤️.",
      addPhoto: "코디 사진 추가",
      checking: "사진이 분석에 적합한지 확인하는 중…",
      passed: "이 사진은 분석할 수 있습니다.",
      retryCheck: "다시 확인",
      checkError: "지금은 사진을 확인할 수 없습니다. 다시 시도해 주세요.",
      checkTimeout: "사진 확인 시간이 초과되었습니다. 다시 시도해 주세요.",
      checkRateLimited: "사진 확인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      providerPrivacy: "사진을 선택하면 규격 확인을 위해 AI 제공업체로 전송됩니다. 전체 코디 분석은 “분석 시작”을 누른 후에만 시작됩니다. 제공업체는 오용 감시를 위해 잠시 보관할 수 있으므로 출시 전에 정확한 보관 기간을 확인하세요.",
      localPrivacy: "이 서비스는 사진이나 결과를 저장하지 않습니다. 나가거나 새로고침하면 복구할 수 없습니다.",
      reason: {
        NO_PERSON: "사진에서 인물을 확인할 수 없습니다. 다른 사진을 선택해 주세요.",
        MULTIPLE_PEOPLE: "사진에 여러 사람이 있습니다. 한 사람만 나온 사진을 선택해 주세요.",
        INCOMPLETE_OUTFIT: "상의와 하의 또는 상하의를 덮는 원피스가 선명하게 보이게 해주세요.",
        OUTFIT_OBSTRUCTED: "옷이 가려져 있습니다. 상의와 하의가 선명하게 보이도록 다시 촬영해 주세요.",
        TOO_DARK: "사진이 너무 어둡습니다. 밝은 곳에서 다시 촬영해 주세요.",
        TOO_BLURRY: "사진이 너무 흐립니다. 카메라를 고정하고 다시 촬영해 주세요.",
        NOT_OUTFIT_PHOTO: "분석할 수 있는 코디 사진이 아닙니다. 다른 사진을 선택해 주세요.",
        INAPPROPRIATE_CONTENT: "이 사진은 서비스 기준에 맞지 않습니다. 코디 사진을 선택해 주세요.",
        CLOTHING_UNRECOGNIZABLE: "옷을 정확히 확인할 수 없습니다. 선명한 코디 사진을 다시 촬영해 주세요.",
      },
    }],
  ] as const)("provides complete exact %s precheck and privacy copy", (locale, expected) => {
    expect(messages[locale].photo).toMatchObject(expected);
  });
});
