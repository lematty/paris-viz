/** Public origin: the canonical domain on Vercel builds, localhost locally. */
export const SITE_URL = process.env.VERCEL
  ? "https://www.parisviz.com"
  : "http://localhost:7835";
