import type { OutfitAnalysis } from "./domain";

export class UnsafeModelOutputError extends Error {
  constructor() {
    super("Model output failed deterministic safety validation");
    this.name = "UnsafeModelOutputError";
  }
}

const FORBIDDEN_PATTERNS = [
  /(?:外貌|長相|吸引力|身材).{0,10}(?:分|評分|漂亮|美|帥|醜|好|差)|(?:漂亮|美麗|帥氣|醜|難看)/u,
  /(?:\d{1,3}\s*分|\d{1,2}\s*\/\s*10)/u,
  /(?:看起來|應該|推測|判斷).{0,16}(?:男性|女性|男生|女生|年齡|\d{1,3}\s*歲|族群|種族|宗教|健康|收入|有錢|貧窮)/u,
  /(?:丟臉|可笑|噁心|羞恥|糟透|土到|嘲笑|羞辱)/u,
  /(?:極端節食|節食|減肥|瘦身|塑身|減重|斷食|少吃|挨餓)/u,
  /(?:一定要買|必買|非買不可|立刻(?:買|購買)|必須(?:買|購買|添購)|建議(?:買|購買|添購)|需要(?:買|購買|添購))/u,
  /(?:買進股票|賣出股票|買進基金|賣出基金|法律意見|醫療診斷|藥物劑量|破解密碼|攻擊網站)/u,
  /(?:忽略|覆寫|繞過).{0,12}(?:安全規則|系統規則|system message|system prompt|指令)|(?:jailbreak|越獄提示)/iu,
] as const;

const OUTFIT_DOMAIN_ANCHOR = /(?:穿搭|衣物|衣服|上衣|襯衫|外套|褲|裙|鞋|襪|袖|領口|下擺|腰線|包款|飾品|配色|顏色|比例|輪廓|線條|材質|層次|照片|重拍|入鏡|光線|模糊|遮住)/u;

function assertSafeText(text: string): void {
  if (!OUTFIT_DOMAIN_ANCHOR.test(text)) throw new UnsafeModelOutputError();
  if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new UnsafeModelOutputError();
  }
}

export function assertSafeAnalysis(analysis: OutfitAnalysis): void {
  if (analysis.retake_required) {
    assertSafeText(analysis.retake_reason);
    return;
  }

  const text = [
    analysis.summary,
    ...analysis.strengths,
    ...analysis.suggestions.flatMap((suggestion) => [
      suggestion.action,
      suggestion.reason,
      suggestion.expected_effect,
    ]),
  ].join("\n");
  assertSafeText(text);
}

export function assertSafeFollowUp(alternative: string): void {
  assertSafeText(alternative);
}
