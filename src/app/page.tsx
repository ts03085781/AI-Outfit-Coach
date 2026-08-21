"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { AppNavigation } from "@/features/home/components/AppNavigation";
import { WeatherCard } from "@/features/home/components/WeatherCard";

const trendItems = ["linen", "shirt", "sneakers"] as const;

export default function HomePage() {
  const t = useTranslations("home");

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
          {trendItems.map((item, index) => {
            const title = t(`trends.items.${item}.title`);
            return (
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(title)}`}
                key={item}
                rel="noreferrer"
                target="_blank"
              >
                <article>
                  <span aria-hidden="true" className="trend-index">0{index + 1}</span>
                  <span aria-hidden="true" className={`trend-swatch ${item}`} />
                  <div>
                    <h3>{title}</h3>
                    <p>{t(`trends.items.${item}.description`)}</p>
                  </div>
                </article>
              </a>
            );
          })}
        </div>
      </section>
      <AppNavigation />
    </main>
  );
}
