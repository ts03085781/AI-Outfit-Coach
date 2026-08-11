import type { Locale, OutfitAnalysis } from "./domain";

export class UnsafeModelOutputError extends Error {
  constructor(readonly reason: "safety" | "language" | "domain" = "safety") {
    super("Model output failed deterministic safety validation");
    this.name = "UnsafeModelOutputError";
  }
}

type LocaleSafetyRules = {
  domainAnchor: RegExp;
  language: RegExp;
  forbidden: readonly RegExp[];
};

const EN_MEDICAL_ADVICE_PATTERN = /\b(?:tak(?:e|es|ing)|prescrib(?:e|es|ed|ing)|us(?:e|es|ing)|start(?:s|ed|ing)?|stop(?:s|ped|ping)?|recommend(?:s|ed|ing)?|administer(?:s|ed|ing)?|inject(?:s|ed|ing)?|dos(?:e|es|ed|ing))\b.{0,32}\b(?:antibiotics?|medications?|medicines?|drugs?|aspirin|ibuprofen)\b|\b(?:antibiotics?|medications?|medicines?|drugs?|aspirin|ibuprofen)\b.{0,32}\b(?:tak(?:e|es|ing)|prescrib(?:e|es|ed|ing)|us(?:e|es|ing)|start(?:s|ed|ing)?|stop(?:s|ped|ping)?|recommend(?:s|ed|ing)?|administer(?:s|ed|ing)?|inject(?:s|ed|ing)?|dos(?:e|es|ed|ing))\b/iu;

const SIMPLIFIED_CHINESE_MARKERS = /(?:整体|协调|颜色|[这们发体裤衬装轮线层显轻调选议])/u;

const COMMON_UNSAFE_PATTERNS = [
  /(?:buy|purchase|must|have to).{0,24}(?:new|another).{0,24}(?:outfit|clothes|shirt|jacket)|(?:must|have to).{0,24}(?:buy|purchase)/iu,
  /(?:ugly|hideous|disgusting|embarrassing|shameful|stupid)/iu,
  /(?:diet|lose weight|weight loss|fasting|starv(?:e|ing)|body shap)/iu,
  /(?:looks?|seems?|probably).{0,30}(?:male|female|woman|man|age|years old|race|religion|health|income)/iu,
  /(?:appearance|attractiveness|body).{0,20}(?:score|rating|\/\s*10)|(?:\d{1,2}\s*\/\s*10)/u,
  /(?:ignore|override|bypass).{0,24}(?:safety|system|prompt|instruction)|(?:jailbreak|system prompt)/iu,
  /(?:\b(?:look|be|appear)\s+sexy\b|\b(?:sexual(?:ized)?|erotic|pornographic)\b|\bexplicit\b|\bnude\s+(?:body|photo|image|content|model|scene)s?\b)/iu,
  /(?:discriminat(?:e|ion|ory)?|racis[mt]?|hate(?:ful| speech)?)/iu,
  EN_MEDICAL_ADVICE_PATTERN,
  /(?:prescription|medical diagnosis|drug dose|\b\d+(?:\.\d+)?\s*mg\b|(?:invest(?:ment)?|buy|sell).{0,20}\b(?:stock|shares?)\b|\b(?:stock|shares?)\b.{0,20}(?:buy|sell|invest)|legal advice|password|hack(?:ing)?|attack (?:a )?website)/iu,
] as const;

