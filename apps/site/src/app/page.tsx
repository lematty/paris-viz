"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { SITE } from "@/lib/siteStrings";
import { THEMES } from "@/lib/vizCatalog";
import LangToggle from "@/components/LangToggle";

/** Cards that span two grid columns so the 4-viz Mouvement section fills
 * both rows instead of orphaning its last card. */
const WIDE_CARDS: ReadonlySet<string> = new Set(["flux", "noctilien"]);

export default function Home() {
  // start with the SSR default and adopt the stored choice after hydration
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => setLang(loadLang()), []);
  const strings = SITE[lang];

  return (
    <main className="home">
      <div className="home-header">
        <div>
          <h1>Paris Viz</h1>
          <p className="home-sub">{strings.tagline}</p>
        </div>
        <LangToggle
          lang={lang}
          onChange={(nextLang) => {
            setLang(nextLang);
            saveLang(nextLang);
          }}
        />
      </div>
      {THEMES.map((theme, themeIdx) => (
        <section className="home-theme" key={theme.key}>
          <h2 className="theme-title">
            {theme.label}
            <span className="theme-note">{strings.themeNotes[theme.key]}</span>
          </h2>
          <div className="cards">
            {theme.vizzes.map((viz, vizIdx) => {
              // the first row is likely above the fold: load it eagerly
              // and let the browser defer everything below
              const aboveFold = themeIdx === 0 && vizIdx < 2;
              return (
                <Link
                  className={
                    WIDE_CARDS.has(viz.key) ? "card card-wide" : "card"
                  }
                  href={viz.href}
                  key={viz.key}
                >
                  <div className="card-media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="card-thumb"
                      src={`/thumbs/${viz.key}.webp`}
                      alt=""
                      loading={aboveFold ? "eager" : "lazy"}
                      fetchPriority={
                        themeIdx === 0 && vizIdx === 0 ? "high" : undefined
                      }
                    />
                  </div>
                  <div className="card-body">
                    <h3>{strings.cards[viz.key].title}</h3>
                    <p>{strings.cards[viz.key].desc}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
      <section className="about">
        <h2>{strings.aboutTitle}</h2>
        <p>{strings.aboutBody}</p>
        <p>{strings.aboutRefresh}</p>
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
          {" · "}
          <a href="https://github.com/lematty/paris-viz">GitHub</a>
        </p>
      </section>
    </main>
  );
}
