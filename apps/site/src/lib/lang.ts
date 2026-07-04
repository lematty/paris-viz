export type Lang = "en" | "fr";

// One key for the whole site: the choice made on any page follows the
// visitor everywhere.
const STORAGE_KEY = "paris-viz-lang";

export function loadLang(): Lang {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "fr" || stored === "en" ? stored : "en";
}

export function saveLang(lang: Lang): void {
  window.localStorage.setItem(STORAGE_KEY, lang);
}
