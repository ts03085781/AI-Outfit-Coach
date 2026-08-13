# UV Risk Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add localized UV risk guidance below the UV index in the weather card.

**Architecture:** A pure `uvRiskLevelFor` helper maps the existing integer UV index to a translation key. `WeatherCard` renders that key below the current index, while each locale provides equivalent level and safety copy.

**Tech Stack:** Next.js 15, React 19, TypeScript, next-intl, Vitest, React Testing Library.

## Global Constraints

- Reuse `WeatherSnapshot.uvIndex`; do not change the weather API contract.
- Support `zh-TW`, `en`, `ja`, and `ko`.
- Keep UV risk guidance in the existing UV detail block beneath the number.

---

### Task 1: Classify and display UV risk guidance

**Files:**
- Modify: `src/features/home/components/WeatherCard.tsx`
- Modify: `src/messages/zh-TW.json`, `src/messages/en.json`, `src/messages/ja.json`, `src/messages/ko.json`
- Modify: `tests/unit/weather-card.test.tsx`

**Interfaces:**
- Consumes: `uvRiskLevelFor(uvIndex: number): "low" | "moderate" | "high" | "veryHigh" | "extreme"`.
- Produces: localized `home.weather.uvRisk.<level>` copy below the UV index.

- [ ] **Step 1: Write failing tests**

```tsx
expect(uvRiskLevelFor(2)).toBe("low");
expect(uvRiskLevelFor(3)).toBe("moderate");
expect(uvRiskLevelFor(6)).toBe("high");
expect(uvRiskLevelFor(8)).toBe("veryHigh");
expect(uvRiskLevelFor(11)).toBe("extreme");
expect(await screen.findByText("高量級：無防護曝曬容易曬傷")).toBeVisible();
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test tests/unit/weather-card.test.tsx`

Expected: FAIL because the classifier and risk guidance do not exist.

- [ ] **Step 3: Implement the classifier, localized messages, and UI**

```tsx
export function uvRiskLevelFor(uvIndex: number) {
  if (uvIndex <= 2) return "low";
  if (uvIndex <= 5) return "moderate";
  if (uvIndex <= 7) return "high";
  if (uvIndex <= 10) return "veryHigh";
  return "extreme";
}

<dd>{snapshot.uvIndex}<small>{t(`uvRisk.${uvRiskLevelFor(snapshot.uvIndex)}`)}</small></dd>
```

- [ ] **Step 4: Run focused and full verification**

Run: `pnpm test tests/unit/weather-card.test.tsx && pnpm typecheck && pnpm lint && pnpm test`

Expected: all commands exit successfully.
