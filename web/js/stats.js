// #/stats — activity calendar, by level/mode, daily median chart, techniques, recent games.
import { tr } from "./i18n.js";
import { getActivity, getStats, listGames } from "./api.js";
import { heatmapCard } from "./heatmap.js";
import { recordsCard } from "./records.js";
import { fmtTime } from "./board.js";
import { LEVEL_NAME, STATUS_NAME, dateRu, errorBox, h, pct, sec } from "./ui.js";

const SERIES = ["easy", "medium", "hard", "expert"].flatMap(l => ["hardcore", "original"].map(m => `${l}|${m}`));
const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
};
const table = (head, rows, id) => h("div", { class: "table-wrap" }, h("table", { id },
  h("thead", {}, h("tr", {}, head.map(([t, num]) => h("th", { class: num ? "num" : "" }, t)))),
  h("tbody", {}, rows.map(r => h("tr", {}, r.map((c, k) => h("td", { class: head[k][1] ? "num" : "" }, c)))))));

function chart(daily) {
  // custom (pasted) puzzles are not a level: they stay out of the trend
  const pts = daily.filter(d => d.median_ms !== null && d.level !== "custom");
  const days = [...new Set(pts.map(d => d.day))].sort();
  if (days.length < 2)
    return h("p", { class: "hint", id: "chartNote", style: "margin:0" },
      tr("График появится, когда будут решённые партии хотя бы за два разных дня. Играй каждый день — и тут будет видно, как падает медиана."));
  const W = 640, H = 240, L = 46, R = 16, T = 12, B = 28;
  const maxMs = Math.max(...pts.map(d => d.median_ms));
  const tick = [30e3, 60e3, 120e3, 180e3, 300e3, 600e3, 900e3, 1800e3, 3600e3].find(s => maxMs * 1.05 / s <= 5) || 3600e3;
  const maxY = Math.ceil(maxMs * 1.05 / tick) * tick;
  const t0 = Date.parse(days[0]), t1 = Date.parse(days.at(-1));
  const x = d => L + ((Date.parse(d) - t0) / (t1 - t0)) * (W - L - R);
  const y = ms => T + (1 - ms / maxY) * (H - T - B);
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": tr("Медиана времени по дням") });
  for (let v = 0; v <= maxY; v += tick) {
    root.append(svg("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "axis", "stroke-width": 1 }),
      svg("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", class: "lbl" }, fmtTime(v, false)));
  }
  const step = Math.ceil(days.length / 7);
  days.forEach((d, k) => {
    if (k % step === 0 || k === days.length - 1)
      root.append(svg("text", { x: x(d), y: H - 8, "text-anchor": k === 0 ? "start" : k === days.length - 1 ? "end" : "middle",
        class: "lbl" }, `${d.slice(8, 10)}.${d.slice(5, 7)}`));
  });
  const groups = new Map();
  for (const d of pts) {
    const key = `${d.level}|${d.mode}`;
    groups.set(key, [...(groups.get(key) || []), d]);
  }
  const tip = h("div", { class: "tip", hidden: true });
  const legend = h("div", { class: "legend" });
  for (const key of [...groups.keys()].sort((a, b) => SERIES.indexOf(a) - SERIES.indexOf(b))) {
    const color = `var(--s${SERIES.indexOf(key) + 1})`, rows = groups.get(key);
    const [level, mode] = key.split("|"), name = `${LEVEL_NAME[level] || level} · ${mode}`;
    root.append(svg("polyline", { points: rows.map(d => `${x(d.day)},${y(d.median_ms)}`).join(" "), fill: "none",
      stroke: color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    for (const d of rows) {
      const dot = svg("circle", { cx: x(d.day), cy: y(d.median_ms), r: 4, fill: color, stroke: "var(--surface)", "stroke-width": 2 });
      const hit = svg("circle", { cx: x(d.day), cy: y(d.median_ms), r: 12, fill: "transparent" });
      hit.addEventListener("mouseenter", () => {
        tip.textContent = `${name} · ${d.day}: ` + tr("медиана {time} ({solved} из {n})", { time: fmtTime(d.median_ms, false), solved: d.solved, n: d.n });
        tip.hidden = false;
      });
      hit.addEventListener("mousemove", e => { tip.style.left = `${e.clientX + 12}px`; tip.style.top = `${e.clientY + 12}px`; });
      hit.addEventListener("mouseleave", () => { tip.hidden = true; });
      root.append(dot, hit);
    }
    legend.append(h("span", {}, h("i", { style: `background:${color}` }), name));
  }
  return h("div", { class: "chart", id: "chart" }, root, legend, tip);
}

export function mount(el) {
  el.append(h("h1", {}, tr("Статистика")));
  const box = h("div", {}, h("p", { class: "hint" }, tr("Загрузка…")));
  el.append(box);
  Promise.all([getStats(), listGames(20), getActivity()]).then(([st, games, act]) => {
    box.textContent = "";
    box.append(heatmapCard(act));
    const rec = recordsCard({ title: tr("Рекорды по уровню и режиму"), id: "recordsStats" });
    box.append(rec.el);
    rec.load();
    box.append(h("section", {}, h("h2", {}, tr("По уровню и режиму")),
      st.by_level_mode.length
        ? table([[tr("Уровень")], [tr("Режим")], [tr("Партий"), 1], [tr("Решено"), 1], [tr("Медиана"), 1], [tr("Лучшее"), 1], [tr("Ошибок/партия"), 1], [tr("Провалы"), 1]],
          st.by_level_mode.map(r => [LEVEL_NAME[r.level] || r.level, r.mode, r.n, r.solved, fmtTime(r.median_ms, false),
            fmtTime(r.best_ms, false), r.mistakes_per_game.toFixed(1), pct(r.fail_rate)]), "byLevel")
        : h("p", { class: "hint", style: "margin:0" }, tr("Законченных партий пока нет."))));
    box.append(h("section", {}, h("h2", {}, tr("Медиана времени по дням")), chart(st.daily)));
    const techs = [...st.techniques].sort((a, b) => (b.median_ms ?? -1) - (a.median_ms ?? -1));
    box.append(h("section", {}, h("h2", {}, tr("Упражнения по техникам (медленные сверху)")),
      table([[tr("Техника")], [tr("Попыток"), 1], [tr("Медиана"), 1], [tr("Точность"), 1], [""]],
        techs.map(t => [t.theory ? h("a", { href: `#/theory/${t.theory}` }, t.title) : t.title, t.n, sec(t.median_ms), pct(t.accuracy),
          h("a", { href: `#/drills?technique=${t.technique}` }, tr("тренировать"))]), "techTable")));
    box.append(h("section", {}, h("h2", {}, tr("Последние партии")),
      games.length
        ? table([["#"], [tr("Дата")], [tr("Уровень")], [tr("Режим")], [tr("Итог")], [tr("Время"), 1], [tr("Ошибки"), 1], [""]],
          games.map(g => [g.id, dateRu(g.started_at), LEVEL_NAME[g.level] || g.level, g.mode,
            h("span", { class: `status-${g.status}` }, STATUS_NAME[g.status] || g.status), fmtTime(g.time_ms, false), g.mistakes ?? "—",
            g.status === "active" ? "" : h("a", { href: `#/review/${g.id}` }, tr("разбор"))]), "gamesTable")
        : h("p", { class: "hint", style: "margin:0" }, tr("Партий пока нет."))));
  }).catch(e => { box.textContent = ""; box.append(errorBox(e)); });
}
