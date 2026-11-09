// GitHub-style activity calendar for #/stats: 53 weeks × 7 days, a point per solved game or correct drill.
// A game takes minutes and a drill seconds, so the toggle shows games, drills, time spent or points of both, each with
// its own shades. Time counts abandoned games and wrong answers too: a day of only those is shaded in «Время» alone.
import { lang, tr } from "./i18n.js";
import { h } from "./ui.js";

const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
};
// fixed: a past day never changes its shade
const MODES = [
  { id: "games", name: "Партии", count: r => r.games, levels: [1, 2, 4, 7] },
  { id: "drills", name: "Упражнения", count: r => r.drills, levels: [1, 10, 25, 50] },
  { id: "time", name: "Время", count: r => r.ms, levels: [1, 15, 30, 60].map(m => m * 60000) },
  { id: "all", name: "Вместе", count: r => r.games + r.drills, levels: [1, 5, 10, 20] },
];
const MODE_KEY = "gym-heatmap";
const dur = ms => {  // 0 → 0 мин, 20 s → 1 мин, 125 min → 2 ч 05 мин
  const t = ms > 0 ? Math.max(1, Math.round(ms / 60000)) : 0;
  return t < 60 ? tr("{m} мин", { m: t }) : tr("{h} ч {m} мин", { h: Math.floor(t / 60), m: String(t % 60).padStart(2, "0") });
};
const shade = (rec, m) => rec ? m.levels.filter(t => m.count(rec) >= t).length : 0;
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const locale = lang === "en" ? "en-GB" : "ru-RU";

export function heatmapCard(a) {
  const byDay = new Map(a.days.map(d => [d.day, d]));
  let mode = MODES[0];
  try { mode = MODES.find(m => m.id === localStorage.getItem(MODE_KEY)) || mode; } catch { /* no storage */ }
  const cells = [];
  const [y, m, d] = a.today.split("-").map(Number);
  const today = new Date(y, m - 1, d);
  const start = new Date(y, m - 1, d - ((today.getDay() + 6) % 7) - 52 * 7);  // Monday, 52 weeks before this week
  const C = 12, G = 3, L = 28, T = 16;  // cell, gap, left labels, top labels
  const root = svg("svg", { viewBox: `0 0 ${L + 53 * (C + G)} ${T + 7 * (C + G)}`, role: "img",
    "aria-label": tr("Календарь активности") });
  const tip = h("div", { class: "tip", hidden: true });
  const months = new Intl.DateTimeFormat(locale, { month: "short" });
  const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  [[0, tr("Пн")], [2, tr("Ср")], [4, tr("Пт")]].forEach(([r, name]) =>
    root.append(svg("text", { x: 0, y: T + r * (C + G) + C - 2, class: "lbl" }, name)));
  let lastMonth = -1;
  for (let w = 0; w < 53; w++) {
    for (let r = 0; r < 7; r++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + r);
      if (day > today) break;
      if (r === 0 && day.getMonth() !== lastMonth && day.getDate() <= 7 && w < 52) {
        lastMonth = day.getMonth();
        root.append(svg("text", { x: L + w * (C + G), y: T - 5, class: "lbl" }, months.format(day)));
      }
      const rec = byDay.get(iso(day));
      const cell = svg("rect", { x: L + w * (C + G), y: T + r * (C + G), width: C, height: C, rx: 2, "data-day": iso(day) });
      cells.push([cell, rec]);
      const text = `${dayFmt.format(day)}: ` + (rec ? tr("партии: {g} · упражнения: {d} · время: {t}", { g: rec.games, d: rec.drills, t: dur(rec.ms) }) : tr("нет активности"));
      cell.addEventListener("mouseenter", () => { tip.textContent = text; tip.hidden = false; });
      cell.addEventListener("mousemove", e => { tip.style.left = `${e.clientX + 12}px`; tip.style.top = `${e.clientY + 12}px`; });
      cell.addEventListener("mouseleave", () => { tip.hidden = true; });
      root.append(cell);
    }
  }
  const btns = MODES.map(m => h("button", { type: "button", "data-mode": m.id, onclick: () => {
    mode = m;
    try { localStorage.setItem(MODE_KEY, m.id); } catch { /* no storage */ }
    paint();
  } }, tr(m.name)));
  function paint() {
    for (const [cell, rec] of cells) cell.setAttribute("class", `heat${shade(rec, mode)}`);
    btns.forEach(b => { const on = b.dataset.mode === mode.id; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
  }
  paint();
  const legend = h("div", { class: "heat-legend" }, tr("меньше"),
    ...[0, 1, 2, 3, 4].map(k => h("i", { class: `heat${k}` })), tr("больше"));
  const s = a.streak, t = a.totals;
  const line = h("p", { class: "heat-sum", id: "activitySum" },
    h("b", {}, tr("Серия: {n} дн.", { n: s.current })), " · ", tr("лучшая: {n} дн.", { n: s.best }), " · ",
    tr("за год: партий — {g}, упражнений — {d}, время — {t}, активных дней — {a}",
      { g: t.games, d: t.drills, t: dur(t.ms), a: t.active_days }));
  const wrap = h("div", { class: "heat-wrap" }, root);
  requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; });  // narrow screens: the recent weeks in view
  return h("section", { id: "activity" }, h("h2", {}, tr("Активность")),
    h("div", { class: "chips", id: "heatModes" }, btns), wrap, legend, line, tip);
}
