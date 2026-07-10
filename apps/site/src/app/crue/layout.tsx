import type { Metadata } from "next";

const TITLE = "Crue - the Seine rising through Paris";
const DESCRIPTION =
  "Raise the Seine through the 3D city, centimeter by centimeter over the IGN terrain: the quays go under at 6 m, and at 8.62 m the flood of 1910 returns.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/crue-og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/crue-og.png"],
  },
};

export default function CrueLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
