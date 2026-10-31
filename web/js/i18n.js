// Interface language: Russian (the source text) or English. tr("русский текст {x}", {x}) returns the English
// version from en.js when the language is English; a missing translation falls back to Russian.
// The language is read once at startup, so switching it reloads the page.
import EN from "./en.js";

const KEY = "gym-lang";
export const LANGS = [{ id: "ru", name: "Русский", short: "RU" }, { id: "en", name: "English", short: "EN" }];

function detect() {
  try { const v = localStorage.getItem(KEY); if (LANGS.some(l => l.id === v)) return v; } catch { /* no storage */ }
  return /^ru\b/i.test(navigator.language || "") ? "ru" : "en";
}
export const lang = detect();
document.documentElement.lang = lang;

export function tr(ru, vars) {
  const s = lang === "en" ? EN[ru] ?? ru : ru;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

export function setLang(id) {
  try { localStorage.setItem(KEY, id); } catch { /* no storage */ }
  location.reload();
}
