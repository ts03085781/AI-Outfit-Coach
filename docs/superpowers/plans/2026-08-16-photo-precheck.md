# Automatic Photo Precheck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically validate every prepared outfit photo with a fast, low-cost vision model and enable full analysis only after the current photo passes.

**Architecture:** Add a stateless `/api/photo-check` endpoint backed by a dedicated OpenAI photo-check adapter and strict reason-code union. Keep precheck as a client-side UX gate: `useOutfitFlow` owns cancellation and stale-response protection, while `/api/analyze` remains unchanged as an independent final-quality defense.

**Tech Stack:** Next.js 15 App Router, React 19, strict TypeScript, Zod 4, OpenAI Responses API, Vitest, Testing Library, Playwright, next-intl.

## Global Constraints

- Use Node 24 and pnpm 11.9.0.
- Selecting a photo immediately uploads the prepared blob for precheck.
- Configure precheck with `OPENAI_PHOTO_CHECK_MODEL`; initial deployment value is `gpt-5-nano`.
- Precheck has one overall 10-second timeout; full analysis retains its existing 30-second timeout.
- Precheck is a UX gate only. Do not add an approval token or change the `/api/analyze` request contract.
- A precheck rejection or technical failure keeps start analysis disabled; technical failures offer manual retry.
- Show one stable, localized rejection reason and never render provider free text.
- Set provider requests to `store: false`; never persist or log images, filenames, or raw model output.
- Keep four locales in sync: `zh-TW`, `en`, `ja`, and `ko`.
- Preserve the existing fail-closed full-analysis retake path and privacy constraints.

---

## File map

- Create `src/features/outfit/photo-check.ts`: public reason, result, response, state, and error schemas/types.
- Create `src/features/outfit/photo-checker.ts`: provider-neutral checker input/interface.
- Create `src/features/outfit/photo-check-prompts.ts`: immutable classification policy and priority ordering.
- Create `src/features/outfit/openai-photo-checker.ts`: OpenAI Responses adapter and structured-output parsing.
- Create `src/features/outfit/photo-check-handler.ts`: multipart validation, timeout, guard, and HTTP mapping.
- Create `src/app/api/photo-check/route.ts`: production dependency wiring.
- Modify `src/lib/abuse-guard.ts`: add the `photoCheck` endpoint budget.
- Modify `src/lib/telemetry.ts`: add strict precheck outcome events and public error-code types.
- Modify `src/features/outfit/useOutfitFlow.ts`: automatic check, retry, cancellation, stale-result protection, and UI gate.
- Modify `src/features/outfit/components/PhotoStep.tsx`: render status, retry, rejection reason, and disabled action.
- Modify `src/features/outfit/components/OutfitFlowPage.tsx`: pass the precheck props.
- Modify `src/app/globals.css`: status and retry presentation with accessible focus/tap targets.
- Modify all four files in `src/messages/`: localized status, rejection, error, retry, and truthful privacy copy.
- Modify `.env.example` and `README.md`: document `OPENAI_PHOTO_CHECK_MODEL` and precheck behavior.
- Create `tests/unit/photo-checker.test.ts`, `tests/unit/photo-check-prompts.test.ts`, and `tests/unit/photo-check-route.test.ts`.
- Modify `tests/unit/abuse-guard.test.ts`, `tests/unit/analyze-route.test.ts`, `tests/unit/follow-up-route.test.ts`, `tests/unit/telemetry.test.ts`, `tests/unit/telemetry-route.test.ts`, `tests/unit/outfit-flow.test.tsx`, `tests/unit/i18n.test.ts`, and `tests/unit/readme.test.ts`.
- Modify `tests/e2e/outfit-flow.spec.ts`: mock and verify precheck user flows.

---

### Task 1: Strict photo-check domain and OpenAI adapter

**Files:**

- Create: `src/features/outfit/photo-check.ts`
- Create: `src/features/outfit/photo-checker.ts`
- Create: `src/features/outfit/photo-check-prompts.ts`
- Create: `src/features/outfit/openai-photo-checker.ts`
- Create: `tests/unit/photo-checker.test.ts`
- Create: `tests/unit/photo-check-prompts.test.ts`

**Interfaces:**

