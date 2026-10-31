// #/review/{id} — game summary + long pauses with what was available in the position.
import { getGame, getReview } from "./api.js";
import { cellName, computeCandidates, createBoard, fmtTime, toDigits, unitCells } from "./board.js";
import { LEVEL_NAME, dateRu, errorBox, h, metricsGrid, statusLine } from "./ui.js";

export function stepText(s) {
  const unit = s.unit_name ? ` (${s.unit_name})` : "";
  if (s.cell !== null && s.cell !== undefined) return `${s.title} — ${cellName(s.cell)} = ${s.value}${unit}`;
  const byValue = new Map();
  for (const [c, v] of s.eliminations) byValue.set(v, [...(byValue.get(v) || []), cellName(c)]);
  const parts = [...byValue].map(([v, cells]) => `${v} из ${cells.join(", ")}`);
  return `${s.title} — убрать ${parts.join("; ")}${unit}`;
}

function pauseCard(p, game, n) {
  const values = toDigits(p.board), given = toDigits(game.givens).map(Boolean);
  const wrong = new Set(p.had_errors ? p.wrong_cells : []);
  const clean = values.map((v, i) => (wrong.has(i) ? 0 : v));
  const cands = computeCandidates(clean);
  const boardEl = h("div");
  const board = createBoard(boardEl, { interactive: false });
  const items = [];
  let active = 0;

  function show() {
    const s = p.steps[active];
    const unit = new Set(s && s.unit !== null && s.unit !== undefined ? unitCells(s.unit) : []);
    const elim = new Map();
    for (const [c, v] of s?.eliminations || []) elim.set(c, [...(elim.get(c) || []), v]);
    const ghost = new Map(s && s.cell !== null && s.cell !== undefined ? [[s.cell, s.value]] : []);
    board.render({
      values, given, ghost,
      cellClass: i => [wrong.has(i) ? "bad" : "", unit.has(i) ? "unit" : "", ghost.has(i) ? "ans" : ""].filter(Boolean),
      notes: i => (elim.has(i) && !values[i] ? cands[i] : null),
      candClass: (i, v) => (elim.get(i)?.includes(v) ? "c-x" : ""),
    });
    items.forEach((b, k) => { b.classList.toggle("on", k === active); b.setAttribute("aria-pressed", k === active); });
  }

  p.steps.forEach((s, k) => items.push(h("button", { type: "button", onclick: () => { active = k; show(); } },
    `Тут был доступен: ${stepText(s)}`)));
  const after = p.after_seq ? `после хода ${p.after_seq}` : "до первого хода";
  const card = h("section", { class: "pause-item" },
    h("h2", {}, `Пауза ${fmtTime(p.duration_ms, false)} ${after}`),
    h("p", { class: "hint" }, `#${n} · началась на ${fmtTime(p.start_ms, false)}`,
      p.had_errors ? " · на доске были ошибки (отмечены красным), ходы найдены для позиции без них" : ""),
    h("div", { class: "pause" }, boardEl,
      p.steps.length ? h("ul", { class: "steps" }, items.map(b => h("li", {}, b)))
        : h("p", { class: "hint" }, "Простых ходов (одиночки, пересечения, пары) в этой позиции не было — нужна техника посложнее.")));
  show();
  return card;
}

export function mount(el, [id]) {
  const box = h("div", {}, h("p", { class: "hint" }, "Загрузка…"));
  el.append(box);
  Promise.all([getReview(id), getGame(id)]).then(([rv, full]) => {
    const g = rv.game;
    box.textContent = "";
    box.append(h("h1", {}, `Разбор партии #${g.id}`),
      h("section", {},
        h("h2", {}, statusLine(g)),
        h("p", { class: "hint" }, `${LEVEL_NAME[g.level] || g.level} · ${g.mode}`,
          g.mistake_limit !== null && g.mode === "original" ? ` · лимит ошибок ${g.mistake_limit}` : "",
          ` · ${dateRu(g.started_at)}`),
        metricsGrid(g),
        h("div", { class: "bar", style: "margin:0" },
          h("a", { class: "btn", href: "#/play" }, "Играть дальше"), h("a", { class: "btn", href: "#/stats" }, "Статистика"))));
    if (!full.moves.length) {
      box.append(h("section", { id: "noMoves" }, h("h2", {}, "Ходов нет"),
        h("p", { class: "hint", style: "margin:0" }, "Ходы этой партии не записаны (партия перенесена или брошена до первого хода), " +
          "поэтому разобрать паузы нельзя. Сыграй новую партию — каждая пауза будет разобрана.")));
      return;
    }
    if (!rv.pauses.length) {
      const places = full.moves.filter(m => m.kind === "place").length;
      box.append(h("section", { id: "noPauses" }, h("h2", {}, "Длинных пауз не было"),
        h("p", { style: "margin:0" }, `Отлично: ни одной паузы длиннее 20 с. Самая долгая — ${fmtTime(g.max_pause_ms, false)}, ` +
          `до первого хода — ${fmtTime(g.first_move_ms, false)}, ${places} ходов цифрами за ${fmtTime(g.time_ms, false)}. ` +
          "Так и держи темп.")));
      return;
    }
    box.append(h("h2", {}, `Длинные паузы (> 20 с): ${rv.pauses.length}`),
      h("p", { class: "hint" }, "Позиция на момент паузы. Зелёным — ход, который был доступен; зачёркнуты — кандидаты, которые " +
        "можно было убрать; жёлтым — группа (строка, столбец или блок). Нажми на шаг, чтобы показать его на доске."),
      ...rv.pauses.map((p, k) => pauseCard(p, g, k + 1)));
  }).catch(e => { box.textContent = ""; box.append(errorBox(e)); });
}
