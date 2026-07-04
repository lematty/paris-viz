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
        <Link className="card" href="/noctilien">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="card-thumb" src="/thumbs/noctilien.png" alt="" />
          <h2>{s.noctTitle}</h2>
          <p>{s.noctDesc}</p>
        </Link>
      </div>
    </main>
  );
}