- Produces: `PhotoCheckReasonSchema`, `PhotoCheckResultSchema`, `PhotoCheckResponseSchema`, `PhotoCheckErrorResponseSchema`, `PhotoCheckState`, and `PhotoCheckErrorCode`.
- Produces: `PhotoChecker.check({ image, signal }): Promise<PhotoCheckResult>`.
- Produces: `OpenAIPhotoCheckRequest`, `OpenAIPhotoCheckClient`, `OpenAIPhotoChecker`, `createOpenAIPhotoChecker`, `PhotoCheckerTimeoutError`, and `PhotoCheckerProviderError`.
- Depends on: `OPENAI_API_KEY`, `OPENAI_PHOTO_CHECK_MODEL`, `openai`, and `zod`.

- [ ] **Step 1: Write failing domain, prompt, request-shape, retry, refusal, and provider-error tests**

Create table-driven tests that require every reason code, reject inconsistent unions, verify the priority policy, and capture the Responses request:

```ts
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

it.each(reasons)("accepts the %s rejection", async (reason) => {
  process.env.OPENAI_PHOTO_CHECK_MODEL = "photo-check-test-model";
  const checker = new OpenAIPhotoChecker(createClient([
    JSON.stringify({ eligible: false, reason }),
  ]));
  await expect(checker.check(makeInput())).resolves.toEqual({ eligible: false, reason });
});

it("uses a cheap low-detail image request without user context", async () => {
  process.env.OPENAI_PHOTO_CHECK_MODEL = "photo-check-test-model";
  const requests: OpenAIPhotoCheckRequest[] = [];
  const checker = new OpenAIPhotoChecker(capturingClient(requests));
  await checker.check(makeInput());
  expect(requests[0]).toMatchObject({ model: "photo-check-test-model", store: false });
  expect(JSON.stringify(requests[0])).toContain('"detail":"low"');
  expect(JSON.stringify(requests[0])).not.toContain("occasion");
});
```

Also assert exactly two calls for invalid JSON followed by valid output, exactly two calls and `PHOTO_CHECK_INVALID_RESPONSE` after two invalid outputs, one call for refusal, one call for provider transport failure, and an `AbortError` mapping to `PhotoCheckerTimeoutError`.

- [ ] **Step 2: Run the new tests and confirm missing-module failures**

Run:

```bash
pnpm test -- tests/unit/photo-checker.test.ts tests/unit/photo-check-prompts.test.ts
```

Expected: FAIL because the four photo-check modules do not exist.

- [ ] **Step 3: Implement the public domain and provider-neutral interface**

Use a strict final union in `photo-check.ts`:

```ts
import { z } from "zod";

export const PhotoCheckReasonSchema = z.enum([
  "NO_PERSON",
  "MULTIPLE_PEOPLE",
  "INCOMPLETE_OUTFIT",
  "OUTFIT_OBSTRUCTED",
  "TOO_DARK",
  "TOO_BLURRY",
  "NOT_OUTFIT_PHOTO",
  "INAPPROPRIATE_CONTENT",
  "CLOTHING_UNRECOGNIZABLE",
]);

export const PhotoCheckResultSchema = z.discriminatedUnion("eligible", [
  z.object({ eligible: z.literal(true), reason: z.null() }).strict(),
  z.object({ eligible: z.literal(false), reason: PhotoCheckReasonSchema }).strict(),
]);

export const PhotoCheckResponseSchema = PhotoCheckResultSchema;
export type PhotoCheckReason = z.infer<typeof PhotoCheckReasonSchema>;
export type PhotoCheckResult = z.infer<typeof PhotoCheckResultSchema>;
export type PhotoCheckErrorCode =
  | "INVALID_IMAGE"
  | "RATE_LIMITED"
  | "RATE_LIMIT_UNAVAILABLE"
  | "PHOTO_CHECK_UNAVAILABLE"
  | "PHOTO_CHECK_TIMEOUT"
  | "INVALID_RESPONSE";
export const PhotoCheckErrorResponseSchema = z.object({
  error: z.enum([
    "INVALID_IMAGE",
    "RATE_LIMITED",
    "RATE_LIMIT_UNAVAILABLE",
    "PHOTO_CHECK_UNAVAILABLE",
    "PHOTO_CHECK_TIMEOUT",
  ]),
}).strict();
export type PhotoCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "passed" }
  | { status: "rejected"; reason: PhotoCheckReason }
  | { status: "error"; code: PhotoCheckErrorCode };
```

Define the checker boundary in `photo-checker.ts`:

