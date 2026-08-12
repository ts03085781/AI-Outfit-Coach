export type WeatherCondition = "clear" | "partlyCloudy" | "cloudy" | "fog" | "rain" | "snow" | "storm";

export type WeatherSnapshot = {
  currentTemperature: number;
  highTemperature: number;
  lowTemperature: number;
  uvIndex: number;
  condition: WeatherCondition;
};

type WeatherResponse = {
  current?: { temperature_2m?: unknown; weather_code?: unknown };
  daily?: {
    temperature_2m_max?: unknown;
    temperature_2m_min?: unknown;
    uv_index_max?: unknown;
  };
};

function firstNumber(value: unknown): number | undefined {
  const candidate = Array.isArray(value) ? value[0] : undefined;
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
}

export function weatherConditionFromCode(code: number): WeatherCondition {
  if (code === 0) return "clear";
  if (code <= 2) return "partlyCloudy";
  if (code === 3) return "cloudy";
  if (code <= 48) return "fog";
  if (code <= 67 || (code >= 80 && code <= 82)) return "rain";
  if (code <= 77 || (code >= 85 && code <= 86)) return "snow";
  return "storm";
}

export function weatherSnapshotFromResponse(response: WeatherResponse): WeatherSnapshot {
  const currentTemperature = response.current?.temperature_2m;
  const weatherCode = response.current?.weather_code;
  const highTemperature = firstNumber(response.daily?.temperature_2m_max);
  const lowTemperature = firstNumber(response.daily?.temperature_2m_min);
  const uvIndex = firstNumber(response.daily?.uv_index_max);

  if (
    typeof currentTemperature !== "number" || !Number.isFinite(currentTemperature)
    || typeof weatherCode !== "number" || !Number.isFinite(weatherCode)
    || highTemperature === undefined || lowTemperature === undefined || uvIndex === undefined
  ) throw new Error("Invalid weather response");

  return {
    currentTemperature: Math.round(currentTemperature),
    highTemperature: Math.round(highTemperature),
    lowTemperature: Math.round(lowTemperature),
    uvIndex: Math.round(uvIndex),
    condition: weatherConditionFromCode(weatherCode),
  };
}

export async function fetchWeatherSnapshot(latitude: number, longitude: number): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,weather_code",
    daily: "temperature_2m_max,temperature_2m_min,uv_index_max",
    forecast_days: "1",
    timezone: "auto",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error("Weather request failed");
  return weatherSnapshotFromResponse(await response.json() as WeatherResponse);
}
