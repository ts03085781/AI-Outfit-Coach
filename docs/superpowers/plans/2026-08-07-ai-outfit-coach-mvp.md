# AI Outfit Coach MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立免登入的手機 PWA，讓使用者選情境、拍攝穿搭照，取得安全且可立即採用的 AI 建議。

**Architecture:** Next.js App Router 同時提供 PWA 前端與無狀態 Route Handler。領域規則、圖片驗證、AI 供應商介面與遙測各自隔離；照片只停留在瀏覽器與單次請求記憶體，不寫入永久儲存。

**Tech Stack:** Node.js 22、TypeScript、Next.js、React、Zod、OpenAI JavaScript SDK、Vitest、Testing Library、Playwright、pnpm。

## Global Constraints

- 手機 PWA，免登入。
- 情境固定為：日常外出、約會、工作／面試、正式活動。
- 正常結果恰好兩個優點、零至三項建議，不顯示數字分數。
- 不分析外貌、身材好壞、性別、年齡、族群、健康或經濟狀況。
- 照片、分析文字與追問內容不得寫入永久儲存、日誌或分析事件。
- AI 金鑰只存在伺服器環境變數。
- 先寫失敗測試，再做最小實作；每個 Task 通過測試後獨立提交。

## File Map

- `src/app/page.tsx`：四步使用流程容器。
- `src/app/api/analyze/route.ts`：分析 API 邊界。
- `src/app/api/follow-up/route.ts`：單次替代建議 API。
- `src/features/outfit/domain.ts`：情境、結果與請求型別／Schema。
- `src/features/outfit/image.ts`：瀏覽器圖片檢查與壓縮。
- `src/features/outfit/prompts.ts`：安全系統指令與提示組合。
- `src/features/outfit/analyzer.ts`：AI 供應商無關介面與流程。
- `src/features/outfit/openai-analyzer.ts`：OpenAI SDK adapter。
- `src/features/outfit/components/*`：四個單一責任畫面。
- `src/lib/telemetry.ts`：白名單匿名事件。
- `tests/unit/*`：領域、圖片、提示、API、遙測單元測試。
- `tests/e2e/outfit-flow.spec.ts`：手機瀏覽器完整流程。
- `tests/evals/safety-cases.ts`：安全與公平測試案例。
- `docs/DEVELOPMENT-SOP.md`：開發、測試、隱私與發布流程。

---

### Task 1: 建立可測試的 PWA 骨架

**Files:**
- Create: `.gitignore`, `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/manifest.ts`, `src/app/globals.css`
- Test: `tests/unit/smoke.test.tsx`

**Interfaces:**
- Produces: `RootLayout`, `HomePage`，以及 `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck` 指令。

- [ ] **Step 1: 建立失敗的首頁測試**

```tsx
import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

it("shows the occasion question", () => {
  render(<HomePage />);
  expect(screen.getByRole("heading", { name: "今天要去哪裡？" })).toBeVisible();
});
```

- [ ] **Step 2: 建立設定並驗證測試先失敗**

Run: `pnpm install && pnpm test -- tests/unit/smoke.test.tsx`
Expected: FAIL，因 `src/app/page.tsx` 尚不存在。

- [ ] **Step 3: 實作最小首頁與 PWA manifest**

```tsx
export default function HomePage() {
  return <main><h1>今天要去哪裡？</h1></main>;
}
```

Manifest 設定 `display: "standalone"`、`start_url: "/"`、繁體中文名稱與 192/512 圖示；package scripts 加入四個品質指令。`.gitignore` 必須包含 `.env*`、`.next/`、`node_modules/`、`playwright-report/`，並以 `!.env.example` 允許提交範例設定。

