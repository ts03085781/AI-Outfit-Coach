import type { Metadata } from "next";
import { Chivo } from "next/font/google";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { localeCookieName, resolveLocale, resolveLocaleList } from "@/lib/i18n/config";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import "./globals.css";

const chivo = Chivo({
  subsets: ["latin"],
  variable: "--font-chivo",
  weight: ["300", "400", "700", "900"],
});

export const metadata: Metadata = {
  title: "AI StyleCue",
  description: "每天出門前，讓 AI 成為你的貼身穿搭顧問。只要選擇今天的場合並拍下穿搭，AI 就會分析整體搭配、指出亮點，並提供具體又容易實行的改善建議。無論是日常外出、約會、面試或正式活動，都能更快找到適合自己的搭配方向——不評判身材、不製造購物壓力，專注用現有衣物，幫你穿得更有自信。",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
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
      <body className={chivo.variable}>
        <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
