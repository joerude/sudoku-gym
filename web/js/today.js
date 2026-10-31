// #/today — the daily plan: warm-up drills → 2 medium hardcore games → review of the last game.
import { tr } from "./i18n.js";
import { getStats, listGames } from "./api.js";
import { fmtTime } from "./board.js";
import { LEVEL_NAME, STATUS_NAME, errorBox, h } from "./ui.js";

// The server groups games by local date (date(started_at, 'localtime')), so "today" is the local date here too.
const localDay = offset => {
  const d = new Date(Date.now() - offset * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function dayRow(label, rows) {
  const n = rows.reduce((a, r) => a + r.n, 0), solved = rows.reduce((a, r) => a + r.solved, 0);
  const meds = rows.filter(r => r.median_ms !== null).map(r => `${LEVEL_NAME[r.level] || r.level} ${r.mode} — ${fmtTime(r.median_ms, false)}`);
  return h("tr", {}, h("td", {}, label), h("td", { class: "num" }, n), h("td", { class: "num" }, solved), h("td", {}, meds.join(", ") || "—"));
}

export function mount(el) {
  el.append(h("h1", {}, tr("Сегодня")));
  const box = h("div", {}, h("p", { class: "hint" }, tr("Загрузка…")));
  el.append(box);
  Promise.all([getStats(), listGames(20)]).then(([st, games]) => {
    const today = localDay(0), yesterday = localDay(1);
    const tRows = st.daily.filter(d => d.day === today), yRows = st.daily.filter(d => d.day === yesterday);
    const mhToday = tRows.filter(r => r.level === "medium" && r.mode === "hardcore").reduce((a, r) => a + r.n, 0);
    const last = games.find(g => g.status === "solved" || g.status === "failed") || games.find(g => g.status !== "active");
    box.textContent = "";
    box.append(h("section", {}, h("h2", {}, tr("План на сегодня")),
      h("ol", { class: "plan", id: "plan" },
        h("li", {}, h("div", { class: "body" }, h("b", {}, tr("Разминка: 5 минут упражнений")),
          h("p", {}, tr("Адаптивный режим сам выберет самую медленную технику. Быстро, без заметок — как в партии.")),
          h("a", { class: "btn primary", href: "#/drills", id: "planDrills" }, tr("Начать разминку")))),
        h("li", { class: mhToday >= 2 ? "done" : "" }, h("div", { class: "body" }, h("b", {}, tr("2 партии: средний, hardcore")),
          h("p", {}, tr("Сегодня сыграно: {n}/2. Без подсветки ошибок — ошибки увидишь только в итогах.", { n: Math.min(mhToday, 2) })),
          h("a", { class: "btn primary", href: "#/play?level=medium&mode=hardcore&start=1", id: "planPlay" }, tr("Начать партию")))),
        h("li", {}, h("div", { class: "body" }, h("b", {}, tr("Разбор последней партии")),
          last
            ? h("p", {}, tr("Партия #{id}", { id: last.id }) + `: ${LEVEL_NAME[last.level] || last.level} · ${last.mode} · ${STATUS_NAME[last.status] || last.status}` +
              (last.time_ms !== null ? ` · ${fmtTime(last.time_ms, false)}` : ""))
            : h("p", {}, tr("Сыграй партию — здесь появится ссылка на разбор её пауз.")),
          last ? h("a", { class: "btn", href: `#/review/${last.id}`, id: "planReview" }, tr("Открыть разбор")) : null)))));
    box.append(h("section", {}, h("h2", {}, tr("Счётчики")),
      h("div", { class: "table-wrap" }, h("table", { id: "dayCounters" },
        h("thead", {}, h("tr", {}, h("th", {}, tr("День")), h("th", { class: "num" }, tr("Партий")), h("th", { class: "num" }, tr("Решено")),
          h("th", {}, tr("Медиана")))),
        h("tbody", {}, dayRow(tr("Вчера"), yRows), dayRow(tr("Сегодня"), tRows)))),
      h("p", { class: "hint", style: "margin:8px 0 0" }, tr("Считаются законченные партии (решённые и проваленные)."))));
  }).catch(e => { box.textContent = ""; box.append(errorBox(e)); });
}
