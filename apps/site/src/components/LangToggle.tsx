"use client";

import { useEffect } from "react";
import type { Lang } from "@/lib/lang";

export default function LangToggle({
  lang,
  onChange,
}: {
  lang: Lang;
  onChange: (lang: Lang) => void;
}) {
  // the html lang attribute is server-rendered as "en"; keep it honest for
  // screen readers and browser translators once the real language is known
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <div className="lang-toggle" role="radiogroup" aria-label="Language">
      {(["en", "fr"] as const).map((code) => (
        <button
          key={code}
          role="radio"
          aria-checked={lang === code}
          className={lang === code ? "active" : ""}
          onClick={() => onChange(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
