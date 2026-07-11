"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { SITE } from "@/lib/siteStrings";
import { ABOUT, INFO, INFO_LABELS } from "@/lib/infoStrings";
import { THEMES } from "@/lib/vizCatalog";
import LangToggle from "@/components/LangToggle";

/** The site-wide reference page: the overall approach and refresh cadence,
 * then sources and methods for every map, reusing the same content as the
 * per-map info panels. */
export default function About() {
  // start with the SSR default and adopt the stored choice after hydration
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => setLang(loadLang()), []);
  const site = SITE[lang];
  const t = ABOUT[lang];
  const sourcesLabel = INFO_LABELS[lang].sources;

  return (
    <main className="home">
      <div className="home-header">
        <div>
          <a className="home-link" href="/">
            ← Paris Viz
          </a>
          <h1>{t.title}</h1>
        </div>
        <LangToggle
          lang={lang}
          onChange={(nextLang) => {
            setLang(nextLang);
            saveLang(nextLang);
          }}
        />
      </div>
      <section className="about about-lead">
        <p>{site.aboutBody}</p>
        <p>{site.aboutRefresh}</p>
        <p>
          {t.code}{" "}
          <a href="https://github.com/lematty/paris-viz">{t.codeLink}</a>
        </p>
      </section>
      <h2 className="about-permap">{t.perMapTitle}</h2>
      {THEMES.map((theme) =>
        theme.vizzes.map((viz) => {
          const info = INFO[viz.key][lang];
          return (
            <section className="about-viz" key={viz.key}>
              <h2>
                <Link href={viz.href}>{site.cards[viz.key].title}</Link>
              </h2>
              {info.body.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
              <p className="viz-sources">
                {sourcesLabel}
                {lang === "fr" ? " : " : ": "}
                {info.sources.map((source, i) => (
                  <span key={source.href}>
                    {i > 0 && " · "}
                    <a href={source.href}>{source.label}</a>
                  </span>
                ))}
              </p>
            </section>
          );
        }),
      )}
    </main>
  );
}
