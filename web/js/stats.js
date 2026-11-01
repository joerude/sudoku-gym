// #/stats — activity calendar, records, the daily puzzle history, by level/mode, daily median chart, drill rating, techniques, recent games.
import { tr } from "./i18n.js";
import { getActivity, getDailyHistory, getRating, getStats, listGames } from "./api.js";
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

/** A line chart by day: gridlines with y labels, day labels, a polyline + dots per series, a custom tooltip, a legend for named series. */
function lineChart({ id, ariaLabel, days, height: H, yMin, yMax, yTicks, series }) {
  const W = 640, L = 46, R = 16, T = 12, B = 28;
  const t0 = Date.parse(days[0]), t1 = Date.parse(days.at(-1));
  const x = d => L + ((Date.parse(d) - t0) / (t1 - t0)) * (W - L - R);
  const y = v => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": ariaLabel });
  for (const { v, label } of yTicks)
    root.append(svg("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "axis", "stroke-width": 1 }),
      svg("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", class: "lbl" }, label));
  const step = Math.ceil(days.length / 7);
  days.forEach((d, k) => {
    if (k % step === 0 || k === days.length - 1)
      root.append(svg("text", { x: x(d), y: H - 8, "text-anchor": k === 0 ? "start" : k === days.length - 1 ? "end" : "middle",
        class: "lbl" }, `${d.slice(8, 10)}.${d.slice(5, 7)}`));
  });
  const tip = h("div", { class: "tip", hidden: true });
  const legend = h("div", { class: "legend" });
  for (const { color, name, points } of series) {
    root.append(svg("polyline", { points: points.map(p => `${x(p.day)},${y(p.v)}`).join(" "), fill: "none",
      stroke: color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    for (const p of points) {
      const dot = svg("circle", { cx: x(p.day), cy: y(p.v), r: 4, fill: color, stroke: "var(--surface)", "stroke-width": 2 });
      const hit = svg("circle", { cx: x(p.day), cy: y(p.v), r: 12, fill: "transparent" });
      hit.addEventListener("mouseenter", () => { tip.textContent = p.tip; tip.hidden = false; });
      hit.addEventListener("mousemove", e => { tip.style.left = `${e.clientX + 12}px`; tip.style.top = `${e.clientY + 12}px`; });
      hit.addEventListener("mouseleave", () => { tip.hidden = true; });
      root.append(dot, hit);
    }
    if (name) legend.append(h("span", {}, h("i", { style: `background:${color}` }), name));
  }
  return h("div", { class: "chart", id }, root, legend.childElementCount ? legend : null, tip);
}

function dailyCard(d) {
  const body = d.days.length
    ? [h("p", { class: "heat-sum", id: "dailySum" }, tr("решено дней: {n}", { n: d.solved }), " · ",
        tr("лучшее: {t}", { t: fmtTime(d.best_ms) }), " · ", tr("медиана последних 30: {t}", { t: fmtTime(d.median_ms) })),
      table([[tr("Дата")], [tr("Время"), 1], [tr("Попыток"), 1], [tr("Техника"), 1]],
        d.days.map(r => [r.day, h("a", { href: `#/review/${r.game_id}` }, fmtTime(r.time_ms)), r.attempts, r.tech_grade]),
        "dailyTable")]
    : [h("p", { class: "hint", style: "margin:0" }, tr("Задач дня пока нет — первая ждёт на «Играть» (📅 Задача дня)."))];
  return h("section", { id: "daily" }, h("h2", {}, tr("Задача дня")), ...body);
}

function chart(daily) {
  // custom (pasted) puzzles are not a level: they stay out of the trend
  const pts = daily.filter(d => d.median_ms !== null && d.level !== "custom");
  const days = [...new Set(pts.map(d => d.day))].sort();
  if (days.length < 2)
    return h("p", { class: "hint", id: "chartNote", style: "margin:0" },
      tr("График появится, когда будут решённые партии хотя бы за два разных дня. Играй каждый день — и тут будет видно, как падает медиана."));
  const maxMs = Math.max(...pts.map(d => d.median_ms));
  const tick = [30e3, 60e3, 120e3, 180e3, 300e3, 600e3, 900e3, 1800e3, 3600e3].find(s => maxMs * 1.05 / s <= 5) || 3600e3;
  const maxY = Math.ceil(maxMs * 1.05 / tick) * tick;
  const yTicks = [];
  for (let v = 0; v <= maxY; v += tick) yTicks.push({ v, label: fmtTime(v, false) });
  const groups = new Map();
  for (const d of pts) {
    const key = `${d.level}|${d.mode}`;
    groups.set(key, [...(groups.get(key) || []), d]);
  }
  const series = [...groups.keys()].sort((a, b) => SERIES.indexOf(a) - SERIES.indexOf(b)).map(key => {
    const [level, mode] = key.split("|"), name = `${LEVEL_NAME[level] || level} · ${mode}`;
    return { color: `var(--s${SERIES.indexOf(key) + 1})`, name, points: groups.get(key).map(d => ({ day: d.day, v: d.median_ms,
      tip: `${name} · ${d.day}: ` + tr("медиана {time} ({solved} из {n})", { time: fmtTime(d.median_ms, false), solved: d.solved, n: d.n }) })) };
  });
  return lineChart({ id: "chart", ariaLabel: tr("Медиана времени по дням"), days, height: 240, yMin: 0, yMax: maxY, yTicks, series });
}

function ratingCard(r) {
  const now = h("p", { id: "ratingNow", style: "margin:0 0 8px" }, h("b", {}, `${r.rating}${r.provisional ? "?" : ""}`), " ",
    h("span", { class: "hint" }, tr("учтённых ответов: {n}", { n: r.n })));
  const card = body => h("section", { id: "ratingCard" }, h("h2", {}, tr("Рейтинг упражнений")), now, body);
  if (r.history.length < 2)
    return card(h("p", { class: "hint", id: "ratingNote", style: "margin:0" },
      tr("График появится, когда будут учтённые ответы хотя бы за два дня. Ответы по технике идут в рейтинг после калибровки: 10 верных без подсказки задают её норму.")));
  const vals = r.history.map(p => p.rating);
  const lo = Math.floor((Math.min(...vals, 1500) - 20) / 50) * 50, hi = Math.ceil((Math.max(...vals, 1500) + 20) / 50) * 50;
  const tick = Math.max(50, Math.ceil((hi - lo) / 4 / 50) * 50);
  const yTicks = [];
  for (let v = lo; v <= hi; v += tick) yTicks.push({ v, label: String(v) });
  const points = r.history.map(p => ({ day: p.day, v: p.rating, tip: `${p.day}: ${p.rating}` }));
  return card(lineChart({ id: "ratingChart", ariaLabel: tr("Рейтинг упражнений"), days: r.history.map(p => p.day), height: 200,
    yMin: lo, yMax: hi, yTicks, series: [{ color: "var(--s1)", points }] }));
}

export function mount(el) {
  el.append(h("h1", {}, tr("Статистика")));
  const box = h("div", {}, h("p", { class: "hint" }, tr("Загрузка…")));
  el.append(box);
  Promise.all([getStats(), listGames(20), getActivity(), getDailyHistory(), getRating().catch(() => null)]).then(([st, games, act, daily, rt]) => {
    box.textContent = "";
    box.append(heatmapCard(act));
    const rec = recordsCard({ title: tr("Рекорды по уровню и режиму"), id: "recordsStats" });
    box.append(rec.el);
    rec.load();
    box.append(dailyCard(daily));
    box.append(h("section", {}, h("h2", {}, tr("По уровню и режиму")),
      st.by_level_mode.length
        ? table([[tr("Уровень")], [tr("Режим")], [tr("Партий"), 1], [tr("Решено"), 1], [tr("Медиана"), 1], [tr("Лучшее"), 1], [tr("Ошибок/партия"), 1], [tr("Провалы"), 1]],
          st.by_level_mode.map(r => [LEVEL_NAME[r.level] || r.level, r.mode, r.n, r.solved, fmtTime(r.median_ms, false),
            fmtTime(r.best_ms, false), r.mistakes_per_game.toFixed(1), pct(r.fail_rate)]), "byLevel")
        : h("p", { class: "hint", style: "margin:0" }, tr("Законченных партий пока нет."))));
    box.append(h("section", {}, h("h2", {}, tr("Медиана времени по дням")), chart(st.daily)));
    if (rt) box.append(ratingCard(rt));
    const techs = [...st.techniques].sort((a, b) => (b.median_ms ?? -1) - (a.median_ms ?? -1));
    box.append(h("section", {}, h("h2", {}, tr("Упражнения по техникам (медленные сверху)")),
      table([[tr("Техника")], [tr("Попыток"), 1], [tr("Медиана"), 1], [tr("Точность"), 1], [""]],
        techs.map(t => [t.theory ? h("a", { href: `#/theory/${t.theory}` }, t.title) : t.title, t.n, sec(t.median_ms), pct(t.accuracy),
          h("a", { href: `#/drills?technique=${t.technique}` }, tr("тренировать"))]), "techTable")));
    box.append(h("section", {}, h("h2", {}, tr("Последние партии")),
      games.length
        ? table([["#"], [tr("Дата")], [tr("Уровень")], [tr("Режим")], [tr("Итог")], [tr("Время"), 1], [tr("Ошибки"), 1], [""]],
          games.map(g => [g.id, dateRu(g.started_at), LEVEL_NAME[g.level] || g.level, g.mode,
            h("span", { class: `status-${g.status}` }, STATUS_NAME[g.status] || g.status, g.hints ? ` · 💡${g.hints}` : ""), fmtTime(g.time_ms, false), g.mistakes ?? "—",
            g.status === "active" ? "" : h("a", { href: `#/review/${g.id}` }, tr("разбор"))]), "gamesTable")
        : h("p", { class: "hint", style: "margin:0" }, tr("Партий пока нет."))));
  }).catch(e => { box.textContent = ""; box.append(errorBox(e)); });
}
