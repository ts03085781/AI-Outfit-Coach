# Analysis Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify OpenAI analysis failures safely and present an actionable Traditional Chinese message for each class.

**Architecture:** The OpenAI adapter owns provider-response classification and emits named analyzer errors with non-sensitive metadata. The analyze route converts those errors into stable API codes and writes an allowlisted server diagnostic. The client persists the code for the error screen, which maps it to fixed user-facing copy and telemetry.

**Tech Stack:** Next.js Route Handlers, React 19, TypeScript, Zod, Vitest, OpenAI JavaScript SDK.

## Global Constraints

- Never log or return API keys, photos, image data URLs, user context, model output, or raw provider messages.
- Keep the existing 30-second abort behavior and its `504 AI_TIMEOUT` response.
- Unknown failures must remain fail-closed as `AI_UNAVAILABLE`.
- Keep the API response body limited to the stable `{ error: string }` code.
- Do not alter successful analysis, retake, image validation, rate-limit, or token behavior.

---

### Task 1: Classify adapter failures

**Files:**
- Modify: `src/features/outfit/openai-analyzer.ts`
- Test: `tests/unit/analyzer.test.ts`

**Interfaces:**
- Produces: `AnalyzerProviderError` with `code: "AI_REFUSED" | "AI_AUTHORIZATION" | "AI_RATE_LIMITED" | "AI_INVALID_RESPONSE" | "AI_UNAVAILABLE"` and optional allowlisted `providerStatus` / `requestId`.
- Consumes: OpenAI SDK errors with optional `status` and `_request_id`, and Responses output containing an optional refusal content item.

- [ ] **Step 1: Write failing adapter-classification tests**

```ts
it("classifies a provider 401 as authorization failure", async () => {
  process.env.OPENAI_VISION_MODEL = "vision-test-model";
  const error = Object.assign(new Error("hidden"), { status: 401, _request_id: "req_safe" });
  await expect(new OpenAIOutfitAnalyzer(createClient([error])).analyze(makeInput()))
    .rejects.toMatchObject({ code: "AI_AUTHORIZATION", providerStatus: 401, requestId: "req_safe" });
});

it("classifies an empty structured output after retry as invalid response", async () => {
  process.env.OPENAI_VISION_MODEL = "vision-test-model";
  await expect(new OpenAIOutfitAnalyzer(createClient(["", ""])).analyze(makeInput()))
    .rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm test tests/unit/analyzer.test.ts`

Expected: FAIL because `AnalyzerProviderError` and the requested classifications do not exist.

- [ ] **Step 3: Implement the minimal adapter classification**

```ts
export class AnalyzerProviderError extends Error {
  constructor(
    readonly code: AnalyzerProviderErrorCode,
    readonly providerStatus?: number,
    readonly requestId?: string,
  ) {
    super(code);
    this.name = "AnalyzerProviderError";
  }
}

function providerErrorFrom(error: unknown): AnalyzerProviderError {
  const candidate = error as { status?: unknown; _request_id?: unknown };
  const status = typeof candidate.status === "number" ? candidate.status : undefined;
  const requestId = typeof candidate._request_id === "string" ? candidate._request_id : undefined;
  const code = status === 401 || status === 403 ? "AI_AUTHORIZATION"
    : status === 429 ? "AI_RATE_LIMITED"
    : "AI_UNAVAILABLE";
  return new AnalyzerProviderError(code, status, requestId);
}
```

Use `AI_REFUSED` when the SDK response contains a refusal item, and use `AI_INVALID_RESPONSE` after the existing second parse attempt fails.

- [ ] **Step 4: Run the adapter test to verify it passes**

Run: `pnpm test tests/unit/analyzer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/features/outfit/openai-analyzer.ts tests/unit/analyzer.test.ts
git commit -m "feat: classify analysis provider failures"
```

### Task 2: Map safe API codes and server diagnostics

**Files:**
- Modify: `src/features/outfit/analyze-handler.ts`
- Test: `tests/unit/analyze-route.test.ts`

**Interfaces:**
- Consumes: `AnalyzerProviderError` from the adapter.
- Produces: `503` with the exact allowlisted error code for provider failures; server diagnostics containing only `stage`, `errorCode`, `providerStatus`, and `requestId`.

- [ ] **Step 1: Write failing route tests**

```ts
it("returns the provider authorization code without provider details", async () => {
  const response = await handleRequest(
    makeMultipartRequest(validImage()),
    { analyze: async () => { throw new AnalyzerProviderError("AI_AUTHORIZATION", 401, "req_safe"); } },
  );
  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual({ error: "AI_AUTHORIZATION" });
});
```

