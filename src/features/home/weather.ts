export type WeatherCondition = "clear" | "partlyCloudy" | "cloudy" | "fog" | "rain" | "snow" | "storm";

export type WeatherSnapshot = {
  currentTemperature: number;
  highTemperature: number;
  lowTemperature: number;
  uvIndex: number;
  condition: WeatherCondition;
};

export type WeatherCoordinates = {
  latitude: number;
  longitude: number;
};

export type CachedWeather = WeatherCoordinates & {
  snapshot: WeatherSnapshot;
  cachedAt: number;
};

export const WEATHER_CACHE_KEY = "ai-outfit-coach.weather";
export const WEATHER_CACHE_TTL_MS = 60 * 60_000;
export const WEATHER_CACHE_DISTANCE_KM = 5;

const weatherConditions: WeatherCondition[] = [
  "clear",
  "partlyCloudy",
  "cloudy",
  "fog",
  "rain",
  "snow",
  "storm",
];

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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isWeatherSnapshot(value: unknown): value is WeatherSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return isFiniteNumber(snapshot.currentTemperature)
    && isFiniteNumber(snapshot.highTemperature)
    && isFiniteNumber(snapshot.lowTemperature)
    && isFiniteNumber(snapshot.uvIndex)
    && typeof snapshot.condition === "string"
    && weatherConditions.includes(snapshot.condition as WeatherCondition);
}

function distanceInKilometres(from: WeatherCoordinates, to: WeatherCoordinates): number {
  const degreesToRadians = Math.PI / 180;
  const latitudeDelta = (to.latitude - from.latitude) * degreesToRadians;
  const longitudeDelta = (to.longitude - from.longitude) * degreesToRadians;
  const fromLatitude = from.latitude * degreesToRadians;
  const toLatitude = to.latitude * degreesToRadians;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function readCachedWeather(storage: Pick<Storage, "getItem">): CachedWeather | undefined {
  try {
    const serialized = storage.getItem(WEATHER_CACHE_KEY);
    if (!serialized) return undefined;
    const value = JSON.parse(serialized) as Record<string, unknown>;
    if (
      !value || typeof value !== "object"
      || !isFiniteNumber(value.latitude)
      || !isFiniteNumber(value.longitude)
      || !isFiniteNumber(value.cachedAt)
      || !isWeatherSnapshot(value.snapshot)
    ) return undefined;
    return value as CachedWeather;
  } catch {
    return undefined;
  }
}

export function writeCachedWeather(
  storage: Pick<Storage, "setItem">,
  cachedWeather: CachedWeather,
): void {
  storage.setItem(WEATHER_CACHE_KEY, JSON.stringify(cachedWeather));
}

export function shouldRefreshWeather(
  cachedWeather: CachedWeather,
  coordinates: WeatherCoordinates,
  now: number,
): boolean {
  return now - cachedWeather.cachedAt > WEATHER_CACHE_TTL_MS
    || distanceInKilometres(cachedWeather, coordinates) > WEATHER_CACHE_DISTANCE_KM;
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
