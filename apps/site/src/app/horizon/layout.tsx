import type { Metadata } from "next";

const TITLE = "Horizon - how far can you get?";
const DESCRIPTION =
  "Pick any station in Île-de-France and watch 75 minutes of travel ripple across the region: métro, RER, Transilien and tram, walking included.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function HorizonLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
