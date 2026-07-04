import type { Metadata } from "next";

const TITLE = "Flux — the Paris rail network in motion";
const DESCRIPTION =
  "Every scheduled métro, RER and tram trip of Île-de-France moving across the map through a full day. Play, scrub, and solo a line.";

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

export default function FluxLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
