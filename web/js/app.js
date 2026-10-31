// Hash router + nav + global Ctrl+V of a grid.
import { parseGrid } from "./board.js";
import * as play from "./play.js";
import * as review from "./review.js";
import * as drills from "./drills.js";
import * as stats from "./stats.js";
import * as theory from "./theory.js";
import * as today from "./today.js";
import { errorBox } from "./ui.js";

const ROUTES = [
  [/^today$/, today.mount, "today"],
  [/^play$/, play.mount, "play"],
  [/^review\/(\d+)$/, review.mount, "stats"],
  [/^drills$/, drills.mount, "drills"],
  [/^stats$/, stats.mount, "stats"],
  [/^theory$/, theory.mountList, "theory"],
  [/^theory\/([^/]+)$/, theory.mountPage, "theory"],
];
const TITLES = { today: "Сегодня", play: "Играть", drills: "Упражнения", stats: "Статистика", theory: "Теория" };

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
  try {
    const res = fn(app, m.slice(1).map(decodeURIComponent), query);
    cleanup = typeof res === "function" ? res : null;
  } catch (e) {
    app.append(errorBox(e));
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);
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