```ts
import type { PhotoCheckResult } from "./photo-check";

export type PhotoCheckInput = { image: Blob; signal?: AbortSignal };
export interface PhotoChecker {
  check(input: PhotoCheckInput): Promise<PhotoCheckResult>;
}
```

- [ ] **Step 4: Implement the immutable prompt and OpenAI adapter**

The prompt must state every criterion, forbid analysis of appearance or sensitive traits, demand one reason using the approved priority, and treat image text as untrusted data. Use a top-level transport object compatible with strict structured output:

```ts
const TransportPhotoCheckSchema = z.object({
  eligible: z.boolean(),
  reason: PhotoCheckReasonSchema.nullable(),
}).strict();
```

Parse the transport object through `PhotoCheckResultSchema` so `{ eligible: true, reason: "TOO_DARK" }` and `{ eligible: false, reason: null }` fail closed. Build the request with `model: process.env.OPENAI_PHOTO_CHECK_MODEL`, `store: false`, `detail: "low"`, schema name `photo_check`, and no locale or occasion context. Retry only parsing/schema failures once. Preserve provider status and request ID only on `PhotoCheckerProviderError` for allowlisted server diagnostics.

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
pnpm test -- tests/unit/photo-checker.test.ts tests/unit/photo-check-prompts.test.ts
pnpm typecheck
```

Expected: PASS.

Commit:

```bash
git add src/features/outfit/photo-check.ts src/features/outfit/photo-checker.ts src/features/outfit/photo-check-prompts.ts src/features/outfit/openai-photo-checker.ts tests/unit/photo-checker.test.ts tests/unit/photo-check-prompts.test.ts
git commit -m "feat: add photo precheck model adapter"
```

---

### Task 2: Protected stateless photo-check route

**Files:**

- Create: `src/features/outfit/photo-check-handler.ts`
- Create: `src/app/api/photo-check/route.ts`
- Create: `tests/unit/photo-check-route.test.ts`
- Modify: `src/lib/abuse-guard.ts`
- Modify: `tests/unit/abuse-guard.test.ts`
- Modify: `tests/unit/analyze-route.test.ts`
- Modify: `tests/unit/follow-up-route.test.ts`

**Interfaces:**

- Consumes: `PhotoChecker`, `PhotoCheckerTimeoutError`, and `PhotoCheckerProviderError` from Task 1.
- Produces: `createPhotoCheckHandler({ createChecker, abuseGuard })`.
- Produces: `POST /api/photo-check` with the response contract from the design spec.
- Changes: `AbuseGuardEndpoint` becomes `"photoCheck" | "analyze" | "followUp"`.

- [ ] **Step 1: Write failing route and guard tests**

Mirror the proven request helpers from `tests/unit/analyze-route.test.ts`, but send only `image` to `/api/photo-check`. Require these results:

```ts
const validPng = readFileSync("tests/fixtures/outfit-safe.png");

function makeMultipartRequest(image = new Blob([validPng], { type: "image/png" })) {
  const formData = new FormData();
  formData.set("image", image, "outfit-image");
  return new Request("http://localhost/api/photo-check", { method: "POST", body: formData });
}

function allowingGuard(): AbuseGuard {
  return createInMemoryAbuseGuard({
    secret: "unit-test-secret",
    globalConcurrency: 20,
    config: {
      photoCheck: {
        burst: { limit: 100, windowMs: 1_000 },
        sustained: { limit: 100, windowMs: 10_000 },
      },
      analyze: {
        burst: { limit: 100, windowMs: 1_000 },
        sustained: { limit: 100, windowMs: 10_000 },
      },
      followUp: {
        burst: { limit: 100, windowMs: 1_000 },
        sustained: { limit: 100, windowMs: 10_000 },
      },
    },
  });
}

async function responseJson(checker: PhotoChecker) {
  const response = await createPhotoCheckHandler({
    createChecker: () => checker,
    abuseGuard: allowingGuard(),
  })(makeMultipartRequest());
  return { status: response.status, body: await response.json() };
}

function checkerReturning(result: PhotoCheckResult): PhotoChecker {
  return { check: async () => result };
}

function checkerThrowing(error: Error): PhotoChecker {
  return { check: async () => { throw error; } };
}

expect(await responseJson(checkerReturning({ eligible: true, reason: null })))
  .toEqual({ status: 200, body: { eligible: true, reason: null } });
