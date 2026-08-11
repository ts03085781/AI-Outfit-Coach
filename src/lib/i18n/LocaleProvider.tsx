"use client";

import { NextIntlClientProvider } from "next-intl";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import {
  defaultLocale,
  localeCookieName,
  resolveLocale,
  resolveLocaleList,
  type AppLocale,
} from "./config";
import { messages } from "./messages";

type LocaleProviderProps = {
  children: ReactNode;
  initialLocale?: AppLocale;
};

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
};

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

function readStoredLocale(): AppLocale {
  const cookie = document.cookie.split("; ").find((item) => item.startsWith(`${localeCookieName}=`));
  if (cookie) return resolveLocale(cookie.split("=")[1]);

  try {
    const localLocale = localStorage.getItem(localeCookieName);
    if (localLocale) return resolveLocale(localLocale);
  } catch {
    // Storage can be disabled by browser privacy settings.
  }

  return resolveLocaleList([...navigator.languages, navigator.language]);
}

export function LocaleProvider({ children, initialLocale }: LocaleProviderProps) {
  const parentContext = useContext(LocaleContext);
  const [locale, setLocale] = useState<AppLocale>(initialLocale ?? defaultLocale);

  useEffect(() => {
    if (!parentContext && !initialLocale) setLocale(readStoredLocale());
  }, [initialLocale, parentContext]);

  useEffect(() => {
    if (!parentContext) document.documentElement.lang = locale;
  }, [locale, parentContext]);

  if (parentContext) return children;

  return <LocaleContext.Provider value={{ locale, setLocale }}>
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="Asia/Taipei">
      {children}
    </NextIntlClientProvider>
  </LocaleContext.Provider>;
}

export function persistLocale(locale: AppLocale) {
  document.cookie = `${localeCookieName}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
  try {
    localStorage.setItem(localeCookieName, locale);
  } catch {
    // The cookie remains the durable preference when local storage is unavailable.
  }
}

export function useAppLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useAppLocale must be used within LocaleProvider");
  return context;
}
