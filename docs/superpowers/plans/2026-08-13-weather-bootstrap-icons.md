# Weather Bootstrap Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace WeatherCard's Unicode weather symbols with `react-icons` Bootstrap Icons.

**Architecture:** `WeatherCard` continues to own the visual condition mapping. Its mapping value changes from strings to imported React icon components, rendered as a decorative SVG beside the translated condition text.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, React Testing Library, `react-icons`.

## Global Constraints

- Install only `react-icons`; import weather icons from `react-icons/bs`.
- Preserve the existing translated weather-condition text and decorative `aria-hidden` wrapper.
- Use strict TypeScript, two-space indentation, semicolons, and double quotes.

---

### Task 1: Render Bootstrap weather icons

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Modify: `src/features/home/components/WeatherCard.tsx:1-13,43`
- Test: `tests/unit/weather-card.test.tsx`

**Interfaces:**
- Consumes: `WeatherSnapshot["condition"]` with `"clear" | "partlyCloudy" | "cloudy" | "fog" | "rain" | "snow" | "storm"`.
- Produces: an SVG Bootstrap icon in `.weather-icon` for each condition.

- [ ] **Step 1: Write the failing test**

```tsx
it("renders the Bootstrap rain icon for rainy weather", async () => {
  mockedFetchWeatherSnapshot.mockResolvedValue(rainSnapshot);
  render(<LocaleProvider initialLocale="zh-TW"><WeatherCard /></LocaleProvider>);

  expect(await screen.findByTestId("weather-icon-rain")).toBeVisible();
  expect(screen.queryByText("☂")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/weather-card.test.tsx`

Expected: FAIL because the current icon has no `data-testid="weather-icon-rain"`.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { BsCloudRain } from "react-icons/bs";

function iconFor(condition: WeatherSnapshot["condition"]) {
  return ({ rain: BsCloudRain /* remaining conditions */ })[condition];
}

const WeatherIcon = iconFor(snapshot.condition);
<span aria-hidden="true" className="weather-icon"><WeatherIcon data-testid={`weather-icon-${snapshot.condition}`} /></span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/weather-card.test.tsx`

Expected: PASS.

- [ ] **Step 5: Verify the change**

Run: `pnpm typecheck && pnpm lint && pnpm test`

Expected: all commands exit successfully.
