import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paris Viz — visualisations de données parisiennes",
  description:
    "Visualisations interactives des données ouvertes de Paris et d'Île-de-France : transports, mobilité, ville.",
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
