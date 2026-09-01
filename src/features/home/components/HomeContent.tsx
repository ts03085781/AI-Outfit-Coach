"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { getFallbackTrends } from "@/features/trends/fallback";
import { getLocalizedTrend, TrendManifestSchema, type TrendManifest } from "@/features/trends/domain";
import { useAppLocale } from "@/lib/i18n/LocaleProvider";

import { WeatherCard } from "./WeatherCard";

type TrendState =
  | { status: "loading" }
  | { status: "success"; manifest: TrendManifest }
  | { status: "fallback" };

export function HomeContent() {
  const t = useTranslations("home");
  const { locale } = useAppLocale();
  const [trendState, setTrendState] = useState<TrendState>({ status: "loading" });
  const trends = trendState.status === "success"
    ? trendState.manifest.items.map((item) => getLocalizedTrend(item, locale))
    : getFallbackTrends(locale);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTrends() {
      try {
        const response = await fetch("/api/trends", { signal: controller.signal });
        const payload: unknown = response.ok ? await response.json() : null;
        if (controller.signal.aborted) return;

        if (!payload || typeof payload !== "object" || !("manifest" in payload)) {
          setTrendState({ status: "fallback" });
          return;
        }

        const candidate = (payload as { manifest?: unknown }).manifest;
        if (candidate === null) {
          setTrendState({ status: "fallback" });
          return;
        }

        const parsed = TrendManifestSchema.safeParse(candidate);
        setTrendState(parsed.success
          ? { status: "success", manifest: parsed.data }
          : { status: "fallback" });
      } catch {
        if (!controller.signal.aborted) setTrendState({ status: "fallback" });
      }
    }

    void loadTrends();
    return () => controller.abort();
  }, []);

  return (
    <main className="editorial-page home-shell app-page-with-nav">
      <section aria-labelledby="home-title" className="home-hero">
        <p className="home-kicker">{t("eyebrow")}</p>
        <h1 id="home-title">{t("title")}</h1>
        <p className="home-intro">{t("weather.label")} × {t("trends.eyebrow")}</p>
        <Link className="home-analysis-cta" href="/analyze">
          <span>{t("cta")}</span>
          <span aria-hidden="true">→</span>
        </Link>
      </section>
      <section aria-labelledby="weather-title" className="home-weather-section">
        <div className="home-section-label">
          <p>01 / {t("weather.label")}</p>
          <span aria-hidden="true">{t("currentConditions")}</span>
        </div>
        <h2 id="weather-title">{t("weather.label")}</h2>
        <WeatherCard />
      </section>
      <section aria-labelledby="trends-title" className="trend-section">
        <div className="home-section-label">
          <p>02 / {t("trends.eyebrow")}</p>
          <span>{t("trends.count")}</span>
        </div>
        <h2 id="trends-title">{t("trends.title")}</h2>
        <div className="trend-list">
          {trendState.status === "loading"
            ? Array.from({ length: 5 }, (_, index) => (
              <article aria-hidden="true" data-testid="trend-skeleton" key={index}>
                <span className="trend-skeleton-swatch" />
                <span className="trend-skeleton-copy">
                  <span className="trend-skeleton-line" />
                  <span className="trend-skeleton-line" />
                </span>
              </article>
            ))
            : trends.map((item, index) => (
              <article key={item.id}>
                {item.imageUrl ? (
                  <Image
                    alt=""
                    className="trend-image"
                    height={96}
                    sizes="72px"
                    src={item.imageUrl}
                    width={96}
                  />
                ) : (
                  <span aria-hidden="true" className={`trend-swatch trend-swatch-${index + 1}`} />
                )}
                <div className="trend-copy">
                  <h3>
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(item.name)}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {item.name}
                    </a>
                  </h3>
                  <p>{item.description}</p>
                  {item.sources.length > 0 && (
                    <a className="trend-source" href={item.sources[0].url} rel="noreferrer" target="_blank">
                      {t("trends.source")}: {item.sources[0].title} ↗
                    </a>
                  )}
                </div>
              </article>
            ))}
        </div>
      </section>
    </main>
  );
}
