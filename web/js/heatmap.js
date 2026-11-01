// GitHub-style activity calendar for #/stats: 53 weeks × 7 days, a point per solved game or correct drill.
import { lang, tr } from "./i18n.js";
import { h } from "./ui.js";

const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
};
const LEVELS = [1, 5, 10, 20];  // fixed: a past day never changes its shade
const shade = n => LEVELS.filter(t => n >= t).length;
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const locale = lang === "en" ? "en-GB" : "ru-RU";

export function heatmapCard(a) {
  const byDay = new Map(a.days.map(d => [d.day, d]));
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
      const rec = byDay.get(iso(day)), n = rec ? rec.games + rec.drills : 0;
      const cell = svg("rect", { x: L + w * (C + G), y: T + r * (C + G), width: C, height: C, rx: 2,
        class: `heat${shade(n)}`, "data-day": iso(day) });
      const text = `${dayFmt.format(day)}: ` + (rec ? tr("партии: {g} · упражнения: {d}", { g: rec.games, d: rec.drills }) : tr("нет активности"));
      cell.addEventListener("mouseenter", () => { tip.textContent = text; tip.hidden = false; });
      cell.addEventListener("mousemove", e => { tip.style.left = `${e.clientX + 12}px`; tip.style.top = `${e.clientY + 12}px`; });
      cell.addEventListener("mouseleave", () => { tip.hidden = true; });
      root.append(cell);
    }
  }
  const legend = h("div", { class: "heat-legend" }, tr("меньше"),
    ...[0, 1, 2, 3, 4].map(k => h("i", { class: `heat${k}` })), tr("больше"));
  const s = a.streak, t = a.totals;
  const line = h("p", { class: "heat-sum", id: "activitySum" },
    h("b", {}, tr("Серия: {n} дн.", { n: s.current })), " · ", tr("лучшая: {n} дн.", { n: s.best }), " · ",
    tr("за год: партий — {g}, упражнений — {d}, активных дней — {a}", { g: t.games, d: t.drills, a: t.active_days }));
  const wrap = h("div", { class: "heat-wrap" }, root);
  requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; });  // narrow screens: the recent weeks in view
  return h("section", { id: "activity" }, h("h2", {}, tr("Активность")), wrap, legend, line, tip);
}
