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

import { fetchWeatherSnapshot, type WeatherSnapshot } from "@/features/home/weather";

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

export function WeatherCard() {
  const t = useTranslations("home.weather");
  const [weather, setWeather] = useState<WeatherState>({ status: "loading" });

  const requestWeather = () => {
    if (!navigator.geolocation) {
      setWeather({ status: "unavailable" });
      return;
    }
    setWeather({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          setWeather({ status: "ready", snapshot: await fetchWeatherSnapshot(coords.latitude, coords.longitude) });
        } catch {
          setWeather({ status: "unavailable" });
        }
      },
      (error) => setWeather({ status: error.code === error.PERMISSION_DENIED ? "blocked" : "unavailable" }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 15 * 60_000 },
    );
  };

  useEffect(() => { requestWeather(); }, []);

  if (weather.status !== "ready" || !weather.snapshot) return <section aria-live="polite" className="weather-card weather-card-empty">
    {weather.status === "loading" ? <p>{t("loading")}</p> : <button onClick={requestWeather} type="button">{t(weather.status === "blocked" ? "blocked" : "retry")}</button>}
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
      <div><dt>{t("uv")}</dt><dd>{snapshot.uvIndex}</dd></div>
    </dl>
  </section>;
}
