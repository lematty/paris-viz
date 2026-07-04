import type { Metadata } from "next";

const TITLE = "Pulse - Paris station ridership through the day";
const DESCRIPTION =
  "Every rail station of Île-de-France pulsing with its hourly ticket validations - watch the morning rush flow in and the evening rush flow out.";

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
