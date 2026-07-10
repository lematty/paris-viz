import type { Metadata } from "next";

const TITLE = "Relief - the ridership landscape";
const DESCRIPTION =
  "Every rail station of Île-de-France as a mountain rising with its ticket validations per hour: a calm sea at 3am, ranges along the RER at 8:30, La Défense towering alone at 6pm.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/relief-og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/relief-og.png"],
  },
};

export default function ReliefLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
