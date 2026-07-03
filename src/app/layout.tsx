import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Noctilien Frequency Map",
  description:
    "Interactive heatmap of Paris Noctilien night-bus service frequency — see which areas are well served after midnight and which are not.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
