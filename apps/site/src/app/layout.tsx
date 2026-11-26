import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SITE_URL } from "@/lib/siteUrl";
import "./globals.css";

const TITLE = "Paris Viz - Paris open-data visualizations";
const DESCRIPTION =
  "Interactive visualizations of open data from Paris and Île-de-France: transit, mobility, the city itself.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* only on Vercel builds: local prod has no /_vercel/insights
            endpoint, and the 404 would break the hermetic test suite */}
        {process.env.VERCEL && <Analytics />}
      </body>
    </html>
  );
}
