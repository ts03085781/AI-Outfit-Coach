import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { localeCookieName, resolveLocale, resolveLocaleList } from "@/lib/i18n/config";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 穿搭教練",
  description: "給今天的一點穿搭靈感"
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const headersList = await headers();
  const locale = cookieStore.has(localeCookieName)
    ? resolveLocale(cookieStore.get(localeCookieName)?.value)
    : resolveLocaleList(
      headersList.get("accept-language")?.split(",").map((value) => value.split(";")[0].trim()),
    );

  return (
    <html lang={locale}>
      <body><LocaleProvider initialLocale={locale}>{children}</LocaleProvider></body>
    </html>
  );
}