- [ ] **Step 4: 執行品質檢查**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add .gitignore package.json pnpm-lock.yaml tsconfig.json next.config.ts vitest.config.ts playwright.config.ts src tests/unit/smoke.test.tsx
git commit -m "chore: scaffold outfit coach PWA"
```

### Task 2: 定義領域契約與安全提示

**Files:**
- Create: `src/features/outfit/domain.ts`
- Create: `src/features/outfit/prompts.ts`
- Test: `tests/unit/domain.test.ts`, `tests/unit/prompts.test.ts`

**Interfaces:**
- Produces: `Occasion`, `AnalyzeRequestSchema`, `OutfitAnalysisSchema`, `buildAnalysisPrompt(input)`。

- [ ] **Step 1: 寫領域 Schema 的失敗測試**

```ts
expect(OutfitAnalysisSchema.parse({
  summary: "整體俐落。", strengths: ["配色協調", "比例清楚"],
  occasion_fit: "適合", suggestions: [], retake_required: false,
  retake_reason: null
}).strengths).toHaveLength(2);
expect(() => OutfitAnalysisSchema.parse({ strengths: ["只有一項"] })).toThrow();
```

- [ ] **Step 2: 執行測試並確認失敗**

Run: `pnpm test -- tests/unit/domain.test.ts tests/unit/prompts.test.ts`
Expected: FAIL，缺少 exports。

- [ ] **Step 3: 實作 Zod 契約與提示組合器**

```ts
export const OccasionSchema = z.enum(["casual", "date", "work", "formal"]);
export const SuggestionSchema = z.object({
  action: z.string().min(1), reason: z.string().min(1), expected_effect: z.string().min(1)
});
const CompleteOutfitAnalysisSchema = z.object({
  summary: z.string().min(1), strengths: z.array(z.string().min(1)).length(2),
  occasion_fit: z.enum(["適合", "稍需調整", "不太適合"]),
  suggestions: z.array(SuggestionSchema).max(3),
  retake_required: z.literal(false), retake_reason: z.null()
}).strict();
const RetakeOutfitAnalysisSchema = z.object({
  retake_required: z.literal(true), retake_reason: z.string().min(1)
}).strict();
export const OutfitAnalysisSchema = z.discriminatedUnion("retake_required", [
  CompleteOutfitAnalysisSchema, RetakeOutfitAnalysisSchema
]);
```

`retake_required: true` 分支只允許非空 `retake_reason`；不得包含分析欄位或建議。`retake_required: false` 分支必須包含摘要、恰好兩個優點、場合適合度、零至三項建議，且 `retake_reason` 為 `null`。

提示必須逐條包含 Global Constraints 的安全禁令、只根據可見衣物、優先零購物調整，以及照片不足時重拍。

- [ ] **Step 4: 驗證提示與 Schema**

Run: `pnpm test -- tests/unit/domain.test.ts tests/unit/prompts.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/features/outfit/domain.ts src/features/outfit/prompts.ts tests/unit/domain.test.ts tests/unit/prompts.test.ts
git commit -m "feat: define outfit analysis contract"
```

### Task 3: 實作本機圖片驗證與壓縮

**Files:**
- Create: `src/features/outfit/image.ts`
- Test: `tests/unit/image.test.ts`

**Interfaces:**
- Produces: `prepareImage(file: File): Promise<Blob>`；接受 JPEG/PNG/WebP，輸出最長邊 1600px、WebP quality 0.82、最大 4 MB。

- [ ] **Step 1: 寫格式與大小失敗測試**

```ts
await expect(prepareImage(new File(["x"], "x.gif", { type: "image/gif" })))
  .rejects.toThrow("請使用 JPEG、PNG 或 WebP");
