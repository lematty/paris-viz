import type { Metadata } from "next";

const TITLE = "Respire - a year of Paris air, hour by hour";
const DESCRIPTION =
  "Hourly air quality breathing over the Paris region map: winter smog episodes, clean windy days, and the 2020 lockdown clearing the sky.";

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

export default function AirLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
