"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BsCloud,
  BsCloudFog,
  BsCloudLightningRain,
  BsCloudRain,
  BsCloudSun,
  BsSnow,
  BsSun,
} from "react-icons/bs";

import {
  fetchWeatherSnapshot,
  readCachedWeather,
  shouldRefreshWeather,
  type WeatherSnapshot,
  writeCachedWeather,
} from "@/features/home/weather";

type WeatherState = { status: "loading" | "unavailable" | "blocked" | "ready"; snapshot?: WeatherSnapshot };

function iconFor(condition: WeatherSnapshot["condition"]) {
  return ({
    clear: BsSun,
    partlyCloudy: BsCloudSun,
    cloudy: BsCloud,
    fog: BsCloudFog,
    rain: BsCloudRain,
    snow: BsSnow,
    storm: BsCloudLightningRain,
  })[condition];
}

export function uvRiskLevelFor(uvIndex: number) {
  if (uvIndex <= 2) return "low";
  if (uvIndex <= 5) return "moderate";
  if (uvIndex <= 7) return "high";
  if (uvIndex <= 10) return "veryHigh";
  return "extreme";
}

export function WeatherCard() {
  const t = useTranslations("home.weather");
  const [weather, setWeather] = useState<WeatherState>({ status: "loading" });

  const requestWeather = (force = false) => {
    const cachedWeather = readCachedWeather(localStorage);
    if (cachedWeather) {
      setWeather({ status: "ready", snapshot: cachedWeather.snapshot });
    } else {
      setWeather({ status: "loading" });
    }
    if (!navigator.geolocation) {
      if (!cachedWeather) setWeather({ status: "unavailable" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const coordinates = { latitude: coords.latitude, longitude: coords.longitude };
        if (cachedWeather && !force && !shouldRefreshWeather(cachedWeather, coordinates, Date.now())) return;
        try {
          const snapshot = await fetchWeatherSnapshot(coordinates.latitude, coordinates.longitude);
          writeCachedWeather(localStorage, { ...coordinates, snapshot, cachedAt: Date.now() });
          setWeather({ status: "ready", snapshot });
        } catch {
          if (!cachedWeather) setWeather({ status: "unavailable" });
        }
      },
      (error) => {
        if (!cachedWeather) {
          setWeather({ status: error.code === error.PERMISSION_DENIED ? "blocked" : "unavailable" });
        }
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 15 * 60_000 },
    );
  };

  useEffect(() => { requestWeather(); }, []);

  if (weather.status !== "ready" || !weather.snapshot) return <section aria-live="polite" className="weather-card weather-card-empty">
    {weather.status === "loading" ? <p>{t("loading")}</p> : <button onClick={() => requestWeather(true)} type="button">{t(weather.status === "blocked" ? "blocked" : "retry")}</button>}
  </section>;

  const snapshot = weather.snapshot;
  const WeatherIcon = iconFor(snapshot.condition);
  return <section aria-label={t("label")} className="weather-card">
    <div className="weather-main">
      <div><p className="weather-location">{t("location")}</p><p className="weather-temperature">{snapshot.currentTemperature}°</p><p className="weather-condition">{t(`condition.${snapshot.condition}`)}</p></div>
      <span aria-hidden="true" className="weather-icon"><WeatherIcon data-testid={`weather-icon-${snapshot.condition}`} /></span>
    </div>
    <dl className="weather-details">
      <div><dt>{t("range")}</dt><dd>{snapshot.lowTemperature}° — {snapshot.highTemperature}°</dd></div>
      <div><dt>{t("uv")}</dt><dd>{snapshot.uvIndex}<small>{t(`uvRisk.${uvRiskLevelFor(snapshot.uvIndex)}`)}</small></dd></div>
    </dl>
  </section>;
}