expect(await responseJson(checkerReturning({ eligible: false, reason: "TOO_DARK" })))
  .toEqual({ status: 200, body: { eligible: false, reason: "TOO_DARK" } });
expect(await responseJson(checkerThrowing(new PhotoCheckerTimeoutError())))
  .toEqual({ status: 504, body: { error: "PHOTO_CHECK_TIMEOUT" } });
```

Cover missing image, unsupported type, MIME spoofing, corrupt bytes, dimensions over 8,000 pixels, image over 4 MB, request over 6 MB with and without truthful `Content-Length`, malformed multipart, non-multipart, cross-site request, endpoint burst rate limiting, provider failure, refusal/invalid output mapping, the default route with missing API key/model, and release of the concurrency guard on every path.

Extend `testConfig` in `tests/unit/abuse-guard.test.ts` with an independent `photoCheck` budget and assert exhausting it does not consume `analyze` or `followUp` counters.

- [ ] **Step 2: Run route and guard tests and confirm failures**

Run:

```bash
pnpm test -- tests/unit/photo-check-route.test.ts tests/unit/abuse-guard.test.ts tests/unit/analyze-route.test.ts
```

Expected: FAIL because the route does not exist and the abuse guard does not accept `photoCheck`.

- [ ] **Step 3: Add the endpoint budget and handler**

Add a separate budget suitable for automatic checks:

```ts
photoCheck: {
  burst: { limit: 5, windowMs: 10_000 },
  sustained: { limit: 30, windowMs: 10 * 60_000 },
},
```

Initialize a client map for all three endpoints. Extend every explicit `AbuseGuardConfig` test fixture in `abuse-guard.test.ts`, `analyze-route.test.ts`, and `follow-up-route.test.ts` with a `photoCheck` budget so strict TypeScript remains satisfied. In `createPhotoCheckHandler`, call `abuseGuard.enter(request, "photoCheck")` before reading the body. Reuse the exact bounded multipart strategy from `analyze-handler.ts`: 6 MB aggregate request, 4 MB image, MIME allowlist, and `isDecodableSupportedImage` before creating the checker.

Wrap the checker call in one `AbortController` with `setTimeout(() => controller.abort(), 10_000)`. Map its result and errors exactly to the status codes in the approved spec, clear the timer and image reference in `finally`, and always call `guard.release()`.

- [ ] **Step 4: Wire the production route**

Create `src/app/api/photo-check/route.ts`:

```ts
import { configuredAbuseGuard } from "@/lib/abuse-guard";
import { createPhotoCheckHandler } from "@/features/outfit/photo-check-handler";
import { createOpenAIPhotoChecker } from "@/features/outfit/openai-photo-checker";

export const runtime = "nodejs";
export const POST = createPhotoCheckHandler({
  createChecker: createOpenAIPhotoChecker,
  abuseGuard: configuredAbuseGuard,
});
```

- [ ] **Step 5: Run route regression tests and commit**

Run:

```bash
pnpm test -- tests/unit/photo-check-route.test.ts tests/unit/abuse-guard.test.ts tests/unit/analyze-route.test.ts tests/unit/follow-up-route.test.ts
pnpm typecheck
```

Expected: PASS.

Commit:

```bash
git add src/features/outfit/photo-check-handler.ts src/app/api/photo-check/route.ts src/lib/abuse-guard.ts tests/unit/photo-check-route.test.ts tests/unit/abuse-guard.test.ts tests/unit/analyze-route.test.ts tests/unit/follow-up-route.test.ts
git commit -m "feat: add protected photo precheck route"
```

---

### Task 3: Strict anonymous precheck telemetry

**Files:**

- Modify: `src/lib/telemetry.ts`
- Modify: `tests/unit/telemetry.test.ts`
- Modify: `tests/unit/telemetry-route.test.ts`

**Interfaces:**

- Consumes: `PhotoCheckReasonSchema` from Task 1.
- Produces: `PhotoCheckTelemetryErrorCode` and three additional `SafeEvent` branches.
- Preserves: the existing `track(event)` best-effort transport.

- [ ] **Step 1: Write failing strict-schema and transport tests**

Add accepted events:

```ts
track({ type: "photo_check_pass", latencyBucket: "0-5s" });
track({
  type: "photo_check_reject",
  reason: "INCOMPLETE_OUTFIT",
  latencyBucket: "0-5s",
});
track({
  type: "photo_check_error",
  errorCode: "PHOTO_CHECK_TIMEOUT",
  latencyBucket: "10-30s",
});
```

Add rejected cases containing `photo`, `filename`, provider text, unknown reason/error codes, `occasion`, or mutually incompatible fields. Apply the same cases to `POST /api/telemetry` handler tests.

- [ ] **Step 2: Run telemetry tests and confirm schema failures**

Run:

```bash
pnpm test -- tests/unit/telemetry.test.ts tests/unit/telemetry-route.test.ts
```

Expected: FAIL because precheck events are not in the discriminated union.

- [ ] **Step 3: Implement the new event branches**

Add strict schemas:

```ts
const PhotoCheckTelemetryErrorCodeSchema = z.enum([
  "INVALID_IMAGE",
  "RATE_LIMITED",
  "RATE_LIMIT_UNAVAILABLE",
  "PHOTO_CHECK_UNAVAILABLE",
  "PHOTO_CHECK_TIMEOUT",
  "INVALID_RESPONSE",
]);

