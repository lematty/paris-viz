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
      {(["en", "fr"] as const).map((l) => (
        <button
          key={l}
          role="radio"
          aria-checked={lang === l}
          className={lang === l ? "active" : ""}
          onClick={() => onChange(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
