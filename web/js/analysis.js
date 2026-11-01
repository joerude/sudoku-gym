// Analysis on #/review/{id}, as on lichess: the game's moves (?? a wrong digit, ?! a long pause with a move available),
// any position on the board, the hint ladder for it (H), and a branch played on from there: a right digit or the
// solver's next step (Space). Esc goes back to the game's own moves.
import { tr } from "./i18n.js";
import { gameAnalysis } from "./api.js";
import { PEERS, cellName, createBoard, toDigits } from "./board.js";
import { ladderText, ladderView } from "./ladder.js";
import { h, ignoreKey } from "./ui.js";

const bit = v => 1 << v;
const digits = m => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(v => m & bit(v));
const keyOf = ({ board, cands }) => board.join("") + (cands ? `:${cands.join(",")}` : "");

/** The start and the position after every place / erase / undo: [{board, move}] (move null for the start). */
export function positions(givens, moves) {
  const fixed = toDigits(givens).map(Boolean);
  let board = toDigits(givens);
  const out = [{ board, move: null }];
  for (const m of [...moves].sort((a, b) => a.seq - b.seq)) {
    if (!["place", "erase", "undo"].includes(m.kind) || m.cell === null || fixed[m.cell]) continue;
    board = board.slice();
    board[m.cell] = m.kind === "erase" ? 0 : m.value || 0;
    out.push({ board, move: m });
  }
  return out;
}

/** Board and candidate masks after a placement and/or eliminations. */
function applyStep(board, cands, cell, value, elims = []) {
  const b = board.slice(), c = cands ? cands.slice() : null;
  if (cell !== null && cell !== undefined) {
    b[cell] = value;
    if (c) { c[cell] = 0; for (const p of PEERS[cell]) c[p] &= ~bit(value); }
  }
  if (c) for (const [x, v] of elims) c[x] &= ~bit(v);
  return { board: b, cands: c };
}

function moveLabel(m) {
  const at = cellName(m.cell);
  if (m.kind === "place") return `${at}=${m.value}`;
  if (m.kind === "erase") return `${at} ✕`;
  return `↶ ${at}${m.value ? `=${m.value}` : ""}`;
}

