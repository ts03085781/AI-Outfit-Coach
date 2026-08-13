import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { uvRiskLevelFor, WeatherCard } from "@/features/home/components/WeatherCard";
import { fetchWeatherSnapshot } from "@/features/home/weather";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

vi.mock("@/features/home/weather", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/home/weather")>(),
  fetchWeatherSnapshot: vi.fn(),
}));

const mockedFetchWeatherSnapshot = vi.mocked(fetchWeatherSnapshot);

beforeEach(() => {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: vi.fn((success) => success({ coords: { latitude: 25.03, longitude: 121.56 } })) },
  });
});

it("classifies UV index boundaries", () => {
  expect(uvRiskLevelFor(2)).toBe("low");
  expect(uvRiskLevelFor(3)).toBe("moderate");
  expect(uvRiskLevelFor(6)).toBe("high");
  expect(uvRiskLevelFor(8)).toBe("veryHigh");
  expect(uvRiskLevelFor(11)).toBe("extreme");
});

it("renders the Bootstrap rain icon and high UV guidance", async () => {
  mockedFetchWeatherSnapshot.mockResolvedValue({
    currentTemperature: 24,
    highTemperature: 26,
    lowTemperature: 22,
    uvIndex: 6,
    condition: "rain",
  });

  render(<LocaleProvider initialLocale="zh-TW"><WeatherCard /></LocaleProvider>);

  expect(await screen.findByTestId("weather-icon-rain")).toBeVisible();
  expect(screen.getByText("高量級：無防護曝曬容易曬傷")).toBeVisible();
  expect(screen.queryByText("☂")).not.toBeInTheDocument();
});
