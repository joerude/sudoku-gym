// Personal records: best solve time per level × mode, each linked to the review of that game.
import { tr } from "./i18n.js";
import { getRecords } from "./api.js";
import { fmtTime } from "./board.js";
import { LEVEL_NAME, dateRu, h } from "./ui.js";

const MODES = ["original", "hardcore"];

/** A card with the records table. load() refetches; mark(level, mode) highlights the combination being played. */
export function recordsCard({ title = tr("Рекорды"), id = "records" } = {}) {
  const body = h("div", {}, h("p", { class: "hint", style: "margin:0" }, tr("Загрузка…")));
  const el = h("section", { id }, h("h2", {}, title), body);
  let rows = [], cur = null;

  function render() {
    body.textContent = "";
    if (!rows.some(r => r.best_ms !== null)) {
      body.append(h("p", { class: "hint", style: "margin:0" }, tr("Пока нет решённых партий — первый рекорд впереди.")));
      return;
    }
    const levels = [...new Set(rows.map(r => r.level))];
    const cell = r => {
      if (r.best_ms === null) return h("td", { class: "num muted" }, "—");
      return h("td", { class: "num", title: `${dateRu(r.at)} · ` + tr("решено без проверки: {n}", { n: r.solved }) },
        h("a", { href: `#/review/${r.game_id}` }, fmtTime(r.best_ms)));
    };
    body.append(h("p", { class: "hint", style: "margin:0 0 4px" }, tr("Только решённые партии без «Проверить».")));
    body.append(h("table", { class: "records" },
      h("thead", {}, h("tr", {}, h("th", {}, tr("Уровень")), MODES.map(m => h("th", { class: "num" }, m)))),
      h("tbody", {}, levels.map(lv => h("tr", {}, h("td", {}, LEVEL_NAME[lv] || lv),
        MODES.map(md => {
          const td = cell(rows.find(r => r.level === lv && r.mode === md));
          if (cur && cur.level === lv && cur.mode === md) td.classList.add("cur");
          td.dataset.rec = `${lv}-${md}`;
          return td;
        }))))));
  }

  return {
    el,
    load() {
      return getRecords().then(r => { rows = r; render(); })
        .catch(e => { body.textContent = ""; body.append(h("p", { class: "hint", style: "margin:0" }, e.message)); });
    },
    mark(level, mode) { cur = level && mode ? { level, mode } : null; if (rows.length) render(); },
  };
}

/** One line on #/play: the record for the level and mode about to be played, linked to its review.
 * Same interface as recordsCard; the whole table is on #/stats. */
export function recordLine() {
  const el = h("p", { class: "hint record-line zen-hide", id: "recordLine" });
  let rows = null, cur = null;
  const render = () => {
    el.textContent = "";
    if (!rows || !cur) return;
    const r = rows.find(x => x.level === cur.level && x.mode === cur.mode);
    const what = `${LEVEL_NAME[cur.level] || cur.level} · ${cur.mode}`;
    if (!r || r.best_ms === null) { el.append(tr("Рекорда {what} пока нет", { what })); return; }
    el.append(tr("Рекорд {what}: ", { what }), h("a", { href: `#/review/${r.game_id}`,
      title: `${dateRu(r.at)} · ` + tr("решено без проверки: {n}", { n: r.solved }) }, fmtTime(r.best_ms)));
  };
  return {
    el,
    load() { return getRecords().then(r => { rows = r; render(); }).catch(() => { rows = null; render(); }); },
    mark(level, mode) { cur = level && mode ? { level, mode } : null; render(); },
  };
}