/** analysisSection(game, moves, pauses) → {el, dispose}. game: the review's game (givens, solution, status, id). */
export function analysisSection(game, moves, pauses) {
  const pos = positions(game.givens, moves);
  const given = toDigits(game.givens).map(Boolean), sol = toDigits(game.solution);
  // ?! — the place that ended a long pause in which a step was available
  const slow = new Set(pauses.filter(p => p.steps.length)
    .map(p => moves.find(m => m.kind === "place" && m.seq > p.after_seq)?.seq).filter(Boolean));
  let at = game.status === "solved" ? 0 : pos.length - 1;  // gave up or failed: where it stopped
  let branch = [];  // [{board, cands, label}] played on from pos[at]
  let bat = -1;     // index in branch; -1 = pos[at] itself
  let level = 0, sel = -1, showCands = false, note = "", data = null;
  const cache = new Map();

  const boardEl = h("div", { id: "anBoard" });
  const board = createBoard(boardEl, { onCell: i => { sel = i; render(); } });
  const list = h("div", { class: "an-moves", id: "anMoves" });
  const engine = h("div", { id: "anEngine" });
  const msg = h("p", { class: "msg", id: "anMsg", role: "status" });
  const nav = (label, title, fn) => h("button", { type: "button", class: "mini", title, onclick: fn }, label);
  const el = h("section", { id: "analysis" },
    h("h2", {}, tr("Анализ")),
    h("p", { class: "hint" }, tr("Листай ходы (← →), открывай подсказку к позиции (H) или играй дальше сам: верная цифра " +
      "уходит в вариант, Пробел — ход решателя, Esc — назад к партии, C — кандидаты.")),
    h("div", { class: "an-grid" }, boardEl,
      h("div", { class: "an-side" },
        h("div", { class: "bar", style: "margin:0" },
          nav("⏮", tr("К началу (Home)"), () => go(0)), nav("←", tr("Ход назад (←)"), () => step(-1)),
          nav("→", tr("Ход вперёд (→)"), () => step(1)), nav("⏭", tr("К концу (End)"), () => go(pos.length - 1))),
        list, engine, msg)));

  const cur = () => (bat >= 0 ? branch[bat] : { board: pos[at].board, cands: null });
  /** Where the solve line starts: the current position without its wrong digits, with the line's candidates. */
  const base = () => ({ board: cur().board.map((v, i) => (data.wrong_cells.includes(i) ? 0 : v)),
    cands: data.line[0]?.cands || cur().cands });

  async function load() {
    const want = keyOf(cur());
    if (!cache.has(want)) cache.set(want, gameAnalysis(game.id, cur().board.join(""), cur().cands));
    try {
      const r = await cache.get(want);
      if (keyOf(cur()) === want) { data = r; render(); }
    } catch (e) {
      cache.delete(want);
      if (keyOf(cur()) === want) { note = e.message; render(); }
    }
  }
  function moved() { level = 0; data = null; note = ""; sel = -1; render(); load(); }
  function go(i) { at = Math.max(0, Math.min(pos.length - 1, i)); branch = []; bat = -1; moved(); }
  function step(d) {
    if (!branch.length) return go(at + d);
    if (d > 0 && bat < branch.length - 1) bat++;
    else if (d < 0 && bat >= 0) bat--;
    else if (d < 0) return go(at - 1);
    else return;
    moved();
  }
  function push(next, label) { branch = [...branch.slice(0, bat + 1), { ...next, label }]; bat = branch.length - 1; moved(); }
  /** Space: the solver's next step (a placement or eliminations) into the branch. */
  function play() {
    const s = data?.line[0];
    if (!s) return;
    const b = base();
    push(applyStep(b.board, b.cands, s.cell, s.value, s.eliminations), s.cell === null ? `${s.title} ✂` : `${cellName(s.cell)}=${s.value}`);
  }
  /** A digit typed on the selected empty (or wrongly filled) cell: the right one goes into the branch, a wrong one is refused. */
  function put(v) {
    if (!data || sel < 0 || given[sel] || (cur().board[sel] && !data.wrong_cells.includes(sel))) return;
    if (sol[sel] !== v) { note = tr("{v} в {cell} не встаёт", { v, cell: cellName(sel) }); render(); return; }
    const b = base();
    push(applyStep(b.board, b.cands, sel, v), `${cellName(sel)}=${v}`);
  }
  const deeper = () => { if (data && level < data.next.max_level) { level++; render(); } };

  function renderList() {
    list.textContent = "";
    const item = (label, cls, on, onclick) => h("button", { type: "button", class: `an-move${cls ? ` ${cls}` : ""}${on ? " on" : ""}`, onclick }, label);
    pos.forEach((p, i) => {
      const m = p.move, mark = !m ? "" : m.kind === "place" && m.correct === 0 ? "??" : slow.has(m.seq) ? "?!" : "";
      list.append(item(m ? `${i}. ${moveLabel(m)}${mark}` : tr("начало"), mark === "??" ? "blunder" : mark ? "slow" : "",
        at === i && bat < 0, () => go(i)));
      if (at === i && branch.length) list.append(h("span", { class: "an-branch" }, "(",
        branch.map((x, j) => item(x.label, "", bat === j, () => { bat = j; moved(); })), ")"));
    });
    const on = list.querySelector(".an-move.on");  // centre it in the list only; scrollIntoView would move the page too
    if (on) list.scrollTop = on.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - (list.clientHeight - on.offsetHeight) / 2;
  }

  function renderEngine() {
    engine.textContent = "";
    if (!data) { engine.append(h("p", { class: "hint" }, note ? "" : tr("Считаю…"))); return; }
    const n = data.line.length, lad = data.next;
    const wrong = data.wrong_cells.length ? " " + tr("Неверные цифры ({cells}) он сначала убирает.", { cells: data.wrong_cells.map(cellName).join(", ") }) : "";
    engine.append(h("p", { class: "hint", id: "anLine" }, n ? tr("Шагов решателя до конца: {n}.", { n }) + wrong : tr("Позиция решена.")));
    if (level) engine.append(...ladderText(lad, level));
    engine.append(h("div", { class: "bar", style: "margin:0" },
      level < lad.max_level ? h("button", { type: "button", id: "anHint", onclick: deeper }, level ? tr("💡 Глубже (H)") : tr("💡 Подсказка (H)")) : null,
      n ? h("button", { type: "button", id: "anPlay", onclick: play }, tr("Сделать ход (Пробел)")) : null));
  }

  function render() {
    const b = cur().board, hv = data ? ladderView(data.next, level) : null;
    const wrong = new Set(data?.wrong_cells || []);
    const cands = data && (showCands || hv?.elims.size) ? data.line[0]?.cands || null : null;
    board.render({
      values: b, given, sel, highlight: true, digit: hv?.digit || 0, ghost: hv?.ghost,
      notes: i => (b[i] || !cands || !(showCands || hv?.elims.has(i)) ? null : digits(cands[i])),
      candClass: (i, v) => (hv?.elims.get(i)?.includes(v) ? "c-x" : ""),
      cellClass: i => [wrong.has(i) ? "bad" : "", ...(hv ? hv.cellClass(i) : [])].filter(Boolean),
    });
    renderList();
    renderEngine();
    msg.textContent = note;
    msg.className = "msg" + (note ? " bad" : "");
  }

  const onKey = e => {
    if (e.ctrlKey || e.metaKey || e.altKey || ignoreKey(e)) return;
    if (e.target.closest?.("button, a, input, select, textarea, summary") && (e.code === "Space" || e.key === "Home" || e.key === "End")) return;
    const d = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (d) put(+d[1]);
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(pos.length - 1);
    else if (e.code === "KeyH") deeper();
    else if (e.code === "Space") play();
    else if (e.code === "KeyC") { showCands = !showCands; render(); }
    else if (e.key === "Escape" && branch.length) { branch = []; bat = -1; moved(); e.stopPropagation(); }  // not app.js's Esc
    else return;
    e.preventDefault();
  };
  window.addEventListener("keydown", onKey, true);
  moved();
  return { el, dispose: () => window.removeEventListener("keydown", onKey, true) };
}