const PhotoCheckPassEventSchema = z.object({
  type: z.literal("photo_check_pass"),
  latencyBucket: LatencyBucketSchema,
}).strict();

const PhotoCheckRejectEventSchema = z.object({
  type: z.literal("photo_check_reject"),
  reason: PhotoCheckReasonSchema,
  latencyBucket: LatencyBucketSchema,
}).strict();

const PhotoCheckErrorEventSchema = z.object({
  type: z.literal("photo_check_error"),
  errorCode: PhotoCheckTelemetryErrorCodeSchema,
  latencyBucket: LatencyBucketSchema,
}).strict();
```

Export `PhotoCheckTelemetryErrorCode`, add all three schemas to `TelemetryEventSchema`, and do not change `telemetry-handler.ts` because it already validates the shared union and bounds the body.

- [ ] **Step 4: Run telemetry tests and commit**

Run:

```bash
pnpm test -- tests/unit/telemetry.test.ts tests/unit/telemetry-route.test.ts
pnpm typecheck
```

Expected: PASS.

Commit:

```bash
git add src/lib/telemetry.ts tests/unit/telemetry.test.ts tests/unit/telemetry-route.test.ts
git commit -m "feat: track anonymous photo precheck outcomes"
```

---

### Task 4: Automatic client precheck and accessible locked UI

**Files:**

- Modify: `src/features/outfit/useOutfitFlow.ts`
- Modify: `src/features/outfit/components/PhotoStep.tsx`
- Modify: `src/features/outfit/components/OutfitFlowPage.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/messages/zh-TW.json`
- Modify: `src/messages/en.json`
- Modify: `src/messages/ja.json`
- Modify: `src/messages/ko.json`
- Modify: `tests/unit/outfit-flow.test.tsx`
- Modify: `tests/unit/i18n.test.ts`

**Interfaces:**

- Consumes: `PhotoCheckResponseSchema`, `PhotoCheckState`, `PhotoCheckErrorCode`, `coarseLatencyBucket`, and `track`.
- Produces from `useOutfitFlow`: `photoCheckState` and `retryPhotoCheck()`.
- Changes `PhotoStepProps`: add `photoCheckState` and `onRetryPhotoCheck`; full analysis remains `onAnalyze()`.

- [ ] **Step 1: Add a default precheck mock and write failing flow tests**

Update test fetch setup so existing happy paths answer both endpoints deterministically:

```ts
function photoCheckResponse(result = { eligible: true, reason: null }) {
  return new Response(JSON.stringify(result), { status: 200 });
}

