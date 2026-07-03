import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Noctilien — fréquence des bus de nuit",
  description:
    "Carte interactive de la fréquence des bus Noctilien à Paris et en Île-de-France : quels quartiers sont bien desservis la nuit, et lesquels ne le sont pas.",
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
