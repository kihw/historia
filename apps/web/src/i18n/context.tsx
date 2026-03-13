"use client";

import {
  createContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Locale } from "./types";
import { DEFAULT_LOCALE } from "./types";
import { interpolate, resolve } from "./utils";
import fr from "./locales/fr.json";
import en from "./locales/en.json";

const translations: Record<Locale, Record<string, unknown>> = { fr, en };

export interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const I18nContext = createContext<I18nContextType>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("historia_locale") as Locale | null;
      if (stored === "fr" || stored === "en") return stored;
    }
    return DEFAULT_LOCALE;
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem("historia_locale", newLocale);
    document.documentElement.lang = newLocale;
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const value =
        resolve(translations[locale], key) ??
        resolve(translations[DEFAULT_LOCALE], key) ??
        key;
      return interpolate(value, params);
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}
