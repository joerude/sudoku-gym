// Speed over one game, as on Monkeytype's result screen: moves per minute in a rolling window,
// correct placements vs all placements (one axis — both are moves/min), mistakes and long pauses on top.
import { fmtTime } from "./board.js";
import { h } from "./ui.js";

const NS = "http://www.w3.org/2000/svg";
const WINDOW_MS = 30000;      // rolling window for the pace
const MIN_WINDOW_MS = 10000;  // early in the game a shorter window would spike
const LONG_PAUSE_MS = 20000;  // same threshold as analysis.LONG_PAUSE_MS
const W = 640, H = 200, PAD = { l: 34, r: 12, t: 10, b: 24 };

const svg = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

/** Samples of the pace over time plus mistakes and long pauses, from the server's move log. */
export function speedSeries(moves, endMs) {
  const places = moves.filter(m => m.kind === "place").sort((a, b) => a.t_ms - b.t_ms);
  const end = Math.max(endMs || 0, places.at(-1)?.t_ms || 0, 1000);
  const step = Math.max(1000, Math.round(end / 60 / 1000) * 1000);  // about 60 samples
  const samples = [];
  for (let t = step; t < end + step; t += step) {
    const at = Math.min(t, end), win = Math.min(WINDOW_MS, Math.max(at, MIN_WINDOW_MS));
    const inWin = places.filter(m => m.t_ms > at - win && m.t_ms <= at);
    samples.push({
      t: at,
      pace: inWin.filter(m => m.correct === 1).length * 60000 / win,
      raw: inWin.length * 60000 / win,
      errors: places.filter(m => m.correct === 0 && m.t_ms <= at).length,
    });
  }
  const pauses = [];
  places.forEach((m, k) => {
    const from = k ? places[k - 1].t_ms : 0;
    if (m.t_ms - from > LONG_PAUSE_MS) pauses.push({ from, to: m.t_ms });
  });
  const correct = places.filter(m => m.correct === 1).length;
  return { samples, pauses, end, errors: places.filter(m => m.correct === 0).map(m => m.t_ms),
           avg: correct * 60000 / end };
}

const niceMax = v => { for (const n of [10, 20, 30, 40, 60, 80, 100, 150, 200, 300]) if (v <= n) return n; return Math.ceil(v / 100) * 100; };
const fmt = v => (Math.round(v * 10) / 10).toString().replace(".", ",");

