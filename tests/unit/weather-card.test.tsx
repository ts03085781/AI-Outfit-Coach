import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { uvRiskLevelFor, WeatherCard } from "@/features/home/components/WeatherCard";
import {
  fetchWeatherSnapshot,
  readCachedWeather,
  type WeatherSnapshot,
  writeCachedWeather,
} from "@/features/home/weather";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

vi.mock("@/features/home/weather", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/home/weather")>(),
  fetchWeatherSnapshot: vi.fn(),
}));

const mockedFetchWeatherSnapshot = vi.mocked(fetchWeatherSnapshot);
const rainSnapshot: WeatherSnapshot = {
  currentTemperature: 24,
  highTemperature: 26,
  lowTemperature: 22,
  uvIndex: 6,
  condition: "rain",
};
const clearSnapshot: WeatherSnapshot = {
  currentTemperature: 28,
  highTemperature: 31,
  lowTemperature: 25,
  uvIndex: 3,
  condition: "clear",
};

beforeEach(() => {
  localStorage.clear();
  mockedFetchWeatherSnapshot.mockReset();
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
  mockedFetchWeatherSnapshot.mockResolvedValue(rainSnapshot);

  render(<LocaleProvider initialLocale="zh-TW"><WeatherCard /></LocaleProvider>);

  expect(await screen.findByTestId("weather-icon-rain")).toBeVisible();
  expect(screen.getByText("高量級：無防護曝曬容易曬傷")).toBeVisible();
  expect(screen.queryByText("☂")).not.toBeInTheDocument();
});

it("renders fresh cached weather without replacing it from the API", async () => {
  writeCachedWeather(localStorage, {
    snapshot: rainSnapshot,
    latitude: 25.03,
    longitude: 121.56,
    cachedAt: Date.now(),
  });

  render(<LocaleProvider initialLocale="zh-TW"><WeatherCard /></LocaleProvider>);

  expect(await screen.findByTestId("weather-icon-rain")).toBeVisible();
  expect(mockedFetchWeatherSnapshot).not.toHaveBeenCalled();
});

it("refreshes an expired cache and overwrites it", async () => {
  writeCachedWeather(localStorage, {
    snapshot: rainSnapshot,
    latitude: 25.03,
    longitude: 121.56,
    cachedAt: Date.now() - 60 * 60_000 - 1,
  });
  mockedFetchWeatherSnapshot.mockResolvedValue(clearSnapshot);

  render(<LocaleProvider initialLocale="zh-TW"><WeatherCard /></LocaleProvider>);

  expect(await screen.findByTestId("weather-icon-clear")).toBeVisible();
  expect(readCachedWeather(localStorage)?.snapshot).toEqual(clearSnapshot);
});

it("refreshes a fresh cache after moving farther than five kilometres", async () => {
  writeCachedWeather(localStorage, {
    snapshot: rainSnapshot,
    latitude: 25.03,
    longitude: 121.56,
    cachedAt: Date.now(),
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: vi.fn((success) => success({ coords: { latitude: 25.03, longitude: 121.62 } })) },
  });
  mockedFetchWeatherSnapshot.mockResolvedValue(clearSnapshot);

  render(<LocaleProvider initialLocale="zh-TW"><WeatherCard /></LocaleProvider>);

  expect(await screen.findByTestId("weather-icon-clear")).toBeVisible();
  expect(readCachedWeather(localStorage)).toMatchObject({
    snapshot: clearSnapshot,
    latitude: 25.03,
    longitude: 121.62,
  });
});

it("keeps cached weather visible when a refresh fails", async () => {
  let rejectRequest: ((reason: Error) => void) | undefined;
  writeCachedWeather(localStorage, {
    snapshot: rainSnapshot,
    latitude: 25.03,
    longitude: 121.56,
    cachedAt: Date.now() - 60 * 60_000 - 1,
  });
  mockedFetchWeatherSnapshot.mockImplementation(() => new Promise((_, reject) => {
    rejectRequest = reject;
  }));

  render(<LocaleProvider initialLocale="zh-TW"><WeatherCard /></LocaleProvider>);
  expect(await screen.findByTestId("weather-icon-rain")).toBeVisible();

  await act(async () => rejectRequest?.(new Error("Weather request failed")));

  expect(screen.getByTestId("weather-icon-rain")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
