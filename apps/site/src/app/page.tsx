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
      <div className="cards">
        <Link className="card" href="/flux">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="card-thumb" src="/thumbs/flux.png" alt="" />
          <h2>{strings.fluxTitle}</h2>
          <p>{strings.fluxDesc}</p>
        </Link>
        <Link className="card" href="/air">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="card-thumb" src="/thumbs/air.png" alt="" />
          <h2>{strings.airTitle}</h2>
          <p>{strings.airDesc}</p>
        </Link>
        <Link className="card" href="/horizon">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="card-thumb" src="/thumbs/horizon.png" alt="" />
          <h2>{strings.horizonTitle}</h2>
          <p>{strings.horizonDesc}</p>
        </Link>
        <Link className="card" href="/vertige">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="card-thumb" src="/thumbs/vertige.png" alt="" />
          <h2>{strings.vertigeTitle}</h2>
          <p>{strings.vertigeDesc}</p>
        </Link>
        <Link className="card" href="/strates">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="card-thumb" src="/thumbs/strates.png" alt="" />
          <h2>{strings.stratesTitle}</h2>
          <p>{strings.stratesDesc}</p>
        </Link>
        <Link className="card" href="/canicule">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="card-thumb" src="/thumbs/canicule.png" alt="" />
          <h2>{strings.caniculeTitle}</h2>
          <p>{strings.caniculeDesc}</p>
        </Link>
        <Link className="card" href="/relief">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="card-thumb" src="/thumbs/relief.png" alt="" />
          <h2>{strings.reliefTitle}</h2>
          <p>{strings.reliefDesc}</p>
        </Link>
        <Link className="card" href="/noctilien">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="card-thumb" src="/thumbs/noctilien.png" alt="" />
          <h2>{strings.noctTitle}</h2>
          <p>{strings.noctDesc}</p>
        </Link>
      </div>
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
          <a href="https://github.com/lematty/paris-viz">GitHub</a>
        </p>
      </section>
    </main>
  );
}
