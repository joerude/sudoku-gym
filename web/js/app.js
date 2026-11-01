// Hash router + nav + global Ctrl+V of a grid.
import { LANGS, lang, setLang, tr } from "./i18n.js";
import { initAppearance } from "./appearance.js";
import { parseGrid } from "./board.js";
import * as play from "./play.js";
import * as review from "./review.js";
import * as settings from "./settings.js";
import * as drills from "./drills.js";
import * as stats from "./stats.js";
import * as theory from "./theory.js";
import { errorBox, initZen, isZen, keyTrace, setZen, themeButton, typingInto } from "./ui.js";

const ROUTES = [
  [/^play$/, play.mount, "play"],
  [/^review\/(\d+)$/, review.mount, "stats"],
  [/^drills$/, drills.mount, "drills"],
  [/^stats$/, stats.mount, "stats"],
  [/^theory$/, theory.mountList, "theory"],
  [/^theory\/([^/]+)$/, theory.mountPage, "theory"],
  [/^settings$/, settings.mount, "settings"],
];
const TITLES = { play: tr("Играть"), drills: tr("Упражнения"), stats: tr("Статистика"), theory: tr("Теория"), settings: tr("Вид") };
const ZEN_PAGES = new Set(["play", "drills"]);

initAppearance();
const app = document.getElementById("app");
let cleanup = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs = ""] = raw.split("?");
  return { path: path || "play", query: Object.fromEntries(new URLSearchParams(qs)) };
}

function route() {
  const { path, query } = parseHash();
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
  app.textContent = "";
  const hit = ROUTES.map(([re, fn, nav]) => [re.exec(path), fn, nav]).find(([m]) => m);
  if (!hit) { location.replace("#/play"); return; }
  const [m, fn, nav] = hit;
  for (const a of document.querySelectorAll("#nav a")) {
    const on = a.dataset.route === nav;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  document.title = `${TITLES[nav] || "Sudoku Gym"} · Sudoku Gym`;
  document.body.classList.toggle("zen-page", ZEN_PAGES.has(nav));
  if (zenHome) zenHome.hidden = nav === "play";  // «Играть» is home: no link to itself
  themeBtn?.sync();
  try {
    const res = fn(app, m.slice(1).map(decodeURIComponent), query);
    cleanup = typeof res === "function" ? res : null;
  } catch (e) {
    app.append(errorBox(e));
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);
const themeBtn = themeButton();  // re-synced on every route: #/settings may have changed the theme
// header language switch RU ⇄ EN (a reload: texts are taken once at startup) and the static texts of index.html
const other = LANGS.find(l => l.id !== lang);
const langBtn = Object.assign(document.createElement("button"), { type: "button", className: "lang-toggle", id: "langBtn",
  textContent: other.short, title: `${other.name} — ${tr("сменить язык")}`, onclick: () => setLang(other.id) });
document.querySelector(".top-in").append(themeBtn, langBtn);
for (const a of document.querySelectorAll("#nav a")) a.textContent = TITLES[a.dataset.route];
document.getElementById("nav").setAttribute("aria-label", tr("Разделы"));
const zenHome = document.querySelector(".zen-home");
if (zenHome) Object.assign(zenHome, { textContent: `← ${TITLES.play}`, title: tr("На главную (zen остаётся для доски)") });
initZen();

// Z toggles zen mode on the board pages. Esc leaves zen first; otherwise it goes to «Играть» (the main page),
// and there a game in progress asks before it is thrown away. Dialogs (reward, confirm) catch their own Esc.
document.addEventListener("keydown", e => {
  if (typingInto(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  const zenPage = document.body.classList.contains("zen-page");
  if (zenPage && e.code === "KeyZ") { setZen(!isZen()); e.preventDefault(); return; }
  if (e.key !== "Escape") return;
  if (zenPage && isZen()) setZen(false);
  else if (parseHash().path !== "play") location.hash = "#/play";
  else play.escape();
  e.preventDefault();
});

// http://127.0.0.1:8765/?debug — shows what each key press reaches, to diagnose keyboard problems in a browser.
if (new URLSearchParams(location.search).has("debug")) {
  const box = document.createElement("pre");
  box.className = "keylog";
  box.textContent = tr("нажми клавишу…");
  document.body.append(box);
  const log = [];
  const show = () => {
    const env = tr("обработчик клавиш: {page} · страница редактируемая: {editable}", { page: keyTrace.page || tr("НЕТ"), editable: document.body.isContentEditable || document.designMode === "on" ? tr("ДА") : tr("нет") });
    box.textContent = [env, ...log.slice(0, 8)].join("\n");
  };
  window.addEventListener("keydown", e => {
    const t = e.target, a = document.activeElement;
    setTimeout(() => {  // after the page handlers ran
      log.unshift(`${e.key} (${e.code}) → ${t.tagName}${t.id ? "#" + t.id : ""}, ${tr("фокус")} ${a?.tagName}${a?.id ? "#" + a.id : ""}, `
        + (e.defaultPrevented ? tr("обработано") : tr("НЕ обработано")) + (keyTrace.skip ? ` — ${keyTrace.skip}` : ""));
      show();
    });
  }, true);
  const err = text => { log.unshift(tr("ОШИБКА: {text}", { text })); show(); };
  window.addEventListener("error", e => err(`${e.message} (${(e.filename || "").split("/").pop()}:${e.lineno})`));
  window.addEventListener("unhandledrejection", e => err(String(e.reason?.message || e.reason)));
  window.addEventListener("hashchange", () => setTimeout(show));
  setTimeout(show);
}

// After a mouse click (detail > 0) drop focus from buttons/checkboxes, and after picking an option from a select,
// so digits, Space and Enter go to the board. Keyboard (Tab) users keep focus as usual.
document.addEventListener("click", e => {
  if (e.detail > 0 && e.target.closest("button, label, input[type=checkbox], input[type=radio]")) document.activeElement?.blur?.();
});
document.addEventListener("change", e => { if (e.target.tagName === "SELECT") e.target.blur(); });
route();

// Ctrl+V anywhere outside text inputs: a pasted grid becomes a custom game.
document.addEventListener("paste", e => {
  const t = e.target.tagName;
  if (t === "INPUT" || t === "TEXTAREA" || e.target.isContentEditable) return;
  const text = e.clipboardData?.getData("text") ?? "";
  if (!parseGrid(text)) {
    if (parseHash().path === "play") play.loadCustom(text);
    return;
  }
  e.preventDefault();
  if (parseHash().path !== "play") location.hash = "#/play";
  play.loadCustom(text);
});
