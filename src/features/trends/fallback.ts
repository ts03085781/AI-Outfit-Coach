import type { AppLocale } from "@/lib/i18n/config";

import type { LocalizedTrend } from "./domain";

const fallbackItems = [
  {
    id: "linen-wide-leg-trousers",
    translations: {
      "zh-TW": { name: "透氣亞麻寬褲", description: "輕盈材質與寬鬆輪廓，適合台灣炎熱潮濕的日常。" },
      en: { name: "Linen wide-leg trousers", description: "A breathable, relaxed staple for Taiwan's heat and humidity." },
      ja: { name: "リネンワイドパンツ", description: "台湾の蒸し暑い日に合う、軽くゆったりした定番です。" },
      ko: { name: "리넨 와이드 팬츠", description: "대만의 덥고 습한 날씨에 어울리는 가볍고 여유로운 아이템입니다." },
    },
  },
  {
    id: "relaxed-poplin-shirt",
    translations: {
      "zh-TW": { name: "寬版府綢襯衫", description: "可單穿也可當薄外套，為換季穿搭增加俐落層次。" },
      en: { name: "Relaxed poplin shirt", description: "Wear it alone or as a light layer through changing weather." },
      ja: { name: "リラックスポプリンシャツ", description: "一枚でも羽織りでも使え、季節の変わり目に便利です。" },
      ko: { name: "릴랙스드 포플린 셔츠", description: "단독 또는 가벼운 아우터로 입기 좋은 환절기 아이템입니다." },
    },
  },
  {
    id: "retro-low-profile-sneakers",
    translations: {
      "zh-TW": { name: "復古薄底球鞋", description: "低調鞋型能平衡寬鬆下身，適合通勤與長時間步行。" },
      en: { name: "Retro low-profile sneakers", description: "A slim everyday shoe that balances relaxed silhouettes." },
      ja: { name: "レトロ薄底スニーカー", description: "ゆったりしたシルエットを軽やかに整える日常靴です。" },
      ko: { name: "레트로 로우 프로파일 스니커즈", description: "여유로운 실루엣에 가벼운 균형을 더하는 데일리 슈즈입니다." },
    },
  },
  {
    id: "sheer-lightweight-jacket",
    translations: {
      "zh-TW": { name: "薄透輕量外套", description: "兼顧防曬與冷氣房溫差，又不會讓造型顯得厚重。" },
      en: { name: "Sheer lightweight jacket", description: "An airy layer for sun protection and strong indoor air conditioning." },
      ja: { name: "シアーライトジャケット", description: "日差しと冷房対策をしながら、軽やかに重ねられます。" },
      ko: { name: "시어 라이트 재킷", description: "햇빛과 실내 냉방에 대비하면서도 가볍게 레이어드할 수 있습니다." },
    },
  },
  {
    id: "east-west-shoulder-bag",
    translations: {
      "zh-TW": { name: "橫長肩背包", description: "俐落的橫向比例能為簡約穿搭加入當代輪廓。" },
      en: { name: "East-west shoulder bag", description: "Its elongated shape adds a current accent to simple outfits." },
      ja: { name: "横長ショルダーバッグ", description: "横に長い端正な形が、シンプルな装いを今らしく見せます。" },
      ko: { name: "이스트웨스트 숄더백", description: "가로로 긴 실루엣이 미니멀한 룩에 현대적인 포인트를 더합니다." },
    },
  },
] as const;

export function getFallbackTrends(locale: AppLocale): LocalizedTrend[] {
  return fallbackItems.map((item) => ({
    id: item.id,
    imageUrl: "",
    name: item.translations[locale].name,
    description: item.translations[locale].description,
    sources: [],
  }));
}
