// #/solve/{id}[/{at}] — the solution of a game position step by step, as on sudoku.coach: each solver step on a board
// of full candidates with its group, pattern and struck candidates, and the reasons behind it — which placed digit
// shuts which cell (arrows), which earlier step took a candidate out — and the move it opens. Any moment of the game
// is a start: [ ] walk the game's moves, ← → the solver's steps, Shift+← → the key steps (all but singles).
import { tr } from "./i18n.js";
import { gameAnalysis, getGame } from "./api.js";
import { COL, ROW, PEERS, cellName, createBoard, fmtTime, toDigits, unitCells } from "./board.js";
import { positions } from "./analysis.js";
import { LEVEL_NAME, STATUS_NAME, TIER_NAME, alignSideToBoard, errorBox, h, ignoreKey } from "./ui.js";

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const digitsOf = m => DIGITS.filter(v => m & (1 << v));
const SHORT = {
  naked_single: tr("Голая одиночка"),
  hidden_single_box: tr("Скрытая одиночка · блок"),
  hidden_single_row: tr("Скрытая одиночка · строка"),
  hidden_single_col: tr("Скрытая одиночка · столбец"),
  pointing: "Pointing",
  claiming: "Claiming",
  naked_pair: tr("Голая пара"),
  hidden_pair: tr("Скрытая пара"),
  x_wing: "X-Wing",
  y_wing: "Y-Wing",
  x_chain: "X-Chain",
  aic: tr("Цепочка"),
  solution: tr("Цифра из решения"),
};
const TIERS = { ...TIER_NAME, 5: tr("Вне техник тренажёра") };
const PLAY_MS = 1100;

function unitLabel(u) {
  const n = (u % 9) + 1;
  return u < 9 ? tr("строка {n}", { n }) : u < 18 ? tr("столбец {n}", { n }) : tr("блок {n}", { n });
}
function inUnit(u) {
  const n = (u % 9) + 1;
  return u < 9 ? tr("в строке {n}", { n }) : u < 18 ? tr("в столбце {n}", { n }) : tr("в блоке {n}", { n });
}
const boxOf = i => 18 + Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);
/** The unit two peers share, lines first. */
const sharedUnit = (a, b) => (ROW(a) === ROW(b) ? ROW(a) : COL(a) === COL(b) ? 9 + COL(a) : boxOf(a));
const cellsText = cells => cells.map(cellName).join(", ");

/** «r3c5 = 7» for a placement; «✕4 r1c2, r1c3» per digit for eliminations. */
function moveText(s) {
  if (s.cell !== null) return `${cellName(s.cell)} = ${s.value}`;
  const by = new Map();
  for (const [c, v] of s.eliminations) by.set(v, [...(by.get(v) || []), c]);
  return [...by].map(([v, cs]) => `✕${v} ${cellsText(cs)}`).join("; ");
}

/** The digits a step is about: the placed one, the eliminated one, the pair, the three of a Y-Wing. */
function stepDigits(s) {
  if (s.cell !== null) return [s.value];
  const [a, b] = s.pattern;
  if (s.technique === "naked_pair") return digitsOf(s.cands[a]);
  if (s.technique === "hidden_pair") {
    const out = new Set(s.eliminations.map(([, v]) => v));
    return digitsOf(s.cands[a] & s.cands[b]).filter(v => !out.has(v)).slice(0, 2);
  }
  if (s.technique === "y_wing") return [...new Set(s.pattern.flatMap(c => digitsOf(s.cands[c])))].sort();
  return [...new Set(s.eliminations.map(([, v]) => v))];
}

/** The two base lines of an X-Wing: the ones whose cover the eliminations sit on. */
function xwingBase(s) {
  const rows = [...new Set(s.pattern.map(ROW))].sort(), cols = [...new Set(s.pattern.map(COL))].sort();
  const byRows = s.eliminations.every(([c]) => cols.includes(COL(c)));
  return byRows ? rows : cols.map(c => 9 + c);
}

