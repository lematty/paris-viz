import type { Metadata } from "next";

const TITLE = "Canicule - the Paris heat island";
const DESCRIPTION =
  "39,000 blocks of Paris and the petite couronne scored for heat: which neighbourhoods overheat, which never cool down at night, and who the heat endangers.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/canicule-og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/canicule-og.png"],
  },
};

export default function CaniculeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
