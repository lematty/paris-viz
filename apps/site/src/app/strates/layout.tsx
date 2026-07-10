import type { Metadata } from "next";

const TITLE = "Strates - how old is Paris?";
const DESCRIPTION =
  "Every building in Paris colored by construction period, assembling year by year: the medieval core, the 1851-1914 explosion, then the concrete century.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/strates-og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/strates-og.png"],
  },
};

export default function StratesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