const LOCALE_SAFETY_RULES: Record<Locale, LocaleSafetyRules> = {
  "zh-TW": {
    domainAnchor: /(?:穿搭|衣物|衣服|上衣|襯衫|外套|褲|裙|鞋|襪|袖|領口|下擺|腰線|包款|飾品|配色|顏色|比例|輪廓|線條|材質|層次|照片|重拍|入鏡|光線|模糊|遮住)/u,
    language: /[\u4E00-\u9FFF]/u,
    forbidden: [
      /(?:外貌|長相|吸引力|身材).{0,10}(?:分|評分|漂亮|美|帥|醜|好|差)|(?:漂亮|美麗|帥氣|醜|難看)/u,
      /(?:看起來|應該|推測|判斷).{0,16}(?:男性|女性|男生|女生|年齡|\d{1,3}\s*歲|族群|種族|宗教|健康|收入|有錢|貧窮)/u,
      /(?:丟臉|可笑|噁心|羞恥|糟透|土到|嘲笑|羞辱)/u,
      /(?:極端節食|節食|減肥|瘦身|塑身|減重|斷食|少吃|挨餓)/u,
      /(?:一定要買|必買|非買不可|立刻(?:買|購買)|必須(?:買|購買|添購)|建議(?:買|購買|添購)|需要(?:買|購買|添購))/u,
      /(?:買進股票|賣出股票|買進基金|賣出基金|法律意見|醫療診斷|藥物劑量|破解密碼|攻擊網站)/u,
      /(?:性感|性化|情色|色情|裸露|歧視|仇恨|阿斯匹靈|阿司匹林|布洛芬|服用|用藥|處方|投與|藥物|診斷|投資|股票|法律建議|密碼|駭客)/u,
      /(?:忽略|覆寫|繞過).{0,12}(?:安全規則|系統規則|system message|system prompt|指令)|(?:jailbreak|越獄提示)/iu,
      ...COMMON_UNSAFE_PATTERNS,
    ],
  },
  en: {
    domainAnchor: /(?:outfit|clothing|clothes|shirt|top|jacket|coat|trousers|pants|skirt|dress|shoe|sleeve|collar|hem|waist|bag|accessor|color|proportion|silhouette|fabric|layer|photo|retake|lighting|blur|cover)/iu,
    language: /[a-z]{3,}/iu,
    forbidden: [
      /(?:beautiful|pretty|handsome|ugly|attractive).{0,20}(?:score|rating|face|body)|(?:rate|score).{0,20}(?:appearance|looks?|body)/iu,
      /(?:you|they).{0,20}(?:look|seem|are).{0,20}(?:male|female|man|woman|old|young|white|black|asian|religious|rich|poor|healthy|sick)/iu,
      ...COMMON_UNSAFE_PATTERNS,
    ],
  },
  ja: {
    domainAnchor: /(?:服装|コーデ|衣類|シャツ|トップス|ジャケット|コート|パンツ|スカート|靴|袖|襟|裾|ウエスト|バッグ|アクセサリー|指輪|配色|色|比率|シルエット|素材|重ね着|写真|撮り直|光|ぼやけ|隠)/u,
    language: /[ぁ-ゖァ-ヺ]/u,
    forbidden: [
      /(?:外見|容姿|顔|体型|魅力).{0,12}(?:点|評価|美人|かわいい|かっこいい|醜い)|(?:美人|かわいい|かっこいい|醜い)/u,
      /(?:見た目|見え|おそらく|推測).{0,20}(?:男性|女性|年齢|歳|人種|民族|宗教|健康|収入)|(?:男性|女性|年齢|歳|人種|民族|宗教|健康|収入).{0,20}(?:見え|推測)/u,
      /(?:恥ずかしい|醜い|気持ち悪い|馬鹿|嘲笑|侮辱)/u,
      /(?:極端な食事制限|食事制限|ダイエット|減量|断食|飢え)/u,
      /(?:絶対(?:に)?買|必ず買|買わなければ|今すぐ買|購入すべき)/u,
      /(?:無視|上書き|回避).{0,16}(?:安全|システム|プロンプト|指示)|(?:脱獄|jailbreak)/iu,
      /(?:セクシー|性的|エロティック|ポルノ|全裸|半裸|裸体|裸(?:の)?(?:身体|からだ|姿|写真|画像|内容|コンテンツ|モデル|場面|シーン)|裸(?:に|で)(?:なる|なって|させ|見せ)|差別|ヘイト|アスピリン|イブプロフェン|服用|処方|投与|薬(?:を|の服用|を服用|の投与)|薬物|診断|投資|株|法律相談|パスワード|ハッキング)/u,
      ...COMMON_UNSAFE_PATTERNS,
    ],
  },
  ko: {
    domainAnchor: /(?:의상|옷|코디|셔츠|상의|재킷|코트|바지|치마|신발|소매|칼라|밑단|허리|가방|액세서리|색상|색깔|비율|실루엣|소재|레이어|사진|다시 찍|조명|흐림|가림)/u,
    language: /[\uAC00-\uD7A3]/u,
    forbidden: [
      /(?:외모|얼굴|몸매|매력).{0,12}(?:점|평가|예쁘|잘생|못생)|(?:예쁘|잘생|못생)/u,
      /(?:보이|보입|추측|판단).{0,20}(?:남성|여성|나이|살|인종|민족|종교|건강|소득)|(?:남성|여성|나이|살|인종|민족|종교|건강|소득).{0,20}(?:보이|보입|추측|판단)/u,
      /(?:창피|추하|역겹|바보|조롱|모욕)/u,
      /(?:극단적 식단|식단|다이어트|체중 감량|금식|굶)/u,
      /(?:반드시 사|꼭 사|사야 해|지금 (?:사|구매)|구매해야)/u,
      /(?:무시|덮어쓰|우회).{0,16}(?:안전|시스템|프롬프트|지시)|(?:안전|시스템|프롬프트|지시).{0,16}(?:무시|덮어쓰|우회)|(?:탈옥|jailbreak)/iu,
      /(?:섹시|성적|에로틱|포르노|나체|차별|혐오|아스피린|이부프로펜|복용|처방|투여|약물|진단|투자|주식|법률 조언|비밀번호|해킹)/u,
      ...COMMON_UNSAFE_PATTERNS,
    ],
  },
};

