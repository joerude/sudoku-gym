// Personal records: best solve time per level × mode, each linked to the review of that game.
import { getRecords } from "./api.js";
import { fmtTime } from "./board.js";
import { LEVEL_NAME, dateRu, h } from "./ui.js";

const MODES = ["original", "hardcore"];

/** A card with the records table. load() refetches; mark(level, mode) highlights the combination being played. */
export function recordsCard({ title = "Рекорды", id = "records" } = {}) {
  const body = h("div", {}, h("p", { class: "hint", style: "margin:0" }, "Загрузка…"));
  const el = h("section", { id }, h("h2", {}, title), body);
  let rows = [], cur = null;

  function render() {
    body.textContent = "";
    if (!rows.some(r => r.best_ms !== null)) {
      body.append(h("p", { class: "hint", style: "margin:0" }, "Пока нет решённых партий — первый рекорд впереди."));
      return;
    }
    const levels = [...new Set(rows.map(r => r.level))];
    const cell = r => {
      if (r.best_ms === null) return h("td", { class: "num muted" }, "—");
      return h("td", { class: "num", title: `${dateRu(r.at)} · решено без проверки: ${r.solved}` },
        h("a", { href: `#/review/${r.game_id}` }, fmtTime(r.best_ms)));
    };
    body.append(h("p", { class: "hint", style: "margin:0 0 4px" }, "Только решённые партии без «Проверить»."));
    body.append(h("table", { class: "records" },
      h("thead", {}, h("tr", {}, h("th", {}, "Уровень"), MODES.map(m => h("th", { class: "num" }, m)))),
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