vi.mocked(fetch).mockImplementation(async (url) => {
  if (url === "/api/photo-check") return photoCheckResponse();
  if (url === "/api/analyze") return analysisResponse();
  return new Response(null, { status: 204 });
});
```

Add tests for checking state, passed state, all nine localized rejections, timeout/unavailable/rate-limit errors, retry success, no automatic analysis, replacement clearing pass, returning during check, rapid reselection, and out-of-order completion. A core assertion is:

```ts
const start = await screen.findByRole("button", { name: "開始分析" });
expect(start).toBeDisabled();
pendingCheck.resolve(photoCheckResponse());
await waitFor(() => expect(start).toBeEnabled());
expect(vi.mocked(fetch).mock.calls.some(([url]) => url === "/api/analyze")).toBe(false);
```

Assert aborted/stale checks emit no telemetry, while current pass/reject/error outcomes emit the strict events from Task 3.

- [ ] **Step 2: Run the focused flow tests and confirm failures**

Run:

```bash
pnpm test -- tests/unit/outfit-flow.test.tsx tests/unit/i18n.test.ts
```

Expected: FAIL because the UI does not request or render precheck state.

- [ ] **Step 3: Implement cancellation-safe orchestration in `useOutfitFlow`**

Add refs for the current request ID, active controller, and current passed flag. Centralize invalidation so every photo replacement/navigation path performs:

```ts
photoCheckRequestRef.current += 1;
photoCheckAbortRef.current?.abort();
photoCheckAbortRef.current = undefined;
photoCheckPassedRef.current = false;
setPhotoCheckState({ status: "idle" });
```

After `prepareImage(file)` resolves for the current photo request, set the image and invoke `checkPhoto(preparedImage, requestId)`. `checkPhoto` sends a `FormData` body whose `image` field is `preparedImage` to `/api/photo-check`. On `response.ok`, parse only `PhotoCheckResponseSchema`; otherwise parse `PhotoCheckErrorResponseSchema` and fall back to `INVALID_RESPONSE` when the body is malformed. Update state only if both IDs and controller still match, and emit one current-result event with coarse latency.

`retryPhotoCheck()` reuses the current prepared blob with a fresh request ID/controller. `analyze()` keeps the current consent guard and adds `if (!photoCheckPassedRef.current) return;`. Passing the check sets the ref before state; every rejection/error/invalidation clears it.

- [ ] **Step 4: Render the state and locked action in `PhotoStep`**

Keep the preview and replacement button in every prepared-image state. Render checking and pass messages with `role="status" aria-live="polite"`; render rejection/error messages with `role="alert"`. Show retry only for `error`. Always render the primary action when a preview exists:

```tsx
<button
  className="primary-action photo-analyze"
  type="button"
  disabled={photoCheckState.status !== "passed"}
  onClick={() => {
    onConsentChange(true);
    onAnalyze();
  }}
>
  {t("startAnalysis")}
