// Hash router + nav + global Ctrl+V of a grid.
import { initAppearance } from "./appearance.js";
import { parseGrid } from "./board.js";
import * as play from "./play.js";
import * as review from "./review.js";
import * as settings from "./settings.js";
import * as drills from "./drills.js";
import * as stats from "./stats.js";
import * as theory from "./theory.js";
import * as today from "./today.js";
import { errorBox, initZen, isZen, keyTrace, setZen, themeButton, typingInto } from "./ui.js";

const ROUTES = [
  [/^today$/, today.mount, "today"],
  [/^play$/, play.mount, "play"],
  [/^review\/(\d+)$/, review.mount, "stats"],
  [/^drills$/, drills.mount, "drills"],
  [/^stats$/, stats.mount, "stats"],
  [/^theory$/, theory.mountList, "theory"],
  [/^theory\/([^/]+)$/, theory.mountPage, "theory"],
  [/^settings$/, settings.mount, "settings"],
];
const TITLES = { today: "Сегодня", play: "Играть", drills: "Упражнения", stats: "Статистика", theory: "Теория", settings: "Вид" };
const ZEN_PAGES = new Set(["play", "drills"]);

initAppearance();
const app = document.getElementById("app");
let cleanup = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs = ""] = raw.split("?");
  return { path: path || "today", query: Object.fromEntries(new URLSearchParams(qs)) };
}

function route() {
  const { path, query } = parseHash();
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
  app.textContent = "";
  const hit = ROUTES.map(([re, fn, nav]) => [re.exec(path), fn, nav]).find(([m]) => m);
  if (!hit) { location.replace("#/today"); return; }
  const [m, fn, nav] = hit;
  for (const a of document.querySelectorAll("#nav a")) {
    const on = a.dataset.route === nav;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  document.title = `${TITLES[nav] || "Sudoku Gym"} · Sudoku Gym`;
  document.body.classList.toggle("zen-page", ZEN_PAGES.has(nav));
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
document.querySelector(".top-in").append(themeBtn);
initZen();

// Z toggles zen mode on the board pages, Esc leaves it.
document.addEventListener("keydown", e => {
  if (!document.body.classList.contains("zen-page") || typingInto(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === "KeyZ" || (e.key === "Escape" && isZen())) { setZen(e.key === "Escape" ? false : !isZen()); e.preventDefault(); }
});

// http://127.0.0.1:8765/?debug — shows what each key press reaches, to diagnose keyboard problems in a browser.
if (new URLSearchParams(location.search).has("debug")) {
  const box = document.createElement("pre");
  box.className = "keylog";
  box.textContent = "нажми клавишу…";
  document.body.append(box);
  const log = [];
  const show = () => {
    const env = `обработчик клавиш: ${keyTrace.page || "НЕТ"} · страница редактируемая: `
      + `${document.body.isContentEditable || document.designMode === "on" ? "ДА" : "нет"}`;
    box.textContent = [env, ...log.slice(0, 8)].join("\n");
  };
  window.addEventListener("keydown", e => {
    const t = e.target, a = document.activeElement;
    setTimeout(() => {  // after the page handlers ran
      log.unshift(`${e.key} (${e.code}) → ${t.tagName}${t.id ? "#" + t.id : ""}, фокус ${a?.tagName}${a?.id ? "#" + a.id : ""}, `
        + (e.defaultPrevented ? "обработано" : "НЕ обработано") + (keyTrace.skip ? ` — ${keyTrace.skip}` : ""));
      show();
    });
  }, true);
  const err = text => { log.unshift(`ОШИБКА: ${text}`); show(); };
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