- [ ] **Step 2: Run the focused route test to verify it fails**

Run: `pnpm test tests/unit/analyze-route.test.ts`

Expected: FAIL because provider-specific errors are currently converted to `AI_UNAVAILABLE`.

- [ ] **Step 3: Implement allowlisted route mapping and logging**

```ts
if (error instanceof AnalyzerProviderError) {
  console.error("outfit_analysis_failure", {
    stage: "provider",
    errorCode: error.code,
    providerStatus: error.providerStatus,
    requestId: error.requestId,
  });
  return json({ error: error.code }, 503);
}
```

Keep the logger payload fixed; do not append the caught error, request, image, or model response.

- [ ] **Step 4: Run the route test to verify it passes**

Run: `pnpm test tests/unit/analyze-route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/features/outfit/analyze-handler.ts tests/unit/analyze-route.test.ts
git commit -m "feat: expose safe analysis diagnostics"
```

### Task 3: Present actionable client errors and telemetry

**Files:**
- Modify: `src/lib/telemetry.ts`
- Modify: `src/features/outfit/useOutfitFlow.ts`
- Modify: `src/app/page.tsx`
- Test: `tests/unit/outfit-flow.test.tsx`

**Interfaces:**
- Consumes: `AI_REFUSED`, `AI_AUTHORIZATION`, `AI_RATE_LIMITED`, and `AI_INVALID_RESPONSE` API codes.
- Produces: fixed Traditional Chinese alert copy and telemetry events using the same allowlisted codes.

- [ ] **Step 1: Write failing UI tests**

```tsx
it("explains an analysis authorization error without showing provider details", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ error: "AI_AUTHORIZATION" }), { status: 503 }),
  );
  render(<HomePage />);
  // complete the existing occasion, photo, and consent flow
  expect(await screen.findByRole("alert")).toHaveTextContent("OpenAI 專案的額度或權限目前無法使用");
});
```

- [ ] **Step 2: Run the focused UI test to verify it fails**

Run: `pnpm test tests/unit/outfit-flow.test.tsx`

Expected: FAIL because all failed analysis requests render the same network message.

- [ ] **Step 3: Implement the minimal client mapping**

```ts
const ANALYSIS_ERROR_MESSAGES = {
  AI_REFUSED: "這張照片目前無法由模型分析，請改用清楚、完整的單人穿搭照。",
  AI_AUTHORIZATION: "OpenAI 專案的額度或權限目前無法使用，請檢查 Platform 設定。",
  AI_RATE_LIMITED: "目前分析次數較多，請稍後再試一次。",
  AI_INVALID_RESPONSE: "模型回覆格式暫時異常，請再試一次。",
  AI_TIMEOUT: "分析等待逾時，請再試一次。",
  AI_UNAVAILABLE: "分析服務暫時無法使用，請稍後再試一次。",
} as const;
```

Store the parsed error code in the hook state, render only the fixed message in `page.tsx`, and extend `TelemetryErrorCode` with the new codes.

- [ ] **Step 4: Run the UI test to verify it passes**

Run: `pnpm test tests/unit/outfit-flow.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/lib/telemetry.ts src/features/outfit/useOutfitFlow.ts src/app/page.tsx tests/unit/outfit-flow.test.tsx
git commit -m "feat: show actionable analysis errors"
```

### Task 4: Verify diagnostics end to end

**Files:**
- Verify only: `tests/unit/analyzer.test.ts`, `tests/unit/analyze-route.test.ts`, `tests/unit/outfit-flow.test.tsx`

**Interfaces:**
- Verifies: adapter classification, API mapping, client copy, type safety, linting, and the local analysis endpoint.

- [ ] **Step 1: Run focused regression tests**

Run: `pnpm test tests/unit/analyzer.test.ts tests/unit/analyze-route.test.ts tests/unit/outfit-flow.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run static validation**

Run: `pnpm typecheck && pnpm lint`

Expected: PASS with no diagnostics.

- [ ] **Step 3: Run the local smoke test with the safe fixture**

Run: `curl --silent --show-error --request POST http://localhost:3000/api/analyze --form 'occasion=casual' --form 'image=@tests/fixtures/outfit-safe.png;type=image/png'`

Expected: `422 RETAKE_REQUIRED` with a retake reason, proving the route reaches the configured provider without a 503.

- [ ] **Step 4: Commit verification metadata only if any tracked verification artifact changed**

```bash
git status --short
```

Expected: no diagnostic output, temporary files, secrets, or fixture copies are staged.
