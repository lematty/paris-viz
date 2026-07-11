import type { Metadata } from "next";

const TITLE = "About the data - Paris Viz";
const DESCRIPTION =
  "Where the data comes from and how each map is built: sources and methods for every visualization of the atlas.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function AboutLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