const ALL_FORBIDDEN_PATTERNS = Object.values(LOCALE_SAFETY_RULES)
  .flatMap((rules) => rules.forbidden);

function assertCorrectLocale(text: string, locale: Locale): void {
  const latinCount = (text.match(/[A-Za-z]/g) ?? []).length;

  if (locale === "en") {
    if (!/[a-z]{3,}/iu.test(text) || /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/u.test(text)) {
      throw new UnsafeModelOutputError("language");
    }
    return;
  }

  if (locale === "zh-TW") {
    if (
      !LOCALE_SAFETY_RULES[locale].language.test(text)
      || SIMPLIFIED_CHINESE_MARKERS.test(text)
      || /[\u3040-\u30FF\uAC00-\uD7AF]/u.test(text)
      || latinCount > 0
    ) {
      throw new UnsafeModelOutputError("language");
    }
    return;
  }

  if (locale === "ko") {
    const hangulCount = (text.match(/[\uAC00-\uD7AF]/gu) ?? []).length;
    if (
      hangulCount === 0
      || /[\u3040-\u30FF\u3400-\u9FFF]/u.test(text)
      || latinCount > 0
    ) {
      throw new UnsafeModelOutputError("language");
    }
    return;
  }

  const kanaCount = (text.match(/[\u3040-\u30FF]/gu) ?? []).length;
  if (kanaCount === 0 || latinCount > 0 || /[\uAC00-\uD7AF]/u.test(text)) {
    throw new UnsafeModelOutputError("language");
  }
}

function assertLocaleAndSafety(text: string, locale: Locale): void {
  if (ALL_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new UnsafeModelOutputError("safety");
  }
  assertCorrectLocale(text, locale);
}

function assertSafeText(text: string, locale: Locale): void {
  const rules = LOCALE_SAFETY_RULES[locale];
  assertLocaleAndSafety(text, locale);
  if (!rules.domainAnchor.test(text)) throw new UnsafeModelOutputError("domain");
}

export function assertSafeAnalysis(analysis: OutfitAnalysis, locale: Locale): void {
  if (analysis.retake_required) {
    assertSafeText(analysis.retake_reason, locale);
    return;
  }

  const textParts = [
    analysis.summary,
    ...analysis.strengths,
    ...analysis.suggestions.flatMap((suggestion) => [
      suggestion.action,
      suggestion.reason,
      suggestion.expected_effect,
    ]),
  ];
  for (const textPart of textParts) assertLocaleAndSafety(textPart, locale);
  const text = textParts.join("\n");
  const rules = LOCALE_SAFETY_RULES[locale];
  if (!rules.domainAnchor.test(text)) throw new UnsafeModelOutputError("domain");
}

export function assertSafeFollowUp(alternative: string, locale: Locale): void {
  assertSafeText(alternative, locale);
}
