"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BsCamera, BsGear, BsHouseDoor } from "react-icons/bs";

const destinations = [
  { href: "/", key: "home", Icon: BsHouseDoor },
  { href: "/analyze", key: "analyze", Icon: BsCamera },
  { href: "/settings", key: "settings", Icon: BsGear },
] as const;

export function AppNavigation() {
  const pathname = usePathname() ?? "/";
  const t = useTranslations("navigation");

  return (
    <nav aria-label={t("label")} className="app-navigation" data-testid="app-navigation">
      <div className="app-navigation-inner">
        <Link aria-label="AI StyleCue" className="app-navigation-brand" href="/">
          <Image alt="" height={36} src="/icon-192.png" width={36} />
          <span>AI StyleCue</span>
        </Link>
        <div className="app-navigation-links">
          {destinations.map((destination) => {
            const isCurrent = pathname === destination.href;
            const Icon = destination.Icon;
            return (
              <Link
                aria-label={t(
                  destination.key === "analyze" ? "analyzeOutfit" : destination.key,
                )}
                aria-current={isCurrent ? "page" : undefined}
                className={isCurrent ? "is-current" : undefined}
                href={destination.href}
                key={destination.href}
              >
                <span aria-hidden="true" className="app-navigation-icon">
                  <Icon data-testid={`navigation-icon-${destination.key}`} />
                </span>
                <span className="app-navigation-label">
                  {t(destination.key === "analyze" ? "analyzeOutfit" : destination.key)}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
