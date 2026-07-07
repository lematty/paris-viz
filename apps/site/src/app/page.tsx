"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadLang, saveLang, type Lang } from "@/lib/lang";
import { SITE } from "@/lib/siteStrings";
import LangToggle from "@/components/LangToggle";

export default function Home() {
  // start with the SSR default and adopt the stored choice after hydration
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => setLang(loadLang()), []);
  const s = SITE[lang];

  return (
    <main className="home">
      <div className="home-header">
        <div>
          <h1>Paris Viz</h1>
          <p className="home-sub">{s.tagline}</p>
        </div>
        <LangToggle
          lang={lang}
          onChange={(l) => {
            setLang(l);
            saveLang(l);
          }}
        />
      </div>
      <div className="cards">
        <Link className="card" href="/flux">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="card-thumb" src="/thumbs/flux.png" alt="" />
          <h2>{s.fluxTitle}</h2>
          <p>{s.fluxDesc}</p>
        </Link>
        <Link className="card" href="/air">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="card-thumb" src="/thumbs/air.png" alt="" />
          <h2>{s.airTitle}</h2>
          <p>{s.airDesc}</p>
        </Link>
        <Link className="card" href="/horizon">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="card-thumb" src="/thumbs/horizon.png" alt="" />
          <h2>{s.horizonTitle}</h2>
          <p>{s.horizonDesc}</p>
        </Link>
        <Link className="card" href="/vertige">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="card-thumb" src="/thumbs/vertige.png" alt="" />
          <h2>{s.vertigeTitle}</h2>
          <p>{s.vertigeDesc}</p>
        </Link>
        <Link className="card" href="/noctilien">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="card-thumb" src="/thumbs/noctilien.png" alt="" />
          <h2>{s.noctTitle}</h2>
          <p>{s.noctDesc}</p>
        </Link>
      </div>
      <section className="about">
        <h2>{s.aboutTitle}</h2>
        <p>{s.aboutBody}</p>
        <p>{s.aboutRefresh}</p>
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
          <a href="https://adresse.data.gouv.fr">adresse.data.gouv.fr</a>
          {" · "}
          <a href="https://github.com/lematty/paris-viz">GitHub</a>
        </p>
      </section>
    </main>
  );
}
