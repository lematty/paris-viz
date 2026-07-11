"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { SITE } from "@/lib/siteStrings";
import { THEMES } from "@/lib/vizCatalog";
import LangToggle from "@/components/LangToggle";

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
      {THEMES.map((theme) => (
        <section className="home-theme" key={theme.key}>
          <h2 className="theme-title">
            {theme.label}
            <span className="theme-note">{strings.themeNotes[theme.key]}</span>
          </h2>
          <div className="cards">
            {theme.vizzes.map((viz) => (
              <Link className="card" href={viz.href} key={viz.key}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="card-thumb"
                  src={`/thumbs/${viz.key}.png`}
                  alt=""
                />
                <h3>{strings.cards[viz.key].title}</h3>
                <p>{strings.cards[viz.key].desc}</p>
              </Link>
            ))}
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
