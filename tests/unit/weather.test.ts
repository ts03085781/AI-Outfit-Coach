import { describe, expect, it } from "vitest";

import {
  readCachedWeather,
  shouldRefreshWeather,
  weatherSnapshotFromResponse,
  writeCachedWeather,
} from "@/features/home/weather";

const cachedWeather = {
  snapshot: {
    currentTemperature: 24,
    highTemperature: 26,
    lowTemperature: 22,
    uvIndex: 6,
    condition: "rain" as const,
  },
  latitude: 25.03,
  longitude: 121.56,
  cachedAt: 1_000_000,
};

describe("weatherSnapshotFromResponse", () => {
  it("creates a weather snapshot from Open-Meteo current and daily values", () => {
    expect(weatherSnapshotFromResponse({
      current: { temperature_2m: 28.4, weather_code: 1 },
      daily: {
        temperature_2m_max: [31.2],
        temperature_2m_min: [25.1],
        uv_index_max: [6.4],
      },
    })).toEqual({
      currentTemperature: 28,
      highTemperature: 31,
      lowTemperature: 25,
      uvIndex: 6,
      condition: "partlyCloudy",
    });
  });

  it("rejects incomplete weather data", () => {
    expect(() => weatherSnapshotFromResponse({ current: {}, daily: {} })).toThrow("Invalid weather response");
  });
});

describe("weather cache", () => {
  it("round-trips a valid cached weather record", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    writeCachedWeather(storage, cachedWeather);

    expect(readCachedWeather(storage)).toEqual(cachedWeather);
  });

  it("ignores malformed weather cache data", () => {
    expect(readCachedWeather({ getItem: () => "{bad-json" })).toBeUndefined();
    expect(readCachedWeather({ getItem: () => JSON.stringify({ cachedAt: 1 }) })).toBeUndefined();
  });

  it("refreshes only after one hour at the same location", () => {
    const coordinates = { latitude: 25.03, longitude: 121.56 };

    expect(shouldRefreshWeather(cachedWeather, coordinates, 4_600_000)).toBe(false);
    expect(shouldRefreshWeather(cachedWeather, coordinates, 4_600_001)).toBe(true);
  });

  it("refreshes when the user moves farther than five kilometres", () => {
    expect(shouldRefreshWeather(
      cachedWeather,
      { latitude: 25.03, longitude: 121.62 },
      1_000_000,
    )).toBe(true);
  });
});
