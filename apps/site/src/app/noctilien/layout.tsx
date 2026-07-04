import type { Metadata } from "next";

const TITLE = "Noctilien - fréquence des bus de nuit";
const DESCRIPTION =
  "Carte interactive de la fréquence des bus Noctilien à Paris et en Île-de-France : quels quartiers sont bien desservis la nuit, et lesquels ne le sont pas.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    locale: "fr_FR",
    images: [{ url: "/noctilien-og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/noctilien-og.png"],
  },
};

export default function NoctilienLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