export function mount(el, [id, atArg], query) {
  const box = h("div", {}, h("p", { class: "hint" }, tr("Загрузка…")));
  el.append(box);
  let gone = false, dispose = null;
  getGame(id).then(game => {
    if (gone) return;
    box.remove();
    if (game.status === "active") {
      el.append(h("section", { id: "solveActive" }, h("h1", {}, tr("Разбор решения")),
        h("p", {}, tr("Партия #{id} ещё идёт — разбор откроется, когда она закончится. Застрял — на доске есть подсказка (H).", { id: game.id })),
        h("a", { class: "btn", href: "#/play" }, tr("К партии"))));
      return;
    }
    dispose = build(el, game, /^\d+$/.test(atArg ?? "") ? +atArg : null, Math.trunc(+query.step) || 0);
  }).catch(e => { box.textContent = ""; box.append(errorBox(e)); });
  return () => { gone = true; dispose?.(); };
}

function build(el, game, atArg, stepArg) {
  const pos = positions(game.givens, game.moves);
  const given = toDigits(game.givens).map(Boolean);
  const clampAt = i => Math.max(0, Math.min(pos.length - 1, i));
  let at = clampAt(atArg ?? (game.status === "solved" ? 0 : pos.length - 1));
  let unsolved = false, steps = [], boards = [], wrong = [], placeStep = new Map(), N = 0, k = 0, want = stepArg;
  let groups = [], open = new Set([0]), hover = null, focus = false, arrows = true, keysOnly = false;
  let timer = null, loading = true, loaded = null, note = "", gone = false, scrub = null;
  const cache = new Map();

  // ---- skeleton -------------------------------------------------------------------------------------------------
  const boardEl = h("div", { id: "svBoard" });
  const board = createBoard(boardEl, { onCell: i => { if (placeStep.has(i)) go(placeStep.get(i)); } });
  const btn = (label, title, fn, id) => h("button", { type: "button", title, "aria-label": title, onclick: fn, id }, label);
  const range = h("input", { type: "range", min: 0, max: pos.length - 1, value: at, id: "svMomentRange",
    "aria-label": tr("Момент партии"), oninput: () => { clearTimeout(scrub); scrub = setTimeout(() => setAt(+range.value), 120); } });
  const momentText = h("span", { class: "sv-moment-text", id: "svMoment" });
  const nextMove = h("p", { class: "hint sv-next", id: "svNextMove" });
  const timeline = h("div", { class: "sv-timeline", id: "svTimeline", "aria-hidden": "true",
    onclick: e => { const t = e.target.closest("[data-k]"); if (t) go(+t.dataset.k); } });
  const playBtn = btn("▶", tr("Автопроигрывание (Пробел)"), () => toggleAuto(), "svAuto");
  const count = h("span", { class: "sv-count", id: "svCount" });
  const focusBox = h("input", { type: "checkbox", id: "svFocus", onchange: () => { focus = focusBox.checked; show(false); } });
  const arrowBox = h("input", { type: "checkbox", id: "svArrows", checked: true, onchange: () => { arrows = arrowBox.checked; show(false); } });
  const keysBox = h("input", { type: "checkbox", id: "svKeys", onchange: () => { keysOnly = keysBox.checked; list.classList.toggle("keys", keysOnly); centerList(); } });
  const card = h("section", { class: "sv-card", id: "svCard", "aria-live": "polite" });
  const summary = h("div", { class: "chips sv-summary", id: "svSummary" });
  const list = h("ol", { class: "sv-steps", id: "svSteps" });
  const msg = h("p", { class: "msg", id: "svMsg", role: "status" });

  const meta = [LEVEL_NAME[game.level] || game.level, game.mode, STATUS_NAME[game.status] || game.status].join(" · ");
  const swatch = (cls, label) => h("span", {}, h("i", { class: `sw ${cls}` }), label);
  // Narrow screens flatten both columns (display: contents) and order the pieces: board, steps, card, then the rest.
  const layout = h("div", { class: "layout sv-layout", id: "solver" },
    h("div", { class: "main-col" },
      h("div", { class: "sv-title" },
        h("div", { class: "bar", style: "margin:0;flex-wrap:nowrap" },
          h("h1", { style: "margin:0" }, tr("Разбор решения")),
          h("a", { class: "hint", href: `#/review/${game.id}`, style: "margin:0 0 0 auto;flex:none" }, tr("← к партии"))),
        h("p", { class: "hint", style: "margin:2px 0 0" }, `#${game.id} · ${meta}`)),
      boardEl, timeline,
      h("div", { class: "sv-nav" },
        btn("⏮", tr("К первому шагу (Home)"), () => go(0), "svFirst"), btn("←", tr("Шаг назад (←)"), () => go(k - 1), "svPrev"),
        playBtn, btn("→", tr("Шаг вперёд (→)"), () => go(k + 1), "svNext"), btn("⏭", tr("К решённой доске (End)"), () => go(N), "svLast"),
        count),
      h("div", { class: "bar sv-toggles" },
        h("label", { class: "check" }, focusBox, tr("Только цифры шага"), h("kbd", {}, "F")),
        h("label", { class: "check" }, arrowBox, tr("Стрелки причин"), h("kbd", {}, "L"))),
      h("p", { class: "sv-legend", id: "svLegend" },
        swatch("unit", tr("группа")), swatch("key", tr("узор")), swatch("ans", tr("ответ")), swatch("hit", tr("убираем")),
        swatch("src", tr("мешающая цифра")), swatch("same", tr("та же цифра"))),
      h("section", { class: "sv-moment" },
        h("h2", {}, tr("Момент партии")),
        h("div", { class: "bar", style: "margin:0;flex-wrap:nowrap" },
          btn("⏮", tr("Начало партии"), () => setAt(0)), btn("‹", tr("Ход партии назад ([)"), () => setAt(at - 1)),
          range, btn("›", tr("Ход партии вперёд (])"), () => setAt(at + 1)), btn("⏭", tr("Где партия закончилась"), () => setAt(pos.length - 1))),
        momentText, nextMove),
      msg),
    h("div", { class: "sv-side" },
      card,
      h("section", { class: "sv-list" },
        h("div", { class: "bar", style: "justify-content:space-between;margin-bottom:6px" },
          h("h2", { style: "margin:0" }, tr("Все шаги")),
          h("label", { class: "check" }, keysBox, tr("Только ключевые"), h("kbd", {}, "K"))),
        list),
      h("section", { class: "sv-tech" }, h("h2", {}, tr("Техники решения")), summary),
      h("p", { class: "hint sv-keys" },
        h("kbd", {}, "←"), " ", h("kbd", {}, "→"), tr(" шаг · "), h("kbd", {}, "Shift"), "+", h("kbd", {}, "←"), " ", h("kbd", {}, "→"),
        tr(" ключевой шаг · "), h("kbd", {}, "["), " ", h("kbd", {}, "]"), tr(" ход партии · "), h("kbd", {}, tr("Пробел")),
        tr(" авто · клик по клетке — шаг, который её решает · "), h("kbd", {}, "Esc"), tr(" — к партии"))));
  el.append(layout);
  const unalign = alignSideToBoard(layout);

  // ---- data -----------------------------------------------------------------------------------------------------
  function setAt(i) {
    i = clampAt(i);
    range.value = i;
    if (i === at && loaded === pos[at].board.join("")) return;
    at = i;
    stopAuto();
    want = 0;
    load();
  }

  async function load() {
    const key = pos[at].board.join("");
    renderMoment();
    if (!cache.has(key)) cache.set(key, gameAnalysis(game.id, key));
    loading = true; note = "";
    layout.classList.add("loading");
    try {
      const r = await cache.get(key);
      if (gone || pos[at].board.join("") !== key) return;
      setData(r);
    } catch (e) {
      cache.delete(key);
      if (gone || pos[at].board.join("") !== key) return;
      note = e.message;
      steps = []; N = 0; k = 0; loaded = null; loading = false;
      buildTimeline(); buildList(); summary.textContent = "";
      show();
    } finally {
      if (pos[at].board.join("") === key) { loading = false; layout.classList.remove("loading"); }
    }
  }

  function setData(r) {
    loaded = pos[at].board.join("");
    steps = r.line; N = steps.length; wrong = r.wrong_cells;
    boards = [pos[at].board.map((v, i) => (wrong.includes(i) ? 0 : v))];
    for (const s of steps) {
      const b = boards[boards.length - 1].slice();
      if (s.cell !== null) b[s.cell] = s.value;
      boards.push(b);
    }
    placeStep = new Map(steps.flatMap((s, j) => (s.cell === null ? [] : [[s.cell, j]])));
    buildTimeline(); buildList(); buildSummary();
    k = Math.max(0, Math.min(N, (want || 1) - 1));
    want = 0;
    unsolved = !r.solved;
    loading = false;
    show();
  }

  // ---- reasons --------------------------------------------------------------------------------------------------
  /** Why digit v is not a candidate of empty cell c before step j: a placed peer (lines first, then the nearest), an
   *  earlier step that struck it, or it was out before the walkthrough began. */
  function whyNot(j, c, v) {
    const b = boards[j];
    let from = null, best = Infinity;
    for (const p of PEERS[c]) {
      if (b[p] !== v) continue;
      const score = (ROW(p) === ROW(c) || COL(p) === COL(c) ? 0 : 20) + Math.abs(ROW(p) - ROW(c)) + Math.abs(COL(p) - COL(c));
      if (score < best) { best = score; from = p; }
    }
    if (from !== null) return { cell: c, digit: v, from, unit: sharedUnit(from, c) };
    for (let i = j - 1; i >= 0; i--)
      if (steps[i].eliminations.some(([x, w]) => x === c && w === v)) return { cell: c, digit: v, step: i };
    return { cell: c, digit: v };
  }

  const emptyIn = (j, cells, skip) => cells.filter(c => !boards[j][c] && !skip.includes(c));
  /** «Why only here» for one digit in a unit: every other empty cell of the unit and what shuts it. */
  const digitGroup = (j, v, u, here) => ({
    mode: "cells",
    title: tr("Почему {v} {unit} — только {cells}", { v, unit: inUnit(u), cells: cellsText(here) }),
    filled: unitCells(u).filter(c => boards[j][c]).length,
    items: emptyIn(j, unitCells(u), here).map(c => whyNot(j, c, v)),
  });
  /** «Why only these digits» for one cell: what shuts each of the other digits. */
  const cellGroup = (j, c, keep) => ({
    mode: "digits",
    title: tr("Почему в {cell} только {list}", { cell: cellName(c), list: keep.join(", ") }),
    items: DIGITS.filter(v => !keep.includes(v)).map(v => whyNot(j, c, v)),
  });

  function reasonsFor(j) {
    const s = steps[j], t = s.technique;
    if (t === "naked_single") return [cellGroup(j, s.cell, [s.value])];
    if (t.startsWith("hidden_single")) return [digitGroup(j, s.value, s.unit, [s.cell])];
    if (t === "pointing" || t === "claiming") return [digitGroup(j, s.eliminations[0][1], s.unit, s.pattern)];
    if (t === "naked_pair" || t === "y_wing") return s.pattern.map(c => cellGroup(j, c, digitsOf(s.cands[c])));
    if (t === "hidden_pair") return stepDigits(s).map(v => digitGroup(j, v, s.unit, s.pattern));
    if (t === "x_wing") {
      const v = s.eliminations[0][1];
      return xwingBase(s).map(u => digitGroup(j, v, u, s.pattern.filter(c => unitCells(u).includes(c))));
    }
    return [];
  }

  /** The first single that relies on an elimination step: its own «why» cites that step. */
  function opens(j) {
    if (steps[j].cell !== null) return null;
    for (let i = j + 1; i < N; i++)
      if (steps[i].cell !== null && steps[i].technique !== "solution" && reasonsFor(i).some(g => g.items.some(r => r.step === j))) return i;
    return null;
  }

  // ---- render ---------------------------------------------------------------------------------------------------
  function renderMoment() {
    const m = pos[at].move;
    momentText.textContent = m
      ? tr("Старт разбора: после хода {n} из {total} ({move})", { n: at, total: pos.length - 1,
        move: m.kind === "place" ? `${cellName(m.cell)}=${m.value}` : m.kind === "erase" ? `${cellName(m.cell)} ✕` : `↶ ${cellName(m.cell)}` })
      : tr("Старт разбора: начальная позиция");
    const nx = pos[at + 1]?.move;
    nextMove.textContent = "";
    if (nx?.kind === "place") {
      const dt = nx.t_ms - (m?.t_ms ?? 0);
      nextMove.append(tr("В партии дальше ты поставил {move} через {t}", { move: `${cellName(nx.cell)}=${nx.value}`, t: fmtTime(dt, false) }),
        nx.correct === 0 ? h("b", { class: "bad-text" }, " — " + tr("неверно")) : "");
    }
  }

  function buildTimeline() {
    timeline.textContent = "";
    steps.forEach((s, j) => timeline.append(h("span", { "data-k": j, class: `t${s.tier}${s.cell === null ? " el" : ""}`,
      title: `${j + 1}. ${SHORT[s.technique] || s.title} · ${moveText(s)}` })));
    timeline.hidden = !N;
  }

  function buildList() {
    list.textContent = "";
    const nx = pos[at + 1]?.move, mine = nx?.kind === "place" ? placeStep.get(nx.cell) : undefined;
    steps.forEach((s, j) => list.append(h("li", { class: `t${s.tier}` },
      h("button", { type: "button", "data-k": j, onclick: () => go(j), title: `${j + 1}. ${s.title} · ${moveText(s)}` },
        h("span", { class: "n" }, j + 1), h("span", { class: "dot" }), h("span", { class: "tq" }, SHORT[s.technique] || s.title),
        j === mine ? h("span", { class: "you", title: tr("клетка твоего следующего хода в партии") }, tr("твой ход")) : null,
        h("span", { class: "mv" }, moveText(s))))));
    if (N) list.append(h("li", { class: "t0" }, h("button", { type: "button", "data-k": N, onclick: () => go(N) },
      h("span", { class: "n" }, "✓"), h("span", { class: "tq" }, tr("Решено")))));
  }

  function buildSummary() {
    summary.textContent = "";
    const counts = new Map();
    for (const s of steps) counts.set(s.technique, (counts.get(s.technique) || 0) + 1);
    const order = Object.keys(SHORT).filter(t => counts.has(t));
    const top = Math.max(0, ...steps.map(s => s.tier));
    if (!N) { summary.append(h("p", { class: "hint", style: "margin:0" }, tr("Позиция уже решена."))); return; }
    summary.append(h("p", { class: "hint", style: "margin:0 0 6px;width:100%" },
      tr("Шагов: {n}, из них ключевых: {keys}. Самая трудная ступень — {tier}.",
        { n: N, keys: steps.filter(s => s.tier > 1).length, tier: TIERS[top] })));
    for (const t of order) {
      const tier = steps.find(s => s.technique === t).tier;
      summary.append(h("button", { type: "button", class: `tag t${tier}`, title: tr("К следующему шагу этой техники"),
        onclick: () => { const all = steps.map((s, j) => (s.technique === t ? j : -1)).filter(j => j >= 0);
          go(all.find(j => j > k) ?? all[0]); } }, `${SHORT[t]} × ${counts.get(t)}`));
    }
  }

  function renderBoard() {
    const s = k < N ? steps[k] : null, b = boards[k] || pos[at].board;
    const elims = new Map(), unit = new Set(), pat = new Set(s?.pattern || []), src = new Set(), keys = new Map();
    for (const [c, v] of s?.eliminations || []) elims.set(c, [...(elims.get(c) || []), v]);
    if (s?.unit !== null && s?.unit !== undefined) unitCells(s.unit).forEach(c => unit.add(c));
    if (s?.technique === "x_wing") xwingBase(s).forEach(u => unitCells(u).forEach(c => unit.add(c)));
    const sd = s ? stepDigits(s) : [];
    if (s) for (const c of pat) keys.set(c, s.technique === "y_wing" || s.technique === "naked_pair" ? digitsOf(s.cands[c]) : sd);
    const zWing = s?.technique === "y_wing" ? s.eliminations[0][1] : 0;
    const links = [];
    if (s && arrows) groups.forEach((g, gi) => {
      if (!open.has(gi)) return;
      g.items.forEach((r, ri) => {
        if (r.from === undefined) return;
        src.add(r.from);
        links.push({ from: r.from, to: r.cell, on: hover === `${gi}:${ri}` });
      });
    });
    const prev = k > 0 ? steps[k - 1] : null, just = prev?.cell ?? -1;
    const focusSet = new Set([...sd, ...(s?.eliminations || []).map(([, v]) => v)]);
    board.render({
      values: b, given, highlight: true, digit: sd.length === 1 ? sd[0] : 0, links,
      notes: i => (b[i] || !s ? null : digitsOf(s.cands[i]).filter(v => !focus || focusSet.has(v))),
      candClass: (i, v) => (elims.get(i)?.includes(v) ? "c-x" : s?.cell === i && v === s.value ? "c-ok"
        : pat.has(i) && i !== s.pattern[0] && v === zWing ? "c-alt" : keys.get(i)?.includes(v) ? "c-key" : ""),
      cellClass: i => [unit.has(i) ? "unit" : "", pat.has(i) && s?.cell !== i ? "key" : "", s?.cell === i ? "ans" : "",
        elims.has(i) ? "hit" : "", src.has(i) ? "src" : "", i === just ? "just" : "", wrong.includes(i) && k === 0 ? "was-bad" : ""].filter(Boolean),
    });
  }

  function reasonItem(g, r, gi, ri) {
    const key = `${gi}:${ri}`;
    const head = g.mode === "cells" ? cellName(r.cell) : String(r.digit);
    let body;
    if (r.from !== undefined) {
      body = g.mode === "cells"
        ? tr("{v} уже стоит {unit} — {cell}", { v: r.digit, unit: inUnit(r.unit), cell: cellName(r.from) })
        : tr("стоит {unit} — {cell}", { unit: inUnit(r.unit), cell: cellName(r.from) });
    } else if (r.step !== undefined) {
      body = h("span", {}, g.mode === "cells" ? tr("{v} убрана шагом ", { v: r.digit }) : tr("убрана шагом "),
        h("button", { type: "button", class: "ref", onclick: () => go(r.step) }, `${r.step + 1} · ${SHORT[steps[r.step].technique]}`));
    } else {
      body = tr("убрана ещё до начала разбора");
    }
    return h("li", { "data-key": key, class: r.from === undefined ? "" : "arrow",
      onmouseenter: () => { hover = key; renderBoard(); }, onmouseleave: () => { hover = null; renderBoard(); } },
      h("b", {}, head), " — ", body);
  }

  function renderCard() {
    card.textContent = "";
    if (loading && !N) { card.append(h("p", { class: "hint" }, tr("Считаю…"))); return; }
    if (note && !N) { card.append(h("p", { class: "hint" }, tr("Разбор не посчитан — выбери момент партии ещё раз."))); return; }
    if (!N || k >= N) {
      card.append(h("div", { class: "sv-head" }, h("span", { class: "sv-num" }, N ? tr("Шаг {n} / {n}", { n: N }) : ""),
        h("span", { class: "tag t0" }, tr("Решено"))),
        h("p", { class: "sv-move" }, unsolved ? tr("Разбор оборвался после {n} шагов.", { n: N }) : N ? tr("Доска решена за {n} шагов.", { n: N }) : tr("Позиция уже решена.")),
        N ? h("p", { class: "hint", style: "margin:0" }, tr("Листай назад (←) или кликни клетку — откроется шаг, который её решил.")) : null);
      return;
    }
    const s = steps[k], nx = opens(k);
    card.append(
      h("div", { class: "sv-head" }, h("span", { class: "sv-num" }, tr("Шаг {n} / {total}", { n: k + 1, total: N })),
        h("span", { class: `tag t${s.tier}` }, s.title),
        s.theory ? h("a", { class: "hint sv-theory", href: `#/theory/${s.theory}` }, tr("Теория →")) : null),
      h("p", { class: "sv-move", id: "svMove" }, s.cell !== null ? tr("Ставим {move}", { move: moveText(s) }) : tr("Убираем кандидатов: {move}", { move: moveText(s) })),
      h("p", { class: "sv-expl", id: "svExpl" }, s.explanation));
    if (unsolved && k === N - 1)
      card.append(h("p", { class: "hint" }, tr("Дальше разбор обрывается: слишком длинная линия решения.")));
    if (k === 0 && wrong.length)
      card.append(h("p", { class: "hint" }, tr("Неверные цифры партии ({cells}) убраны — разбор идёт без них.", { cells: cellsText(wrong) })));
    if (s.technique === "solution")
      card.append(h("p", { class: "hint" }, tr("Техники тренажёра (одиночки, пересечения, пары, X-Wing, Y-Wing) и короткие цепочки здесь хода не дают: " +
        "нужен перебор или техника сложнее. Цифра взята из решения, чтобы разбор шёл дальше.")));
    if (groups.length) {
      const why = h("div", { class: "sv-why", id: "svWhy" }, h("h3", {}, tr("Почему так")),
        arrows && groups.some(g => g.items.some(r => r.from !== undefined))
          ? h("p", { class: "hint", style: "margin:0 0 4px" }, tr("Стрелка идёт от мешающей цифры к клетке; наведи на строку — её стрелка станет ярче.")) : null);
      groups.forEach((g, gi) => {
        const d = h("details", { open: open.has(gi) },
          h("summary", {}, g.title),
          g.items.length ? h("ul", {}, g.items.map((r, ri) => reasonItem(g, r, gi, ri)))
            : h("p", { class: "hint", style: "margin:4px 0 0" }, tr("Других свободных клеток нет.")),
          g.filled ? h("p", { class: "hint", style: "margin:4px 0 0" }, tr("Ещё {n} клеток здесь уже заняты.", { n: g.filled })) : null);
        d.addEventListener("toggle", () => { if (d.open) open.add(gi); else open.delete(gi); renderBoard(); });
        why.append(d);
      });
      card.append(why);
    }
    if (nx !== null)
      card.append(h("p", { class: "sv-opens", id: "svOpens" }, tr("Это исключение понадобится → "),
        h("button", { type: "button", class: "ref", onclick: () => go(nx) }, tr("шаг {n}: {move}", { n: nx + 1, move: moveText(steps[nx]) }))));
  }

  function updateMarks() {
    for (const t of timeline.children) { const j = +t.dataset.k; t.classList.toggle("on", j === k); t.classList.toggle("ahead", j > k); }
    for (const b of list.querySelectorAll("button[data-k]")) {
      const on = +b.dataset.k === k;
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    }
    centerList();
    count.textContent = N ? `${Math.min(k + 1, N)} / ${N}` : "";
    for (const [id, off] of [["svFirst", k <= 0], ["svPrev", k <= 0], ["svNext", k >= N], ["svLast", k >= N]])
      layout.querySelector(`#${id}`).disabled = off;
    playBtn.disabled = k >= N;
    msg.textContent = note; msg.className = "msg" + (note ? " bad" : "");
  }

  function centerList() {  // centre it in the list only; scrollIntoView would move the page too
    const on = list.querySelector("button.on");
    if (on && on.offsetParent) list.scrollTop = on.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - (list.clientHeight - on.offsetHeight) / 2;
  }

  function syncUrl() {
    const url = `#/solve/${game.id}/${at}${k ? `?step=${k + 1}` : ""}`;
    if (location.hash !== url) history.replaceState(null, "", url);
  }

  /** fresh: a new step — its reasons are rebuilt, every group open. */
  function show(fresh = true) {
    if (fresh) { groups = k < N ? reasonsFor(k) : []; open = new Set(groups.keys()); }
    hover = null;
    renderBoard(); renderCard(); updateMarks(); syncUrl();
  }

  function go(j) {
    if (!N && j) return;
    const next = Math.max(0, Math.min(N, j));
    if (next === k && groups.length) return;
    k = next;
    if (k >= N) stopAuto();
    show();
  }
  /** The next (d = 1) or previous key step — anything harder than a single. */
  function goKey(d) {
    for (let j = k + d; j >= 0 && j < N; j += d) if (steps[j].tier > 1) return go(j);
    go(d > 0 ? N : 0);
  }

  function stopAuto() { clearInterval(timer); timer = null; playBtn.textContent = "▶"; playBtn.classList.remove("on"); }
  function toggleAuto() {
    if (timer) return stopAuto();
    if (k >= N) return;
    playBtn.textContent = "⏸"; playBtn.classList.add("on");
    timer = setInterval(() => (k >= N - 1 ? (go(N), stopAuto()) : go(k + 1)), PLAY_MS);
  }

  const onKey = e => {
    if (e.ctrlKey || e.metaKey || e.altKey || ignoreKey(e)) return;
    if (e.target.closest?.("button, a, input, select, textarea, summary") && (e.code === "Space" || e.key === "Enter")) return;
    if (e.target.type === "range" && /^(Arrow|Home|End|Page)/.test(e.key)) return;  // the slider walks the game itself
    if (e.key === "ArrowRight") e.shiftKey ? goKey(1) : go(k + 1);
    else if (e.key === "ArrowLeft") e.shiftKey ? goKey(-1) : go(k - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(N);
    else if (e.code === "BracketRight") setAt(at + 1);  // by code: on the Russian layout these keys type х and ъ
    else if (e.code === "BracketLeft") setAt(at - 1);
    else if (e.code === "Space") toggleAuto();
    else if (e.code === "KeyF") { focusBox.checked = focus = !focus; show(false); }
    else if (e.code === "KeyL") { arrowBox.checked = arrows = !arrows; show(false); }
    else if (e.code === "KeyK") { keysBox.checked = keysOnly = !keysOnly; list.classList.toggle("keys", keysOnly); centerList(); }
    else if (e.key === "Escape") { if (timer) stopAuto(); else location.hash = `#/review/${game.id}`; e.stopPropagation(); }  // not app.js's Esc
    else return;
    e.preventDefault();
  };
  window.addEventListener("keydown", onKey, true);

  renderCard();
  load();
  return () => { gone = true; stopAuto(); clearTimeout(scrub); unalign(); window.removeEventListener("keydown", onKey, true); };
}
