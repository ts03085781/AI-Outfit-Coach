import en from "@/messages/en.json";
import ja from "@/messages/ja.json";
import ko from "@/messages/ko.json";
import zhTW from "@/messages/zh-TW.json";

import type { AppLocale } from "./config";

const imageErrorMessages = {
  "zh-TW": {
    UNSUPPORTED_FORMAT: "請使用 JPEG、PNG 或 WebP 照片。",
    TOO_LARGE: "照片檔案過大，請選擇小於 15 MB 的照片。",
    UNREADABLE: "照片無法讀取，請重新選擇。",
    PROCESSING_FAILED: "照片處理失敗，請重新選擇。",
    OUTPUT_TOO_LARGE: "照片內容過大，請重新拍攝。",
  },
  en: {
    UNSUPPORTED_FORMAT: "Use a JPEG, PNG, or WebP photo.",
    TOO_LARGE: "This photo is too large. Choose one smaller than 15 MB.",
    UNREADABLE: "This photo cannot be read. Please choose another one.",
    PROCESSING_FAILED: "This photo could not be processed. Please choose another one.",
    OUTPUT_TOO_LARGE: "The photo content is too large. Please retake it.",
  },
  ja: {
    UNSUPPORTED_FORMAT: "JPEG、PNG、WebP の写真を使用してください。",
    TOO_LARGE: "写真ファイルが大きすぎます。15 MB 未満の写真を選んでください。",
    UNREADABLE: "写真を読み込めません。別の写真を選んでください。",
    PROCESSING_FAILED: "写真を処理できませんでした。別の写真を選んでください。",
    OUTPUT_TOO_LARGE: "写真の内容が大きすぎます。撮り直してください。",
  },
  ko: {
    UNSUPPORTED_FORMAT: "JPEG, PNG 또는 WebP 사진을 사용하세요.",
    TOO_LARGE: "사진 파일이 너무 큽니다. 15MB 미만의 사진을 선택하세요.",
    UNREADABLE: "사진을 읽을 수 없습니다. 다른 사진을 선택하세요.",
    PROCESSING_FAILED: "사진을 처리할 수 없습니다. 다른 사진을 선택하세요.",
    OUTPUT_TOO_LARGE: "사진 내용이 너무 큽니다. 다시 촬영하세요.",
  },
} as const;

export const messages = {
  "zh-TW": { ...zhTW, imageError: imageErrorMessages["zh-TW"] },
  en: { ...en, imageError: imageErrorMessages.en },
  ja: { ...ja, imageError: imageErrorMessages.ja },
  ko: { ...ko, imageError: imageErrorMessages.ko },
};
