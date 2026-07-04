import type { Metadata } from "next";

const TITLE = "Relief - the ridership landscape of Paris";
const DESCRIPTION =
  "Île-de-France drawn as a living mountain range: every rail station is a peak rising and falling with its hourly ticket validations.";

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

export default function PulseLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
