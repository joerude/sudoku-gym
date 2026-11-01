// The reward after a solved game: the page turns green and a dialog with the numbers fades in.
import { tr } from "./i18n.js";
import { getGame, getRecords, getStats } from "./api.js";
import { fmtTime } from "./board.js";
import { LEVEL_NAME, h } from "./ui.js";
import { speedChart } from "./speedchart.js";

let current = null;  // the open dialog's close()

/** How this time compares with the player's results on the same level and mode (stats already include it).
 *  Records only count games without «Проверить» or hints, so such a game never claims one. */
function compare(r, level, stats, records) {
  const row = stats?.by_level_mode.find(x => x.level === level && x.mode === r.mode);
  const rec = records?.find(x => x.level === level && x.mode === r.mode);
  if (r.checks > 0) return tr("Использовалась «Проверить» — партия не идёт в рекорды.");
  if (r.hints > 0) return tr("Использовалась подсказка — партия не идёт в рекорды.");
  if (rec?.game_id === r.id) return rec.solved <= 1 ? tr("🏆 Первый рекорд на этом уровне и в этом режиме!") : tr("🏆 Новый личный рекорд!");
  if (!row || row.solved <= 1) return tr("Первая решённая партия на этом уровне и в этом режиме.");
  const diff = row.median_ms - r.time_ms;
  const vsMedian = Math.abs(diff) < 1000 ? tr("на уровне медианы")
    : diff > 0 ? tr("на {time} быстрее медианы", { time: fmtTime(diff, false) }) : tr("на {time} медленнее медианы", { time: fmtTime(-diff, false) });
  return `${vsMedian} · ` + tr("рекорд {best} · медиана {median} ({n} партий)",
    { best: rec?.best_ms ? fmtTime(rec.best_ms) : "—", median: fmtTime(row.median_ms), n: row.solved });
}

/** Show the dialog for a solved game. onNew starts the next game; the dialog closes itself on Esc or a backdrop click. */
export function showReward(r, puzzle, { onNew }) {
  closeReward();
  document.body.classList.add("won");
  const line = h("p", { class: "reward-compare" }, "…");
  const chartBox = h("div", { class: "reward-chart" });
  const newBtn = h("button", { type: "button", class: "primary", id: "rewardNew" }, tr("Новая партия"));
  const close = () => {
    window.removeEventListener("keydown", onKey, true);
    overlay.classList.remove("in");
    setTimeout(() => overlay.remove(), 250);
    current = null;
  };
  const item = (v, k) => h("div", { class: "metric" }, h("b", {}, v), h("span", {}, k));
  const dialog = h("div", { class: "reward-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "rewardTitle" },
    h("div", { class: "reward-badge" }, "✓"),
    h("h2", { id: "rewardTitle" }, tr("Решено!")),
    h("div", { class: "reward-time", id: "rewardTime" }, fmtTime(r.time_ms)),
    h("p", { class: "hint", style: "margin:0" }, `${LEVEL_NAME[puzzle.level] || puzzle.level} · ${puzzle.grade_title} · ${r.mode}`),
    line,
    chartBox,
    h("div", { class: "metrics" },
      item(fmtTime(r.first_move_ms), tr("До первого хода")),
      item(fmtTime(r.max_pause_ms), tr("Макс. пауза")),
      item(r.long_pauses ?? "—", tr("Пауз > 20 с")),
      item(r.mistakes ?? "—", tr("Ошибки"))),
    h("div", { class: "bar reward-actions" }, newBtn,
      h("a", { class: "btn", href: `#/review/${r.id}`, id: "rewardReview", onclick: () => close() }, tr("Разбор")),
      h("button", { type: "button", id: "rewardClose", onclick: () => close() }, tr("Закрыть"))),
    h("p", { class: "hint", style: "margin:0" }, h("kbd", {}, "Enter"), tr(" — новая партия, "), h("kbd", {}, "Esc"), tr(" — закрыть")));
  const overlay = h("div", { class: "reward", id: "reward", onclick: e => { if (e.target === overlay) close(); } }, dialog);
  newBtn.onclick = () => { close(); onNew(); };
  const onKey = e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); close(); onNew(); }
  };
  window.addEventListener("keydown", onKey, true);
  document.body.append(overlay);
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add("in")));  // let the start state paint
  current = close;
  Promise.all([getStats(), getRecords()]).then(([s, rec]) => { line.textContent = compare(r, puzzle.level, s, rec); })
    .catch(() => { line.textContent = ""; });
  getGame(r.id).then(g => { if (g.moves.length) chartBox.append(speedChart(g.moves, r.time_ms)); }).catch(() => {});
}

/** Close the dialog (if open) and drop the green page tint. */
export function closeReward() {
  current?.();
  document.body.classList.remove("won");
}