</button>
```

Add `.photo-check-status` and `.photo-check-retry` styling without changing the existing 52px primary tap target. Give retry a minimum 44px height and visible `:focus-visible` outline.

- [ ] **Step 5: Add exact localized copy and truthful privacy disclosure**

Use the following exact Traditional Chinese strings:

```json
{
  "checking": "正在檢查照片是否適合分析…",
  "passed": "照片符合分析規格。",
  "retryCheck": "重新檢查",
  "checkError": "照片檢查暫時無法完成，請重新檢查。",
  "checkTimeout": "照片檢查逾時，請重新檢查。",
  "checkRateLimited": "照片檢查次數過多，請稍後再試。",
  "reason": {
    "NO_PERSON": "照片中沒有可辨識的人物，請更換照片。",
    "MULTIPLE_PEOPLE": "照片中有多位人物，請改用只有一人的照片。",
    "INCOMPLETE_OUTFIT": "穿搭沒有完整入鏡，請讓上衣、下身與鞋子都清楚可見。",
    "OUTFIT_OBSTRUCTED": "衣物被明顯遮擋，請重新拍攝完整穿搭。",
    "TOO_DARK": "照片太暗，請在光線充足處重新拍攝。",
    "TOO_BLURRY": "照片太模糊，請保持鏡頭穩定後重新拍攝。",
    "NOT_OUTFIT_PHOTO": "這不是可分析的穿搭照片，請更換照片。",
    "INAPPROPRIATE_CONTENT": "這張照片不符合服務規範，請更換穿搭照片。",
    "CLOTHING_UNRECOGNIZABLE": "無法可靠辨識衣物，請重新拍攝清楚的完整穿搭。"
  }
}
```

Use these exact English strings:

```json
{
  "checking": "Checking whether this photo is ready for analysis…",
  "passed": "This photo is ready for analysis.",
  "retryCheck": "Check again",
  "checkError": "We couldn’t check this photo right now. Please try again.",
  "checkTimeout": "The photo check timed out. Please try again.",
  "checkRateLimited": "There have been too many photo checks. Please try again later.",
  "reason": {
    "NO_PERSON": "We couldn’t identify a person in this photo. Please choose another photo.",
    "MULTIPLE_PEOPLE": "This photo includes more than one person. Please choose a photo with one person.",
    "INCOMPLETE_OUTFIT": "The full outfit is not visible. Please include the top, bottom, and shoes.",
    "OUTFIT_OBSTRUCTED": "The clothing is blocked from view. Please retake the full outfit.",
    "TOO_DARK": "This photo is too dark. Please retake it in better lighting.",
    "TOO_BLURRY": "This photo is too blurry. Hold the camera steady and retake it.",
    "NOT_OUTFIT_PHOTO": "This is not an outfit photo we can analyze. Please choose another photo.",
    "INAPPROPRIATE_CONTENT": "This photo does not meet the service guidelines. Please choose an outfit photo.",
    "CLOTHING_UNRECOGNIZABLE": "We can’t reliably identify the clothing. Please retake a clear photo of the full outfit."
  }
}
```

Use these exact Japanese strings:

```json
{
  "checking": "写真が分析に適しているか確認しています…",
  "passed": "この写真は分析に使用できます。",
  "retryCheck": "もう一度確認",
  "checkError": "現在この写真を確認できません。もう一度お試しください。",
  "checkTimeout": "写真の確認がタイムアウトしました。もう一度お試しください。",
  "checkRateLimited": "写真の確認回数が多すぎます。しばらくしてからお試しください。",
  "reason": {
    "NO_PERSON": "写真から人物を確認できません。別の写真を選んでください。",
    "MULTIPLE_PEOPLE": "複数の人物が写っています。1人だけの写真を選んでください。",
    "INCOMPLETE_OUTFIT": "コーデ全体が写っていません。トップス、ボトムス、靴をすべて写してください。",
    "OUTFIT_OBSTRUCTED": "衣服が隠れています。コーデ全体を撮り直してください。",
    "TOO_DARK": "写真が暗すぎます。明るい場所で撮り直してください。",
    "TOO_BLURRY": "写真がぼやけています。カメラを安定させて撮り直してください。",
    "NOT_OUTFIT_PHOTO": "分析できるコーデ写真ではありません。別の写真を選んでください。",
    "INAPPROPRIATE_CONTENT": "この写真はサービスの基準を満たしていません。コーデ写真を選んでください。",
    "CLOTHING_UNRECOGNIZABLE": "衣服を正確に確認できません。コーデ全体がはっきり写るよう撮り直してください。"
  }
}
```

Use these exact Korean strings:

```json
{
  "checking": "사진이 분석에 적합한지 확인하는 중…",
  "passed": "이 사진은 분석할 수 있습니다.",
  "retryCheck": "다시 확인",
  "checkError": "지금은 사진을 확인할 수 없습니다. 다시 시도해 주세요.",
  "checkTimeout": "사진 확인 시간이 초과되었습니다. 다시 시도해 주세요.",
  "checkRateLimited": "사진 확인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  "reason": {
    "NO_PERSON": "사진에서 인물을 확인할 수 없습니다. 다른 사진을 선택해 주세요.",
    "MULTIPLE_PEOPLE": "사진에 여러 사람이 있습니다. 한 사람만 나온 사진을 선택해 주세요.",
    "INCOMPLETE_OUTFIT": "전체 코디가 보이지 않습니다. 상의, 하의, 신발이 모두 나오게 해주세요.",
    "OUTFIT_OBSTRUCTED": "옷이 가려져 있습니다. 전체 코디를 다시 촬영해 주세요.",
    "TOO_DARK": "사진이 너무 어둡습니다. 밝은 곳에서 다시 촬영해 주세요.",
    "TOO_BLURRY": "사진이 너무 흐립니다. 카메라를 고정하고 다시 촬영해 주세요.",
    "NOT_OUTFIT_PHOTO": "분석할 수 있는 코디 사진이 아닙니다. 다른 사진을 선택해 주세요.",
    "INAPPROPRIATE_CONTENT": "이 사진은 서비스 기준에 맞지 않습니다. 코디 사진을 선택해 주세요.",
    "CLOTHING_UNRECOGNIZABLE": "옷을 정확히 확인할 수 없습니다. 전체 코디가 선명하게 보이도록 다시 촬영해 주세요."
  }
}
```

Set `providerPrivacy` to these exact strings while keeping each existing `localPrivacy` value:

```text
zh-TW: 選取照片後會傳給 AI 供應商檢查是否符合規格；按下「開始分析」後才會進行完整穿搭分析。供應商可能依濫用監控政策短期保留，實際期限上線前仍須確認。
en: After you select a photo, it is sent to the AI provider to check whether it meets the requirements. Full outfit analysis starts only after you press “Start analysis.” The provider may keep it briefly for abuse monitoring; confirm the exact retention period before launch.
ja: 写真を選ぶと、要件を満たしているか確認するため AI 提供元へ送信されます。「分析を開始」を押した後にのみ、コーデの完全な分析が始まります。提供元は不正利用監視のため短期間保持する場合があります。公開前に正確な保持期間を確認してください。
ko: 사진을 선택하면 규격 확인을 위해 AI 제공업체로 전송됩니다. 전체 코디 분석은 “분석 시작”을 누른 후에만 시작됩니다. 제공업체는 오용 감시를 위해 잠시 보관할 수 있으므로 출시 전에 정확한 보관 기간을 확인하세요.
```

- [ ] **Step 6: Run component, localization, and regression tests and commit**

Run:

```bash
pnpm test -- tests/unit/outfit-flow.test.tsx tests/unit/i18n.test.ts tests/unit/telemetry.test.ts
pnpm typecheck
pnpm lint
```

Expected: PASS.

Commit:

```bash
git add src/features/outfit/useOutfitFlow.ts src/features/outfit/components/PhotoStep.tsx src/features/outfit/components/OutfitFlowPage.tsx src/app/globals.css src/messages/zh-TW.json src/messages/en.json src/messages/ja.json src/messages/ko.json tests/unit/outfit-flow.test.tsx tests/unit/i18n.test.ts
git commit -m "feat: gate outfit analysis on photo precheck"
```

---

### Task 5: Browser acceptance, environment docs, and full verification

**Files:**

- Modify: `tests/e2e/outfit-flow.spec.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `tests/unit/readme.test.ts`

