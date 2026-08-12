import { describe, expect, it } from "vitest";

import { weatherSnapshotFromResponse } from "@/features/home/weather";

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
