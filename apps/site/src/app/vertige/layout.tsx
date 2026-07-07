import type { Metadata } from "next";

const TITLE = "Vertige - how tall is Paris?";
const DESCRIPTION =
  "Every building in Paris in 3D, appearing floor by floor: the whole city tops out at the Haussmann roofline, then a handful of towers keep climbing alone.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/vertige-og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/vertige-og.png"],
  },
};

export default function VertigeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
