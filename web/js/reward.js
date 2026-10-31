// The reward after a solved game: the page turns green and a dialog with the numbers fades in.
import { getGame, getRecords, getStats } from "./api.js";
import { fmtTime } from "./board.js";
import { LEVEL_NAME, h } from "./ui.js";
import { speedChart } from "./speedchart.js";

let current = null;  // the open dialog's close()

/** How this time compares with the player's results on the same level and mode (stats already include it).
 *  Records only count games without «Проверить», so a checked game never claims one. */
function compare(r, level, stats, records) {
  const row = stats?.by_level_mode.find(x => x.level === level && x.mode === r.mode);
  const rec = records?.find(x => x.level === level && x.mode === r.mode);
  if (r.checks > 0) return "Использовалась «Проверить» — партия не идёт в рекорды.";
  if (rec?.game_id === r.id) return rec.solved <= 1 ? "🏆 Первый рекорд на этом уровне и в этом режиме!" : "🏆 Новый личный рекорд!";
  if (!row || row.solved <= 1) return "Первая решённая партия на этом уровне и в этом режиме.";
  const diff = row.median_ms - r.time_ms;
  const vsMedian = Math.abs(diff) < 1000 ? "на уровне медианы"
    : diff > 0 ? `на ${fmtTime(diff, false)} быстрее медианы` : `на ${fmtTime(-diff, false)} медленнее медианы`;
  return `${vsMedian} · рекорд ${rec?.best_ms ? fmtTime(rec.best_ms) : "—"} · медиана ${fmtTime(row.median_ms)} (${row.solved} партий)`;
}

/** Show the dialog for a solved game. onNew starts the next game; the dialog closes itself on Esc or a backdrop click. */
export function showReward(r, puzzle, { onNew }) {
  closeReward();
  document.body.classList.add("won");
  const line = h("p", { class: "reward-compare" }, "…");
  const chartBox = h("div", { class: "reward-chart" });
  const newBtn = h("button", { type: "button", class: "primary", id: "rewardNew" }, "Новая партия");
  const close = () => {
    window.removeEventListener("keydown", onKey, true);
    overlay.classList.remove("in");
    setTimeout(() => overlay.remove(), 250);
    current = null;
  };
  const item = (v, k) => h("div", { class: "metric" }, h("b", {}, v), h("span", {}, k));
  const dialog = h("div", { class: "reward-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "rewardTitle" },
    h("div", { class: "reward-badge" }, "✓"),
    h("h2", { id: "rewardTitle" }, "Решено!"),
    h("div", { class: "reward-time", id: "rewardTime" }, fmtTime(r.time_ms)),
    h("p", { class: "hint", style: "margin:0" }, `${LEVEL_NAME[puzzle.level] || puzzle.level} · ${puzzle.grade_title} · ${r.mode}`),
    line,
    chartBox,
    h("div", { class: "metrics" },
      item(fmtTime(r.first_move_ms), "До первого хода"),
      item(fmtTime(r.max_pause_ms), "Макс. пауза"),
      item(r.long_pauses ?? "—", "Пауз > 20 с"),
      item(r.mistakes ?? "—", "Ошибки")),
    h("div", { class: "bar reward-actions" }, newBtn,
      h("a", { class: "btn", href: `#/review/${r.id}`, id: "rewardReview", onclick: () => close() }, "Разбор пауз"),
      h("button", { type: "button", id: "rewardClose", onclick: () => close() }, "Закрыть")),
    h("p", { class: "hint", style: "margin:0" }, h("kbd", {}, "Enter"), " — новая партия, ", h("kbd", {}, "Esc"), " — закрыть"));
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
