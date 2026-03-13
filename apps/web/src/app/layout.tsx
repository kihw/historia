import type { Metadata } from "next";
import { I18nProvider } from "@/i18n";

export const metadata: Metadata = {
  title: "Historia - Geopolitical Sandbox",
  description:
    "A geopolitical sandbox game combining historical simulation and AI-driven narrative freedom.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          backgroundColor: "#0a0a0a",
          color: "#e0e0e0",
        }}
      >
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
