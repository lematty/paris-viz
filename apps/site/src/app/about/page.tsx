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
        <p className="about-links">
          <a href="https://data.iledefrance-mobilites.fr">
            data.iledefrance-mobilites.fr
          </a>
          {" · "}
          <a href="https://transport.data.gouv.fr/datasets/reseau-urbain-et-interurbain-dile-de-france-mobilites">
            IDFM GTFS
          </a>
          {" · "}
          <a href="https://www.airparif.fr">airparif.fr</a>
          {" · "}
          <a href="https://geoservices.ign.fr/bdtopo">IGN BD TOPO</a>
          {" · "}
          <a href="https://opendata.apur.org">opendata.apur.org</a>
          {" · "}
          <a href="https://data.iledefrance.fr">Institut Paris Region</a>
          {" · "}
          <a href="https://adresse.data.gouv.fr">adresse.data.gouv.fr</a>
          {" · "}
          <a href="https://insideairbnb.com">insideairbnb.com</a>
        </p>
      </section>
      <h2 className="about-permap">{t.perMapTitle}</h2>
      {THEMES.map((theme) =>
        theme.vizzes.map((viz) => {
          const info = INFO[viz.key][lang];
          return (
            <section className="about-viz" key={viz.key}>
              <div className="about-viz-text">
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
                <p className="about-open">
                  <Link href={viz.href}>{t.openMap}</Link>
                </p>
              </div>
              <Link className="about-thumb" href={viz.href}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/thumbs/${viz.key}.webp`} alt="" loading="lazy" />
              </Link>
            </section>
          );
        }),
      )}
    </main>
  );
}
