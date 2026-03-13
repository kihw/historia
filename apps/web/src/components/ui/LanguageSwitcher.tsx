"use client";

import { useTranslation } from "@/i18n";
import type { Locale } from "@/i18n";

const LOCALE_LABELS: Record<Locale, string> = {
  fr: "FR",
  en: "EN",
};

export function LanguageSwitcher({ compact }: { compact?: boolean }) {
  const { locale, setLocale } = useTranslation();
  const next: Locale = locale === "fr" ? "en" : "fr";

  return (
    <button
      onClick={() => setLocale(next)}
      style={{
        padding: compact ? "0.15rem 0.4rem" : "0.3rem 0.6rem",
        backgroundColor: "#1a1a1a",
        border: "1px solid #333",
        borderRadius: 4,
        color: "#888",
        fontSize: compact ? "0.7rem" : "0.78rem",
        fontWeight: 600,
        cursor: "pointer",
        letterSpacing: "0.05em",
      }}
      title={`Switch to ${LOCALE_LABELS[next]}`}
    >
      {LOCALE_LABELS[locale]}
    </button>
  );
}
