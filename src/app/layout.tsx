import type { Metadata } from "next";
import "./globals.css";

const TITLE = "Noctilien — fréquence des bus de nuit";
const DESCRIPTION =
  "Carte interactive de la fréquence des bus Noctilien à Paris et en Île-de-France : quels quartiers sont bien desservis la nuit, et lesquels ne le sont pas.";

export const metadata: Metadata = {
  // Vercel injects the production URL; local builds fall back harmlessly.
  metadataBase: process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
    : new URL("http://localhost:3000"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    locale: "fr_FR",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
