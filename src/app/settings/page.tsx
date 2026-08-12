"use client";

import { useTranslations } from "next-intl";

import { AppNavigation } from "@/features/home/components/AppNavigation";

export default function SettingsPage() {
  const t = useTranslations("settings");
  return <main className="settings-shell app-page-with-nav"><section><p>{t("eyebrow")}</p><h1>{t("title")}</h1><p>{t("description")}</p></section><AppNavigation /></main>;
}