/** The chart element: legend, SVG with hover crosshair + tooltip, and a table view. */
export function speedChart(moves, endMs) {
  const d = speedSeries(moves, endMs);
  const yMax = niceMax(Math.max(...d.samples.map(s => s.raw), 1));
  const x = t => PAD.l + (t / d.end) * (W - PAD.l - PAD.r);
  const y = v => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "speed-svg", role: "img",
    "aria-label": `Темп по ходу партии: в среднем ${fmt(d.avg)} верных ходов в минуту, ошибок ${d.errors.length}, длинных пауз ${d.pauses.length}` });

  for (const p of d.pauses) root.append(svg("rect", { class: "sc-pause", x: x(p.from), y: PAD.t, width: Math.max(2, x(p.to) - x(p.from)), height: H - PAD.t - PAD.b }));
  for (let k = 0; k <= 4; k++) {  // recessive grid + y labels
    const v = yMax * k / 4, yy = y(v);
    root.append(svg("line", { class: "sc-grid", x1: PAD.l, x2: W - PAD.r, y1: yy, y2: yy }));
    root.append(Object.assign(svg("text", { class: "sc-tick", x: PAD.l - 6, y: yy + 3, "text-anchor": "end" }), { textContent: Math.round(v) }));
  }
  for (let k = 0; k <= 4; k++) {
    const t = d.end * k / 4;
    root.append(Object.assign(svg("text", { class: "sc-tick", x: x(t), y: H - 6, "text-anchor": k === 0 ? "start" : k === 4 ? "end" : "middle" }),
      { textContent: fmtTime(t, false) }));
  }
  const path = key => d.samples.map((s, k) => `${k ? "L" : "M"}${x(s.t).toFixed(1)},${y(s[key]).toFixed(1)}`).join("");
  root.append(svg("path", { class: "sc-raw", d: path("raw") }), svg("path", { class: "sc-pace", d: path("pace") }));
  const rawAt = t => d.samples.find(s => s.t >= t)?.raw ?? 0;
  for (const t of d.errors) {  // × on the «all moves» line at the moment of the mistake
    const cx = x(t), cy = y(rawAt(t)), r = 4.5;
    root.append(svg("path", { class: "sc-err", d: `M${cx - r},${cy - r}L${cx + r},${cy + r}M${cx - r},${cy + r}L${cx + r},${cy - r}` }));
  }
  const last = d.samples.at(-1);  // direct labels at the line ends, in text colour
  const labelY = [y(last.pace), y(last.raw)];
  if (Math.abs(labelY[0] - labelY[1]) < 12) labelY[1] = labelY[0] + (labelY[1] >= labelY[0] ? 12 : -12);
  ["верные", "все"].forEach((txt, k) => root.append(Object.assign(
    svg("text", { class: "sc-label", x: W - PAD.r - 2, y: Math.max(PAD.t + 9, labelY[k] - 5), "text-anchor": "end" }), { textContent: txt })));

  // hover: crosshair + tooltip with the nearest sample
  const cross = svg("line", { class: "sc-cross", y1: PAD.t, y2: H - PAD.b, visibility: "hidden" });
  const dotPace = svg("circle", { class: "sc-dot-pace", r: 4, visibility: "hidden" });
  const dotRaw = svg("circle", { class: "sc-dot-raw", r: 4, visibility: "hidden" });
  const hit = svg("rect", { x: PAD.l, y: 0, width: W - PAD.l - PAD.r, height: H, fill: "transparent" });
  root.append(cross, dotRaw, dotPace, hit);
  const tip = h("div", { class: "sc-tip", hidden: true });
  const wrap = h("div", { class: "sc-wrap" }, root, tip);
  const move = e => {
    const box = root.getBoundingClientRect(), vx = (e.clientX - box.left) / box.width * W;
    const t = Math.max(0, Math.min(d.end, (vx - PAD.l) / (W - PAD.l - PAD.r) * d.end));
    const s = d.samples.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
    for (const el of [cross, dotPace, dotRaw]) el.setAttribute("visibility", "visible");
    cross.setAttribute("x1", x(s.t)); cross.setAttribute("x2", x(s.t));
    dotPace.setAttribute("cx", x(s.t)); dotPace.setAttribute("cy", y(s.pace));
    dotRaw.setAttribute("cx", x(s.t)); dotRaw.setAttribute("cy", y(s.raw));
    tip.hidden = false;
    tip.innerHTML = `<b>${fmtTime(s.t, false)}</b><br>верные: ${fmt(s.pace)}/мин<br>все: ${fmt(s.raw)}/мин<br>ошибок к этому моменту: ${s.errors}`;
    const px = x(s.t) / W * box.width;
    tip.style.left = `${Math.min(px + 12, box.width - tip.offsetWidth - 4)}px`;
  };
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerleave", () => { tip.hidden = true; for (const el of [cross, dotPace, dotRaw]) el.setAttribute("visibility", "hidden"); });

  const legend = h("div", { class: "sc-legend" },
    h("span", {}, h("i", { class: "sw sw-pace" }), "верные ходы в минуту"),
    h("span", {}, h("i", { class: "sw sw-raw" }), "все ходы (с ошибками)"),
    h("span", {}, h("i", { class: "sw-err" }, "×"), "ошибка"),
    h("span", {}, h("i", { class: "sw sw-pause" }), "пауза > 20 с"));
  const every = Math.max(1, Math.ceil(d.samples.length / 12));
  const table = h("details", { class: "sc-table" }, h("summary", {}, "таблица"),
    h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "время"), h("th", {}, "верные/мин"), h("th", {}, "все/мин"), h("th", {}, "ошибок"))),
      h("tbody", {}, d.samples.filter((_, k) => k % every === every - 1 || k === d.samples.length - 1).map(s =>
        h("tr", {}, h("td", {}, fmtTime(s.t, false)), h("td", { class: "num" }, fmt(s.pace)), h("td", { class: "num" }, fmt(s.raw)), h("td", { class: "num" }, s.errors))))));
  return h("div", { class: "speed-chart", id: "speedChart" },
    h("div", { class: "sc-head" }, h("b", {}, "Темп"), h("span", { class: "hint", style: "margin:0" },
      `в среднем ${fmt(d.avg)} верных ходов в минуту`)),
    legend, wrap, table);
}
