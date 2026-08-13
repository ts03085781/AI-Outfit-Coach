"use client";

import { useTranslations } from "next-intl";

import { AppNavigation } from "@/features/home/components/AppNavigation";
import { WeatherCard } from "@/features/home/components/WeatherCard";

const trendItems = ["linen", "shirt", "sneakers"] as const;

export default function HomePage() {
  const t = useTranslations("home");

  return (
    <main className="home-shell app-page-with-nav">
      <h1>{t("title")}</h1>
      <WeatherCard />
      <section aria-labelledby="trends-title" className="trend-section">
        <div className="section-heading">
          <div>
            <p>{t("trends.eyebrow")}</p>
          </div>
          <span>{t("trends.count")}</span>
        </div>
        <div className="trend-list">
          {trendItems.map((item) => {
            const title = t(`trends.items.${item}.title`);
            return (
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(title)}`}
                key={item}
                rel="noreferrer"
                target="_blank"
              >
                <article>
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
