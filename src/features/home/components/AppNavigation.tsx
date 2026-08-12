"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const destinations = [
  { href: "/", key: "home", icon: "⌂" },
  { href: "/analyze", key: "analyze", icon: "◫" },
  { href: "/settings", key: "settings", icon: "⚙" },
] as const;

export function AppNavigation() {
  const pathname = usePathname() ?? "/";
  const t = useTranslations("navigation");

  return <nav aria-label={t("label")} className="app-navigation">
    {destinations.map((destination) => {
      const isCurrent = pathname === destination.href;
      return <Link aria-current={isCurrent ? "page" : undefined} className={isCurrent ? "is-current" : undefined} href={destination.href} key={destination.href}>
        <span aria-hidden="true">{destination.icon}</span>
        {t(destination.key === "analyze" ? "analyzeOutfit" : destination.key)}
      </Link>;
    })}
  </nav>;
}
