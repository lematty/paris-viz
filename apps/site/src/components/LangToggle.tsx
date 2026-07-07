"use client";

import type { Lang } from "@/lib/lang";

export default function LangToggle({
  lang,
  onChange,
}: {
  lang: Lang;
  onChange: (lang: Lang) => void;
}) {
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