```

- [ ] **Step 2: 確認測試失敗**

Run: `pnpm test -- tests/unit/image.test.ts`
Expected: FAIL，`prepareImage` 不存在。

- [ ] **Step 3: 實作驗證與 Canvas 壓縮**

先拒絕不支援 MIME 與超過 15 MB 的輸入；用 `createImageBitmap` 解碼、依比例縮放到最長邊 1600px，再以 `canvas.toBlob("image/webp", 0.82)` 輸出。若壓縮後仍超過 4 MB，回傳「照片內容過大，請重新拍攝」。所有 bitmap 在 `finally` 呼叫 `close()`。

- [ ] **Step 4: 執行測試**

Run: `pnpm test -- tests/unit/image.test.ts`
Expected: PASS，且測試覆蓋不支援格式、過大輸入、縮放與解碼失敗。

- [ ] **Step 5: 提交**

```bash
git add src/features/outfit/image.ts tests/unit/image.test.ts
git commit -m "feat: validate and compress outfit photos"
```

### Task 4: 建立無狀態 AI 分析 API

**Files:**
- Create: `src/features/outfit/analyzer.ts`, `src/features/outfit/openai-analyzer.ts`
- Create: `src/app/api/analyze/route.ts`
- Test: `tests/unit/analyzer.test.ts`, `tests/unit/analyze-route.test.ts`

**Interfaces:**
- Produces: `OutfitAnalyzer.analyze(input: AnalyzeInput): Promise<OutfitAnalysis>`、`POST /api/analyze`。
- Consumes: `OutfitAnalysisSchema`, `buildAnalysisPrompt`。

- [ ] **Step 1: 寫 API 成功、格式錯誤與影像釋放測試**

```ts
const response = await POST(makeMultipartRequest(validImage, "casual"), fakeAnalyzer);
expect(response.status).toBe(200);
expect(await response.json()).toMatchObject({ occasion_fit: "適合" });
expect(fakeAnalyzer.lastInputReleased).toBe(true);
```

- [ ] **Step 2: 確認測試失敗**

Run: `pnpm test -- tests/unit/analyzer.test.ts tests/unit/analyze-route.test.ts`
Expected: FAIL，route 與 analyzer 不存在。

- [ ] **Step 3: 實作供應商介面與 OpenAI adapter**

Adapter 從 `OPENAI_API_KEY` 建立伺服器端 client，以圖片 data URL、系統提示及 JSON Schema 呼叫支援視覺的 Responses API；模型讀取 `OPENAI_VISION_MODEL`。解析後必須再次通過 `OutfitAnalysisSchema`，格式失敗只重試一次。

- [ ] **Step 4: 實作 Route Handler**

限制 Content-Length 6 MB、圖片 4 MB；解析 multipart、驗證情境、設定 30 秒 AbortSignal。`finally` 將持有圖片的區域變數設為 `undefined`；禁止 `console.log(request/formData/result)`。錯誤映射為 `INVALID_IMAGE`、`RETAKE_REQUIRED`、`AI_TIMEOUT`、`AI_UNAVAILABLE`。

- [ ] **Step 5: 執行測試與型別檢查**

Run: `pnpm test -- tests/unit/analyzer.test.ts tests/unit/analyze-route.test.ts && pnpm typecheck`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/features/outfit src/app/api/analyze tests/unit/analyzer.test.ts tests/unit/analyze-route.test.ts
git commit -m "feat: add stateless outfit analysis API"
```

### Task 5: 完成四步手機介面

**Files:**
- Create: `src/features/outfit/components/OccasionStep.tsx`, `PhotoStep.tsx`, `ConsentStep.tsx`, `ResultStep.tsx`
- Create: `src/features/outfit/useOutfitFlow.ts`
- Modify: `src/app/page.tsx`, `src/app/globals.css`
- Test: `tests/unit/outfit-flow.test.tsx`

**Interfaces:**
- Produces: `useOutfitFlow()` 狀態 `occasion → photo → consent → analyzing → result|error`。

- [ ] **Step 1: 寫完整 UI 狀態轉移測試**

```tsx
render(<HomePage />);
await user.click(screen.getByRole("button", { name: "日常外出" }));
expect(screen.getByRole("heading", { name: "拍下完整穿搭" })).toBeVisible();
```

- [ ] **Step 2: 確認測試失敗**

Run: `pnpm test -- tests/unit/outfit-flow.test.tsx`
Expected: FAIL，尚無四步 UI。

- [ ] **Step 3: 實作四個畫面與 hook**

相機 input 使用 `accept="image/jpeg,image/png,image/webp" capture="environment"`。同意 checkbox 未勾選時停用「開始分析」。結果頁依序顯示摘要、兩個優點、場合適合度與建議，第一項以主卡呈現；重拍結果只顯示原因與重拍按鈕。

- [ ] **Step 4: 加入可及性與響應式樣式**

確保 320px 寬可操作、觸控目標至少 44px、焦點可見、分析狀態用 `aria-live="polite"`、錯誤用 `role="alert"`。

- [ ] **Step 5: 執行測試**

Run: `pnpm test -- tests/unit/outfit-flow.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/app src/features/outfit/components src/features/outfit/useOutfitFlow.ts tests/unit/outfit-flow.test.tsx
git commit -m "feat: build four-step mobile outfit flow"
```

### Task 6: 加入一次追問與匿名回饋

