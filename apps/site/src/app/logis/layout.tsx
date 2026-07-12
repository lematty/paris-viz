import type { Metadata } from "next";

const TITLE = "Logis - where social housing is";
const DESCRIPTION =
  "A quarter-million Paris social dwellings mapped by financing and year: the pink HBM belt, the post-war estates, and since 2000 a wave of buildings bought and converted.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/logis-og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/logis-og.png"],
  },
};

export default function LogisLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