**Interfaces:**

- Consumes: the `/api/photo-check` response contract and UI states from Tasks 1–4.
- Produces: mock-only end-to-end acceptance for pass, reject, retry, replacement, and explicit full-analysis start.

- [ ] **Step 1: Add failing Playwright flows and README assertions**

Create helpers that intercept precheck separately from full analysis:

```ts
async function mockSuccessfulPhotoCheck(page: Page) {
  await page.route("**/api/photo-check", async (route) => {
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ eligible: true, reason: null }),
    });
  });
}
```

Update `reachPhotoStep` to wait for the enabled start button after the preview. Add scenarios that hold a pending route and verify disabled state, return `INCOMPLETE_OUTFIT` and verify reason/no analysis, return `503` then pass on retry, replace a passed photo and verify immediate relock, and verify pass alone creates zero `/api/analyze` requests.

Extend `tests/unit/readme.test.ts` to require `OPENAI_PHOTO_CHECK_MODEL`, automatic precheck disclosure, and the statement that browser tests intercept `/api/photo-check` without external upload.

- [ ] **Step 2: Run focused tests and confirm documentation/flow failures**

Run:

```bash
pnpm test -- tests/unit/readme.test.ts
pnpm test:e2e -- tests/e2e/outfit-flow.spec.ts
```

Expected: FAIL until environment documentation and all test route mocks are updated.

- [ ] **Step 3: Document configuration and update every browser mock**

Add to `.env.example`:

```dotenv
OPENAI_API_KEY=
OPENAI_PHOTO_CHECK_MODEL=gpt-5-nano
OPENAI_VISION_MODEL=
RATE_LIMIT_SECRET=
ANALYSIS_TOKEN_SECRET=
```

Update README setup, privacy/data flow, rate-limit endpoints, and mock-only Playwright wording. Every existing e2e path that selects a photo must install a deterministic `/api/photo-check` route before file selection; tests must never contact OpenAI.

- [ ] **Step 4: Run the complete required verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm test:e2e
pnpm build
rg -n "console\.(log|debug)|writeFile|createWriteStream|base64|data:image" src
```

Expected: all five commands pass. Review the `rg` output manually: only intentional in-memory provider encoding may remain; no image persistence or debug logging is introduced.

- [ ] **Step 5: Review the implementation against the specification**

Confirm each acceptance criterion in `docs/superpowers/specs/2026-08-16-photo-precheck-design.md`, inspect `git diff --check`, and verify `git status --short` contains only intended changes.

- [ ] **Step 6: Commit final acceptance and documentation changes**

```bash
git add tests/e2e/outfit-flow.spec.ts .env.example README.md tests/unit/readme.test.ts
git commit -m "test: cover automatic photo precheck flow"
```
