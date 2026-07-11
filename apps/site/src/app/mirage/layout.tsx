import type { Metadata } from "next";

const TITLE = "Mirage - the tourist flats";
const DESCRIPTION =
  "Every Airbnb listing in Paris colored by registration status, arriving year by year: half of today's stock appeared since mid-2023.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/mirage-og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/mirage-og.png"],
  },
};

export default function MirageLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