**Files:**
- Create: `src/app/api/follow-up/route.ts`, `src/lib/telemetry.ts`
- Modify: `src/features/outfit/components/ResultStep.tsx`
- Test: `tests/unit/follow-up-route.test.ts`, `tests/unit/telemetry.test.ts`

**Interfaces:**
- Produces: `POST /api/follow-up`、`track(event: SafeEvent): void`。
- Consumes: 當次 `OutfitAnalysis` 與不超過 160 字的追問；不建立對話歷史。

- [ ] **Step 1: 寫白名單遙測與單次追問失敗測試**

```ts
expect(() => track({ type: "analysis_complete", occasion: "casual", latencyBucket: "5-10s" }))
  .not.toThrow();
expect(() => track({ type: "analysis_complete", photo: "base64" } as never)).toThrow();
```

- [ ] **Step 2: 確認測試失敗**

Run: `pnpm test -- tests/unit/follow-up-route.test.ts tests/unit/telemetry.test.ts`
Expected: FAIL。

- [ ] **Step 3: 實作追問與遙測**

追問 API 只允許一個替代方法，不接受新圖片；輸入與回覆不寫入日誌。SafeEvent 僅允許情境、成功與否、錯誤碼、延遲區間、是否重拍與 helpful boolean，未知欄位直接拒絕。

- [ ] **Step 4: 執行測試**

Run: `pnpm test -- tests/unit/follow-up-route.test.ts tests/unit/telemetry.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/follow-up src/lib/telemetry.ts src/features/outfit/components/ResultStep.tsx tests/unit
git commit -m "feat: add private follow-up and safe feedback"
```

### Task 7: 完整驗收、安全評估與 SOP

**Files:**
- Create: `tests/e2e/outfit-flow.spec.ts`, `tests/evals/safety-cases.ts`, `tests/evals/safety.test.ts`, `tests/fixtures/outfit-safe.png`, `README.md`
- Modify: `docs/DEVELOPMENT-SOP.md`

**Interfaces:**
- Produces: 可重複執行的手機 E2E、安全案例與上線檢查表。

- [ ] **Step 1: 寫手機 E2E 測試**

```ts
test.use({ viewport: { width: 390, height: 844 } });
test("completes an outfit analysis without login", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "日常外出" }).click();
  await page.setInputFiles("input[type=file]", "tests/fixtures/outfit-safe.jpg");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "開始分析" }).click();
  await expect(page.getByText("這套已經有好基礎")).toBeVisible();
});
```

建立一張不含真人、只含色塊服裝輪廓的 64×64 PNG fixture，讓測試不引入個人資料；測試中的檔名使用 `tests/fixtures/outfit-safe.png`。

- [ ] **Step 2: 建立安全案例**

至少涵蓋：要求外貌分數、推測年齡／性別／族群、羞辱語氣、極端節食、非必要購物、低光、遮擋、多人、非穿搭照，以及相同服裝搭配不同外觀人物。每案明確定義必須包含或不得包含的輸出特徵。

- [ ] **Step 3: 執行完整測試並修正失敗**

Run: `pnpm test && pnpm test:e2e && pnpm typecheck && pnpm lint`
Expected: 全部 PASS；安全案例零次出現敏感推測與羞辱內容。

- [ ] **Step 4: 執行隱私檢查**

Run: `rg -n "console\.(log|debug)|writeFile|createWriteStream|base64|data:image" src`
Expected: 僅允許 OpenAI adapter 中建立當次 data URL；不得有請求／結果記錄或檔案寫入。

- [ ] **Step 5: 完成文件與人工驗收**

README 記錄安裝、環境變數、啟動與測試指令；SOP 記錄下方既定流程。使用真機確認相機權限、重拍、離開即清除及 320/390/430px 版面。

- [ ] **Step 6: 最終提交**

```bash
git add README.md docs tests
git commit -m "test: verify outfit coach privacy and safety"
```

## 完成定義

- `pnpm test`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint` 全部通過。
- 四種情境均能輸出固定格式或清楚重拍原因。
- 安全案例不輸出外貌評分、敏感推測、羞辱或極端身材建議。
- 成功、失敗、逾時與重試路徑都沒有影像或分析內容的永久殘留。
- 手機真機可免登入完成完整流程。
