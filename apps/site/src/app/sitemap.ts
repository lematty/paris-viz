import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";
import { THEMES } from "@/lib/vizCatalog";

export default function sitemap(): MetadataRoute.Sitemap {
  const vizPaths = THEMES.flatMap((theme) => theme.vizzes.map((viz) => viz.href));
  return ["", ...vizPaths, "/about"].map((path) => ({
    url: `${SITE_URL}${path}`,
  }));
}
